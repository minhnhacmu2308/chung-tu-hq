import { beforeEach, describe, expect, it } from "vitest";
import type { DeclarationStatus, DocKind } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { ProgressEvent } from "../../../dossier/index.js";
import type { DeclarationPayload } from "../../domain/declaration-to-fpt.js";
import type { CustomsDeps, CustomsDossierPort, DeclarationReader, DossierBrief } from "../customs-ports.js";
import { getSubmission, listCustomsDeclarations } from "../get-submission.js";
import { markOutboxFailed, reopenDeclaration } from "../reopen-declaration.js";
import { domainError } from "../../../../shared/errors.js";
import { pollStatus } from "../poll-status.js";
import { processOutbox } from "../process-outbox.js";
import { resendOperation } from "../resend-operation.js";
import { submitDeclaration } from "../submit-declaration.js";
import { FakeCustomsGateway, hashId } from "../test/fake-customs-gateway.js";
import { InMemoryCustomsUow } from "../test/in-memory-customs-uow.js";

const ORG = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_chau"), role: "DECLARANT" };
const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_v"), role: "VIEWER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };

const payload = (kind: "IDA" | "EDA" = "IDA"): DeclarationPayload => ({
  kind, direction: kind === "IDA" ? "NK" : "XK", currency: "USD", containers: ["SITU2246781"], adjustments: [],
  fields: { MA_LH: { value: "A11" }, CQHQ: { value: "03CE – HP" }, PTVC: { value: "2 – Biển" }, NNK_MST: { value: "0316789012" }, NNK_TEN: { value: "AN PHÁT" }, NNK_DC: { value: "Hải Phòng" }, NXK_MST: { value: "0316789012" }, NXK_TEN: { value: "HANSOL" }, NXK_DC: { value: "Changwon" }, MA_NUOC: { value: "KR" }, SO_VD: { value: "HPSEL2610078" }, SO_KIEN: { value: "48 PL" }, TRONG_LUONG: { value: "3860.5" }, KHO: { value: "03CCS01 – Kho" }, CANG_DO: { value: "VNHPH – Cảng Hải Phòng" }, CANG_XEP: { value: "KRPUS – Busan" }, PTVC_TEN: { value: "SITC" }, NGAY_DEN: { value: "2026-10-15" }, NGAY_DI: { value: "2026-10-15" }, SO_HD: { value: "HSP-1" }, NGAY_HD: { value: "2026-10-02" }, PT_TT: { value: "TTR – T/T" }, DK_GIA: { value: "FCA" }, MA_TT: { value: "USD" }, TONG_TG: { value: "20850" } },
  items: [{ lineNo: 1, description: "Vòng bi", quantity: "2000", unit: "PCE", unitPrice: "1.85", amount: "3700", origin: "KR", hsConfirmed: "8482.10.00", importDutyRate: "3", vatRate: "8", policyNote: null }],
});

class FakeDeclarations implements DeclarationReader {
  constructor(public status: DeclarationStatus = "APPROVED", public unconfirmedHs = 0, public kind: "IDA" | "EDA" = "IDA") {}
  readonly submitted: string[] = [];
  async get(_orgId: string, dossierId: string) {
    if (dossierId === "dos_none") return null;
    return { declarationId: "dec_1", version: 2, status: this.status, payload: payload(this.kind), unconfirmedHs: this.unconfirmedHs, estimatedTaxVnd: "58449312" };
  }
  async markSubmitted(_ctx: { orgId: string }, dossierId: string) {
    this.submitted.push(dossierId);
    this.status = "SUBMITTED";
  }
  readonly reopened: string[] = [];
  async markDraft(_ctx: { orgId: string }, dossierId: string) {
    this.reopened.push(dossierId);
    this.status = "DRAFT";
  }
  async listForCustoms() {
    return [{ dossierId: "dos_1", status: this.status, approvedAt: new Date("2026-10-14T02:00:00.000Z") }];
  }
}
class FakeDossiers implements CustomsDossierPort {
  readonly events: ProgressEvent[] = [];
  readonly patches: unknown[] = [];
  constructor(public rows: (DossierBrief & { orgId: string })[], public docs: { id: string; kind: DocKind; fileName: string; storageKey: string }[] = [{ id: "doc_1", kind: "INVOICE", fileName: "inv.pdf", storageKey: "k/inv.pdf" }]) {}
  async get(orgId: string, id: string) {
    const d = this.rows.find((x) => x.id === id && x.orgId === orgId);
    return d ? { ...d } : null;
  }
  async update(orgId: string, id: string, patch: Record<string, unknown>) {
    this.patches.push(patch);
    const d = this.rows.find((x) => x.id === id && x.orgId === orgId);
    if (d) Object.assign(d, patch);
  }
  async documents() {
    return this.docs;
  }
  async readFile() {
    return Buffer.from("%PDF");
  }
  async publish(_o: string, _d: string, e: ProgressEvent) {
    this.events.push(e);
  }
}

let uow: InMemoryCustomsUow;
let queue: InMemoryJobQueue;
let gateway: FakeCustomsGateway;
let decls: FakeDeclarations;
let dossiers: FakeDossiers;
let blockers: number;
let deps: CustomsDeps;
let notifier: RecordingNotifier;
const D = "dos_1";

beforeEach(() => {
  uow = new InMemoryCustomsUow();
  queue = new InMemoryJobQueue();
  gateway = new FakeCustomsGateway({ clearAfterPolls: 2 });
  decls = new FakeDeclarations();
  dossiers = new FakeDossiers([{ id: D, orgId: ORG, code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: new Date("2026-10-14T02:00:00.000Z") }]);
  blockers = 0;
  notifier = new RecordingNotifier();
  deps = {
    notify: notifier,
    uow, queue, gateway, declarations: decls, dossiers, validation: { blockerFails: async () => blockers }, certificates: { exists: async (_o, id) => id === "cert_1" },
    pollDelayMs: 10, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

/** Chạy hết job customs-send/poll đang xếp hàng (worker giả). */
async function drain(max = 20) {
  for (let i = 0; i < max; i++) {
    const job = queue.jobs.shift();
    if (!job) return;
    const p = job.payload as Record<string, string | number>;
    if (job.name === "customs-send") await processOutbox(deps, { orgId: String(p["orgId"]), userId: String(p["userId"]), outboxId: String(p["outboxId"]) });
    else if (job.name === "customs-poll") await pollStatus(deps, { orgId: String(p["orgId"]), userId: String(p["userId"]), dossierId: String(p["dossierId"]), attempt: Number(p["attempt"]) });
  }
}

describe("submitDeclaration", () => {
  it("guard: chưa duyệt → NOT_APPROVED; HS thiếu → HS_UNCONFIRMED; BLOCKER → BLOCKER_FAILED; không chứng thư → NO_CERT; VIEWER → FORBIDDEN; org khác → NOT_FOUND", async () => {
    decls.status = "DRAFT";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("NOT_APPROVED");
    decls.status = "APPROVED";
    decls.unconfirmedHs = 1;
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("HS_UNCONFIRMED");
    decls.unconfirmedHs = 0;
    blockers = 1;
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("BLOCKER_FAILED");
    blockers = 0;
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_nope"))).toBe("NO_CERT");
    expect(errCode(await submitDeclaration(deps, viewer, D, "cert_1"))).toBe("FORBIDDEN");
    expect(errCode(await submitDeclaration(deps, other, D, "cert_1"))).toBe("NOT_FOUND");
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("hồ sơ không ở APPROVED (chưa duyệt / đã hủy) → không truyền dù tờ khai APPROVED", async () => {
    dossiers.rows[0]!.status = "NEEDS_REVIEW";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("NOT_APPROVED");
    dossiers.rows[0]!.status = "CANCELLED";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("INVALID_STATE");
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("truyền: outbox IDA + job + tờ khai/hồ sơ SUBMITTED; gọi lần 2 → ALREADY_SUBMITTED, vẫn 1 outbox", async () => {
    const r = unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.outbox).toHaveLength(1);
    expect(uow.data.outbox[0]).toMatchObject({ operation: "IDA", idempotencyKey: `${D}:IDA:v2`, status: "PENDING" });
    expect(queue.jobs[0]).toMatchObject({ name: "customs-send", payload: { outboxId: r.outboxId } });
    expect(decls.submitted).toEqual([D]);
    expect(dossiers.rows[0]).toMatchObject({ status: "SUBMITTED", step: "submit" });
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(uow.data.outbox).toHaveLength(1);
  });
});

describe("customs-send / poll", () => {
  it("IDA → IDC → HYS → IEX: số tờ khai, phân luồng, số tiếp nhận HYS, thông quan; nhật ký OUT/IN đủ; hồ sơ CLEARED", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.pipeline.map((p) => `${p.op}:${p.status}`)).toEqual(["IDA:OK", "IDC:OK", "HYS:OK", "IEX:OK"]);
    expect(v.result).toMatchObject({ declarationNo: gateway.declarationNoFor(D, "IDA"), channel: gateway.channelFor(D), clearanceStatus: "CLEARED" });
    expect(v.inProgress).toBe(false);
    expect(v.messages.map((m) => `${m.operation}/${m.direction}/${m.result}`)).toContain("HYS/IN/OK");
    expect(v.messages[0]!.payloadPreview).not.toContain("0316789012"); // MST đã che
    expect(uow.data.outbox.map((o) => `${o.operation}:${o.status}`)).toEqual(["IDA:SENT", "IDC:SENT", "HYS:SENT"]);
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
    expect(dossiers.rows[0]!.declarationNo).toBe(gateway.declarationNoFor(D, "IDA"));
    expect(uow.data.results[0]!.state).toBe("CLEARED");
    expect(notifier.sent.map((n) => n.draft.title)).toEqual([expect.stringMatching(/Luồng/), expect.stringMatching(/đã thông quan/)]);
    expect(notifier.sent[1]!.audience).toEqual({ dossierOwnerOf: D, roles: ["APPROVER"] });
    const rows = unwrap(await listCustomsDeclarations(deps, declarant));
    expect(rows[0]).toMatchObject({ dossierId: D, state: "CLEARED", declarationNo: gateway.declarationNoFor(D, "IDA") });
  });
  it("job chạy 2 lần cùng outbox → 1 thông điệp OUT; lỗi tạm của gateway → giữ PENDING, ném để retry; luồng vàng cần 2 lần hỏi", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const ob = uow.data.outbox[0]!.id;
    const boom = { ...gateway, preDeclare: async () => { throw new Error("FPT 503"); } } as unknown as FakeCustomsGateway;
    deps.gateway = boom;
    await expect(processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob })).rejects.toThrow(/503/);
    expect(uow.data.outbox[0]!.status).toBe("PENDING");
    expect(uow.data.messages.filter((m) => m.direction === "OUT")).toHaveLength(1);
    deps.gateway = gateway;
    await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob });
    await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob }); // đã SENT → bỏ qua
    expect(uow.data.messages.filter((m) => m.operation === "IDA" && m.direction === "OUT")).toHaveLength(1);
    expect(uow.data.messages.filter((m) => m.operation === "IDA" && m.direction === "IN" && m.result === "OK")).toHaveLength(1);
  });
  it("HYS lỗi lần đầu (hash%7==0) → SEND_FAILED giữ bước, pipeline ERROR; Gửi lại → tra IEX, outbox retry1, rồi OK", async () => {
    // Chọn id có hash % 7 == 0.
    let id = "dos_r";
    while (hashId(id) % 7 !== 0) id += "x";
    dossiers.rows.push({ id, orgId: ORG, code: "HS-NK-2610-099", direction: "NK", typeCode: "A11", partner: "X", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: new Date() });
    unwrap(await submitDeclaration(deps, declarant, id, "cert_1"));
    await drain();
    let v = unwrap(await getSubmission(deps, declarant, id));
    expect(v.pipeline.find((p) => p.op === "HYS")).toMatchObject({ status: "ERROR", summary: expect.stringMatching(/E-SIG-401/) });
    expect(uow.data.results.find((r) => r.dossierId === id)).toMatchObject({ state: "SEND_FAILED", raw: { progress: "DECLARED" } });
    const rs = unwrap(await resendOperation(deps, declarant, id, "HYS"));
    expect(rs.resent).toBe(true);
    expect(uow.data.outbox.filter((o) => o.dossierId === id && o.operation === "HYS").map((o) => o.idempotencyKey)).toEqual([`${id}:HYS:v2`, `${id}:HYS:v2:retry1`]);
    await drain();
    v = unwrap(await getSubmission(deps, declarant, id));
    expect(v.pipeline.find((p) => p.op === "HYS")?.status).toBe("OK");
    expect(v.messages.some((m) => m.operation === "IEX" && m.summary.includes("được phép gửi lại"))).toBe(true);
    // Gửi lại IDC khi Hải quan đã ghi nhận → không gửi.
    const r2 = unwrap(await resendOperation(deps, declarant, id, "IDC"));
    expect(r2.resent).toBe(false);
    expect(uow.data.outbox.filter((o) => o.dossierId === id && o.operation === "IDC")).toHaveLength(1);
  });
  it("lỗi vĩnh viễn (DomainError: chưa cấu hình FPT) → outbox FAILED + SEND_FAILED, không ném; mở lại tờ khai → DRAFT, hồ sơ review", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    deps.gateway = { ...gateway, name: "fpt", preDeclare: async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình tài khoản VNACCS"); } } as unknown as FakeCustomsGateway;
    const r = unwrap(await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: uow.data.outbox[0]!.id }));
    expect(r.status).toBe("FAILED");
    expect(uow.data.results[0]!.state).toBe("SEND_FAILED");
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.pipeline[0]).toMatchObject({ op: "IDA", status: "ERROR", summary: expect.stringMatching(/INTEGRATION_NOT_CONFIGURED/) });
    expect(v.inProgress).toBe(false);
    unwrap(await reopenDeclaration(deps, declarant, D));
    expect(decls.reopened).toEqual([D]);
    expect(uow.data.results[0]!.state).toBe("APPROVED");
    expect(dossiers.rows[0]!.status).toBe("SUBMITTED"); // hồ sơ do declaration.markDraft đổi (fake không mô phỏng) – reopen không tự ghi dossier
  });
  it("hết số lần thử: outbox PENDING attempts≥5 → FAILED, Gửi lại tạo retry; worker hết retry gọi markOutboxFailed", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const ob = uow.data.outbox[0]!;
    ob.attempts = 5;
    ob.lastError = "FPT 503";
    expect(unwrap(await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob.id })).status).toBe("FAILED");
    expect(uow.data.results[0]!.state).toBe("SEND_FAILED");
    // Gửi lại IDA: IEX chưa có số tờ khai → outbox retry1 + job.
    deps.gateway = { ...gateway, queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) } as unknown as FakeCustomsGateway;
    uow.data.results[0]!.externalId = "fpt-x";
    const rs = unwrap(await resendOperation(deps, declarant, D, "IDA"));
    expect(rs.resent).toBe(true);
    expect(uow.data.outbox.map((o) => `${o.operation}:${o.status}`)).toEqual(["IDA:FAILED", "IDA:PENDING"]);
    // markOutboxFailed (worker) trên outbox PENDING → FAILED.
    unwrap(await markOutboxFailed(deps, { orgId: ORG, outboxId: uow.data.outbox[1]!.id, reason: "timeout" }));
    expect(uow.data.outbox[1]!.status).toBe("FAILED");
  });
  it("chạy lại job IDA sau crash khi Hải quan đã cấp số → không gọi preDeclare lần nữa", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const ob = uow.data.outbox[0]!;
    ob.attempts = 1; // OUT đã ghi, gateway đã trả thành công nhưng chưa ghi IN
    uow.data.results[0]!.externalId = `fpt-${hashId(D)}`;
    let preDeclareCalls = 0;
    deps.gateway = { ...gateway, channelFor: gateway.channelFor.bind(gateway), declarationNoFor: gateway.declarationNoFor.bind(gateway), queryStatus: gateway.queryStatus.bind(gateway), declare: gateway.declare.bind(gateway), attachDocuments: gateway.attachDocuments.bind(gateway), preDeclare: async () => { preDeclareCalls++; return { externalId: "x", declarationNo: "999" }; } } as unknown as FakeCustomsGateway;
    const r = unwrap(await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob.id }));
    expect(r.status).toBe("SENT");
    expect(preDeclareCalls).toBe(0);
    expect(uow.data.results[0]!.declarationNo).toBe(gateway.declarationNoFor(D, "IDA"));
  });
  it("EDA: EDA → EDC → HYS; org khác không thấy submission", async () => {
    decls.kind = "EDA";
    dossiers.rows[0]!.direction = "XK";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.pipeline.map((p) => p.op)).toEqual(["EDA", "EDC", "HYS", "IEX"]);
    expect(v.pipeline.every((p) => p.status === "OK")).toBe(true);
    expect(errCode(await getSubmission(deps, other, D))).toBe("NOT_FOUND");
  });
});
