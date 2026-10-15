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
import type { CustomsDeps, CustomsDossierPort, CustomsGateway, CustomsUow, DeclarationReader, DossierBrief, OutboxRow, ResultRow } from "../customs-ports.js";
import { getSubmission, listCustomsDeclarations } from "../get-submission.js";
import { markOutboxFailed, reopenDeclaration } from "../reopen-declaration.js";
import { domainError } from "../../../../shared/errors.js";
import { MAX_POLLS, pollStatus } from "../poll-status.js";
import { MAX_ATTEMPTS, processOutbox } from "../process-outbox.js";
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
  /** Ngày tra tỷ giá khi dựng tờ khai (giờ VN). */
  rateDate = "2026-10-14";
  readonly submitted: string[] = [];
  async get(_orgId: string, dossierId: string) {
    if (dossierId === "dos_none") return null;
    return { declarationId: "dec_1", version: 2, status: this.status, payload: payload(this.kind), unconfirmedHs: this.unconfirmedHs, estimatedTaxVnd: "58449312", exchangeRateDate: this.rateDate };
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
  it("tờ khai dựng với tỷ giá tuần trước → chặn truyền RATE_WEEK_CHANGED (tỷ giá tính thuế áp theo tuần đăng ký); cùng tuần → truyền được", async () => {
    decls.rateDate = "2026-10-11"; // Chủ nhật tuần trước; hôm nay 14/10 (thứ Tư)
    const r = await submitDeclaration(deps, declarant, D, "cert_1");
    expect(errCode(r)).toBe("RATE_WEEK_CHANGED");
    expect(uow.data.outbox).toHaveLength(0);
    decls.rateDate = "2026-10-12";
    expect(unwrap(await submitDeclaration(deps, declarant, D, "cert_1")).outboxId).toBeTruthy();
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
  it("Gửi lại IDA chưa được ghi nhận sang tuần tỷ giá mới → RATE_WEEK_CHANGED, không tạo outbox", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const ob = uow.data.outbox[0]!;
    ob.attempts = 5;
    unwrap(await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob.id }));
    deps.gateway = { ...gateway, queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) } as unknown as FakeCustomsGateway;
    uow.data.results[0]!.externalId = "fpt-x";
    deps.clock = fixedClock("2026-10-19T03:00:00.000Z"); // thứ Hai tuần sau; tờ khai tra tỷ giá 14/10
    expect(errCode(await resendOperation(deps, declarant, D, "IDA"))).toBe("RATE_WEEK_CHANGED");
    expect(uow.data.outbox).toHaveLength(1);
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

// ───────────────────────── Nhánh lỗi / biên (bổ sung độ phủ nhánh) ─────────────────────────

const T = new Date("2026-10-14T03:00:00.000Z");
const seedResult = (p: Partial<ResultRow> = {}): ResultRow => {
  const row: ResultRow = { id: "res_1", orgId: ORG, dossierId: D, externalId: "fpt-1", declarationNo: "107000000001", channel: "YELLOW", channelNote: null, clearanceStatus: "INSPECTING", customsTaxVnd: null, state: "DOCS_SENT", pollCount: 0, raw: { progress: "DOCS_SENT" }, updatedAt: T, ...p };
  uow.data.results.push(row);
  return row;
};
const seedOutbox = (p: Partial<OutboxRow> = {}): OutboxRow => {
  const row: OutboxRow = { id: `ob_${uow.data.outbox.length + 1}`, orgId: ORG, dossierId: D, declarationId: "dec_1", operation: "IDA", idempotencyKey: `${D}:IDA:v2`, payload: { request: null }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: T, updatedAt: T, ...p };
  uow.data.outbox.push(row);
  return row;
};
/** Gateway giả với vài phương thức thay thế (giữ `this` của FakeCustomsGateway). */
const gw = (o: Partial<CustomsGateway>): CustomsGateway => ({
  name: "stub", preDeclare: gateway.preDeclare.bind(gateway), declare: gateway.declare.bind(gateway), attachDocuments: gateway.attachDocuments.bind(gateway), queryStatus: gateway.queryStatus.bind(gateway), ...o,
});
const noQuery = () => gw({ queryStatus: async () => { throw new Error("không được hỏi IEX"); } });
const poll = (attempt = 1, dossierId = D) => pollStatus(deps, { orgId: ORG, userId: "usr_chau", dossierId, attempt });
const send = (outboxId: string) => processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId });

describe("pollStatus – nhánh biên", () => {
  it("chưa truyền (không có kết quả) → NOT_FOUND", async () => {
    expect(errCode(await poll())).toBe("NOT_FOUND");
  });

  it.each([
    [{ state: "CLEARED" as const }, { done: true, cleared: true }],
    [{ state: "REJECTED" as const }, { done: true, cleared: false }],
    [{ externalId: null }, { done: true, cleared: false }],
    [{ raw: { progress: "DECLARED" as const } }, { done: true, cleared: false }],
    [{ raw: null }, { done: true, cleared: false }],
  ])("kết quả %o → dừng hỏi %o, không gọi IEX, không xếp job", async (patch, expected) => {
    seedResult(patch);
    deps.gateway = noQuery();
    expect(unwrap(await poll())).toEqual(expected);
    expect(queue.jobs).toHaveLength(0);
  });

  it("chưa thông quan, trạng thái đổi → ghi IN (số tờ khai cũ khi IEX không trả), INSPECTION, đếm lần hỏi, xếp lần hỏi kế", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ kiểm tra chi tiết hồ sơ", cleared: false }) });
    expect(unwrap(await poll(3))).toEqual({ done: false, cleared: false });
    expect(uow.data.messages).toHaveLength(1);
    expect(uow.data.messages[0]).toMatchObject({ operation: "IEX", direction: "IN", payloadMasked: { soToKhai: "107000000001", trangThai: "Chờ kiểm tra chi tiết hồ sơ" } });
    expect(uow.data.results[0]).toMatchObject({ state: "INSPECTION", pollCount: 1, clearanceStatus: "INSPECTING", channel: "YELLOW", raw: { progress: "DOCS_SENT", lastStatus: "Chờ kiểm tra chi tiết hồ sơ" } });
    expect(queue.jobs[0]).toMatchObject({ name: "customs-poll", payload: { dossierId: D, attempt: 4 } });
    expect(dossiers.events).toEqual([{ type: "customs.message" }]);
  });

  it("trạng thái không đổi → không ghi thông điệp, không phát sự kiện, vẫn hỏi tiếp", async () => {
    seedResult({ raw: { progress: "DOCS_SENT", lastStatus: "Chờ" } });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ", cleared: false }) });
    expect(unwrap(await poll())).toEqual({ done: false, cleared: false });
    expect(uow.data.messages).toHaveLength(0);
    expect(dossiers.events).toHaveLength(0);
    expect(queue.jobs).toHaveLength(1);
  });

  it("đạt số lần hỏi tối đa → dừng, không xếp job", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ", cleared: false }) });
    expect(unwrap(await poll(MAX_POLLS))).toEqual({ done: true, cleared: false });
    expect(queue.jobs).toHaveLength(0);
  });

  it("Hải quan từ chối → REJECTED, dừng hỏi", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Từ chối", cleared: false, rejected: true }) });
    expect(unwrap(await poll())).toEqual({ done: true, cleared: false });
    expect(uow.data.results[0]).toMatchObject({ state: "REJECTED", clearanceStatus: "REJECTED", raw: { progress: "DONE" } });
    expect(queue.jobs).toHaveLength(0);
  });

  it("thông quan: cập nhật thuế/số tờ khai/luồng từ IEX; không có notifier vẫn chạy; tiến độ DONE vẫn hỏi được", async () => {
    seedResult({ raw: { progress: "DONE" } });
    delete deps.notify;
    deps.gateway = gw({ queryStatus: async () => ({ status: "Đã thông quan", cleared: true, customsTaxVnd: "123", declarationNo: "107999", channel: "RED" }) });
    expect(unwrap(await poll())).toEqual({ done: true, cleared: true });
    expect(uow.data.results[0]).toMatchObject({ state: "CLEARED", clearanceStatus: "CLEARED", customsTaxVnd: "123", declarationNo: "107999", channel: "RED" });
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
  });

  it("thông quan nhưng không đọc được hồ sơ → tiêu đề thông báo mặc định “Hồ sơ”", async () => {
    seedResult({ dossierId: "dos_ghost", declarationNo: null, raw: { progress: "DOCS_SENT" } });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Đã thông quan", cleared: true }) });
    unwrap(await poll(1, "dos_ghost"));
    expect(notifier.sent[0]?.draft).toMatchObject({ title: "Hồ sơ đã thông quan", body: "Số tờ khai  – Đã thông quan." });
  });
});

describe("getSubmission / listCustomsDeclarations – nhánh biên", () => {
  it("hồ sơ không tồn tại → NOT_FOUND", async () => {
    expect(errCode(await getSubmission(deps, declarant, "dos_khong_co"))).toBe("NOT_FOUND");
  });

  it("chưa có tờ khai → NOT_CREATED, 0 HS chưa xác nhận, không đang truyền", async () => {
    dossiers.rows.push({ ...dossiers.rows[0]!, id: "dos_none" });
    const v = unwrap(await getSubmission(deps, declarant, "dos_none"));
    expect(v).toMatchObject({ declarationStatus: "NOT_CREATED", hsUnconfirmed: 0, inProgress: false });
  });

  it.each([
    [{ state: "DOCS_SENT" as const, raw: { progress: "DOCS_SENT" as const } }, true],
    [{ state: "INSPECTION" as const, raw: { progress: "DONE" as const } }, true],
    [{ state: "SEND_FAILED" as const, raw: { progress: "DONE" as const } }, false],
    [{ state: "CLEARED" as const, raw: { progress: "DONE" as const } }, false],
    [{ state: "DECLARED" as const, raw: { progress: "DECLARED" as const } }, false],
  ])("kết quả %o → đang hỏi trạng thái = %s", async (patch, polling) => {
    seedResult(patch);
    expect(unwrap(await getSubmission(deps, declarant, D)).inProgress).toBe(polling);
  });

  it("danh sách: hồ sơ bị xóa → bỏ qua", async () => {
    dossiers.rows = [];
    expect(unwrap(await listCustomsDeclarations(deps, declarant))).toEqual([]);
  });

  it("danh sách: chưa truyền → READY, thời điểm = ngày duyệt; không có ngày duyệt → ngày cập nhật hồ sơ", async () => {
    expect(unwrap(await listCustomsDeclarations(deps, declarant))[0]).toEqual({ dossierId: D, dossierCode: "HS-NK-2610-021", direction: "NK", partner: "HANSOL", typeCode: "A11", state: "READY", updatedAt: "2026-10-14T02:00:00.000Z" });
    (decls as DeclarationReader).listForCustoms = async () => [{ dossierId: D, status: "APPROVED", approvedAt: null }];
    dossiers.rows[0]!.updatedAt = new Date("2026-10-10T00:00:00.000Z");
    expect(unwrap(await listCustomsDeclarations(deps, declarant))[0]?.updatedAt).toBe("2026-10-10T00:00:00.000Z");
  });

  it("danh sách: có kết quả + thông điệp → luồng (ghi chú mặc định), thuế, thao tác cuối; sắp xếp mới nhất trước", async () => {
    dossiers.rows.push({ ...dossiers.rows[0]!, id: "dos_2", code: "HS-NK-2610-022" });
    decls.listForCustoms = async () => [{ dossierId: D, status: "SUBMITTED", approvedAt: T }, { dossierId: "dos_2", status: "APPROVED", approvedAt: new Date("2026-10-15T00:00:00.000Z") }];
    seedResult({ customsTaxVnd: "58449312" });
    uow.data.messages.push({ id: "m1", orgId: ORG, dossierId: D, operation: "HYS", direction: "IN", result: "OK", summary: "ok", payloadMasked: {}, externalRef: null, at: T });
    const rows = unwrap(await listCustomsDeclarations(deps, declarant));
    expect(rows.map((r) => r.dossierId)).toEqual(["dos_2", D]);
    expect(rows[1]).toMatchObject({ state: "INSPECTING", lastOperation: "HYS", declarationNo: "107000000001", channel: "YELLOW", channelNote: expect.stringMatching(/^Luồng vàng/), customsTaxVnd: "58449312" });
  });
});

describe("resendOperation – nhánh biên", () => {
  it("VIEWER → FORBIDDEN; hồ sơ org khác → NOT_FOUND; chưa có kết quả hoặc chưa có externalId → NOT_FOUND", async () => {
    expect(errCode(await resendOperation(deps, viewer, D, "IDA"))).toBe("FORBIDDEN");
    expect(errCode(await resendOperation(deps, other, D, "IDA"))).toBe("NOT_FOUND");
    expect(errCode(await resendOperation(deps, declarant, D, "IDA"))).toBe("NOT_FOUND");
    seedResult({ externalId: null });
    expect(errCode(await resendOperation(deps, declarant, D, "IDA"))).toBe("NOT_FOUND");
    expect(uow.data.messages).toHaveLength(0);
  });

  it("IEX: chỉ tra trạng thái → ghi OUT + IN, cập nhật INSPECTION, không tạo outbox", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ kiểm tra", cleared: false }) });
    expect(unwrap(await resendOperation(deps, declarant, D, "IEX"))).toEqual({ resent: false, message: "Trạng thái: Chờ kiểm tra" });
    expect(uow.data.messages.map((m) => `${m.operation}/${m.direction}`)).toEqual(["IEX/OUT", "IEX/IN"]);
    expect(uow.data.messages[1]?.summary).toBe("Trạng thái tờ khai: Chờ kiểm tra");
    expect(uow.data.results[0]).toMatchObject({ state: "INSPECTION", clearanceStatus: "INSPECTING", raw: { lastStatus: "Chờ kiểm tra" } });
    expect(uow.data.outbox).toHaveLength(0);
    expect(dossiers.rows[0]!.status).toBe("APPROVED");
  });

  it("IEX: đã thông quan → hồ sơ CLEARED", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Đã thông quan", cleared: true }) });
    unwrap(await resendOperation(deps, declarant, D, "IEX"));
    expect(uow.data.results[0]).toMatchObject({ state: "CLEARED", clearanceStatus: "CLEARED" });
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
  });

  it.each([[{ progress: "PRE_DECLARED" as const }], [null]])("IEX khi chưa gửi HYS (raw %o) → không đổi trạng thái kết quả", async (raw) => {
    seedResult({ state: "PRE_DECLARED", raw });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Đã khai trước", cleared: false }) });
    unwrap(await resendOperation(deps, declarant, D, "IEX"));
    expect(uow.data.results[0]).toMatchObject({ state: "PRE_DECLARED", raw });
  });

  it.each([
    ["EDA" as const, { status: "s", cleared: false, declarationNo: "307000000001" }, null],
    ["EDC" as const, { status: "s", cleared: false, channel: "GREEN" as const }, null],
    ["HYS" as const, { status: "s", cleared: false }, "HYS00000001"],
  ])("%s đã được Hải quan ghi nhận → không gửi lại", async (op, status, receiptNo) => {
    seedResult({ raw: { progress: "DOCS_SENT", ...(receiptNo ? { receiptNo } : {}) } });
    deps.gateway = gw({ queryStatus: async () => status });
    expect(unwrap(await resendOperation(deps, declarant, D, op))).toEqual({ resent: false, message: `Hải quan đã ghi nhận ${op}, không cần gửi lại` });
    expect(uow.data.outbox).toHaveLength(0);
  });

  it("chưa ghi nhận nhưng chưa từng gửi nghiệp vụ đó → INVALID_STATE", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ queryStatus: async () => ({ status: "s", cleared: false }) });
    expect(errCode(await resendOperation(deps, declarant, D, "IDC"))).toBe("INVALID_STATE");
  });

  it("lần gửi trước còn PENDING và chưa hết lượt → không tạo bản gửi mới", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2`, attempts: 2 });
    deps.gateway = gw({ queryStatus: async () => ({ status: "s", cleared: false }) });
    expect(unwrap(await resendOperation(deps, declarant, D, "IDC"))).toEqual({ resent: false, message: "Khai chính thức – nhận phân luồng đang được gửi" });
    expect(uow.data.outbox).toHaveLength(1);
    expect(queue.jobs).toHaveLength(0);
  });

  it("PENDING đã hết lượt → đánh FAILED rồi tạo retry; khóa không có version → v1; kết quả không ở SEND_FAILED giữ nguyên", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC`, attempts: MAX_ATTEMPTS });
    deps.gateway = gw({ queryStatus: async () => ({ status: "s", cleared: false }) });
    expect(unwrap(await resendOperation(deps, declarant, D, "IDC")).resent).toBe(true);
    expect(uow.data.outbox.map((o) => `${o.idempotencyKey}:${o.status}`)).toEqual([`${D}:IDC:FAILED`, `${D}:IDC:v1:retry1:PENDING`]);
    expect(uow.data.results[0]?.state).toBe("PRE_DECLARED");
    expect(queue.jobs[0]).toMatchObject({ name: "customs-send", payload: { outboxId: uow.data.outbox[1]!.id } });
  });

  it("SEND_FAILED không có raw → gửi lại từ bước đầu (APPROVED)", async () => {
    seedResult({ state: "SEND_FAILED", declarationNo: null, raw: null });
    seedOutbox({ status: "FAILED", attempts: 1 });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await resendOperation(deps, declarant, D, "IDA"));
    expect(uow.data.results[0]).toMatchObject({ state: "APPROVED", raw: { progress: "APPROVED" } });
  });

  // Nghi lỗi (báo cáo, chưa sửa): resend-operation.ts gọi next(…, { type: "STATUS", cleared }) không truyền `rejected`
  // và luôn ghi clearanceStatus CLEARED/INSPECTING → tờ khai Hải quan đã từ chối, bấm “Tra cứu” (IEX) thành INSPECTION/INSPECTING.
  it("IEX khi Hải quan trả rejected → kết quả REJECTED (như pollStatus), không đổi thành INSPECTION", async () => {
    seedResult({ state: "DOCS_SENT", raw: { progress: "DOCS_SENT" } });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Từ chối", cleared: false, rejected: true }) });
    unwrap(await resendOperation(deps, declarant, D, "IEX"));
    expect(uow.data.results[0]).toMatchObject({ state: "REJECTED", clearanceStatus: "REJECTED" });
  });
});

describe("processOutbox – nhánh biên", () => {
  it("outbox không tồn tại → NOT_FOUND; chưa có kết quả → INVALID_STATE; hồ sơ không còn → NOT_FOUND", async () => {
    expect(errCode(await send("ob_khong_co"))).toBe("NOT_FOUND");
    const ob = seedOutbox();
    expect(errCode(await send(ob.id))).toBe("INVALID_STATE");
    const ghost = seedOutbox({ dossierId: "dos_ghost", idempotencyKey: "dos_ghost:IDA:v2" });
    seedResult({ dossierId: "dos_ghost", state: "APPROVED", raw: { progress: "APPROVED" } });
    expect(errCode(await send(ghost.id))).toBe("NOT_FOUND");
  });

  it("outbox của nghiệp vụ không gửi qua outbox (IEX) → NOT_SUPPORTED", async () => {
    seedResult({ state: "APPROVED", raw: { progress: "APPROVED" } });
    const ob = seedOutbox({ operation: "IEX", idempotencyKey: `${D}:IEX:v2` });
    expect(errCode(await send(ob.id))).toBe("NOT_SUPPORTED");
  });

  it("IDA bị Hải quan trả lỗi (thiếu mã loại hình) → FAILED, lỗi kèm trường + cách xử lý, thông báo chủ hồ sơ", async () => {
    seedResult({ externalId: null, declarationNo: null, state: "APPROVED", raw: { progress: "APPROVED" } });
    const ob = seedOutbox({ payload: { request: { objVN_IDA: {} } } });
    expect(unwrap(await send(ob.id))).toEqual({ status: "FAILED", next: null });
    expect(uow.data.outbox[0]).toMatchObject({ status: "FAILED", lastError: "E-ICB-001 (TK_ICB): Thiếu mã loại hình → Khai mã loại hình (A11, B11…)" });
    expect(uow.data.results[0]).toMatchObject({ state: "SEND_FAILED", externalId: expect.stringMatching(/^fpt-/) });
    expect(notifier.sent[0]).toMatchObject({ audience: { dossierOwnerOf: D }, draft: { title: "HS-NK-2610-021: Khai trước thông tin tờ khai nhập bị từ chối" } });
  });

  it("IDA thành công nhưng chưa có số tờ khai → ghi “(chưa có)”, vẫn tạo bước IDC", async () => {
    seedResult({ externalId: null, declarationNo: null, state: "APPROVED", raw: { progress: "APPROVED" } });
    deps.gateway = gw({ preDeclare: async () => ({ externalId: "fpt-9" }) });
    const ob = seedOutbox();
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: "IDC" });
    expect(uow.data.messages.find((m) => m.direction === "IN")?.summary).toBe("Hải quan cấp số tờ khai (chưa có)");
    expect(dossiers.patches).toEqual([]);
  });

  it("chạy lại IDA (attempts>0) mà IEX lỗi → bỏ qua tra cứu, gọi preDeclare", async () => {
    seedResult({ externalId: "fpt-1", declarationNo: null, state: "APPROVED", raw: { progress: "APPROVED" } });
    let calls = 0;
    deps.gateway = gw({ queryStatus: async () => { throw new Error("timeout"); }, preDeclare: async () => (calls++, { externalId: "fpt-1", declarationNo: "107111" }) });
    const ob = seedOutbox({ attempts: 1 });
    expect(unwrap(await send(ob.id)).status).toBe("SENT");
    expect(calls).toBe(1);
    expect(uow.data.outbox[0]?.attempts).toBe(2);
  });

  it("IDC bị từ chối không kèm danh sách lỗi → lỗi E-IDC-REJECT", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: false }) });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(uow.data.outbox[0]?.lastError).toBe("E-IDC-REJECT: Hải quan không chấp nhận khai chính thức");
  });

  it("IDC có lỗi từ Hải quan → dùng danh sách lỗi đó", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: true, errors: [{ code: "E-1", message: "Sai" }] }) });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(uow.data.outbox[0]?.lastError).toBe("E-1: Sai");
  });

  it.each([["GREEN" as const, "xanh", 1], ["RED" as const, "đỏ", 3]])("IDC luồng %s → tóm tắt “luồng %s”, mã phân luồng %d, thuế Hải quan tính", async (channel, vi, code) => {
    seedResult({ state: "PRE_DECLARED", channel: null, raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: true, channel, customsTaxVnd: "60000000" }) });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: "HYS" });
    const inMsg = uow.data.messages.find((m) => m.direction === "IN")!;
    expect(inMsg.summary).toBe(`Kết quả phân luồng: luồng ${vi}`);
    expect(inMsg.payloadMasked).toMatchObject({ maPhanLuong: code, thueDuKien: "60000000 VND" });
    expect(uow.data.results[0]).toMatchObject({ state: "DECLARED", channel, customsTaxVnd: "60000000" });
    expect(dossiers.patches).toContainEqual({ channel });
  });

  it("IDC luồng vàng, không có thuế từ Hải quan và chưa có thuế dự kiến → thuế 0 VND", async () => {
    seedResult({ state: "PRE_DECLARED", channel: null, customsTaxVnd: null, raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: true, channel: "YELLOW" }) });
    const ob = seedOutbox({ operation: "EDC", idempotencyKey: `${D}:EDC:v2` });
    unwrap(await send(ob.id));
    expect(uow.data.messages.find((m) => m.direction === "IN")?.payloadMasked).toMatchObject({ maPhanLuong: 2, thueDuKien: "0 VND" });
  });

  it.each([["IDC" as const, "PRE_DECLARED" as const], ["HYS" as const, "DECLARED" as const]])("%s: lỗi vĩnh viễn (DomainError) → FAILED + SEND_FAILED, giữ bước", async (op, progress) => {
    seedResult({ state: progress, raw: { progress } });
    const boom = async () => { throw domainError("INTEGRATION_NOT_CONFIGURED", "Chưa cấu hình"); };
    deps.gateway = gw({ declare: boom, attachDocuments: boom });
    const ob = seedOutbox({ operation: op, idempotencyKey: `${D}:${op}:v2`, payload: { files: [] } });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(uow.data.results[0]).toMatchObject({ state: "SEND_FAILED", raw: { progress } });
  });

  it("lỗi tạm không phải Error (chuỗi) → ghi lastError, giữ PENDING, ném lại", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => { throw "socket hang up"; } });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    await expect(send(ob.id)).rejects.toBe("socket hang up");
    expect(uow.data.outbox[0]).toMatchObject({ status: "PENDING", lastError: "socket hang up" });
  });

  it("HYS không có tệp (payload rỗng) → lỗi E-HYS-000", async () => {
    seedResult({ state: "DECLARED", raw: { progress: "DECLARED" } });
    gateway = new FakeCustomsGateway({ flakyHys: false });
    deps.gateway = gateway;
    const ob = seedOutbox({ operation: "HYS", idempotencyKey: `${D}:HYS:v2`, payload: null });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(uow.data.outbox[0]?.lastError).toMatch(/^E-HYS-000/);
  });

  it("HYS thành công không có số tiếp nhận → tóm tắt không kèm số; xếp job hỏi trạng thái", async () => {
    seedResult({ state: "DECLARED", raw: { progress: "DECLARED" } });
    deps.gateway = gw({ attachDocuments: async () => ({}) });
    const ob = seedOutbox({ operation: "HYS", idempotencyKey: `${D}:HYS:v2`, payload: { files: [{ name: "inv.pdf", storageKey: "k/inv.pdf" }] } });
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: null });
    expect(uow.data.messages.find((m) => m.direction === "IN")?.summary).toBe("Đã tiếp nhận hồ sơ chứng từ điện tử (1 tệp)");
    expect(uow.data.results[0]?.raw).toEqual({ progress: "DOCS_SENT" });
    expect(queue.jobs[0]).toMatchObject({ name: "customs-poll", payload: { dossierId: D, attempt: 1 } });
  });

  it("bước kế tiếp đã có outbox (không còn PENDING) → không tạo trùng, không xếp job", async () => {
    seedResult({ state: "PRE_DECLARED", channel: null, raw: { progress: "PRE_DECLARED" } });
    seedOutbox({ operation: "HYS", idempotencyKey: `${D}:HYS:v2`, status: "SENT" });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).next).toBe("HYS");
    expect(uow.data.outbox.filter((o) => o.operation === "HYS")).toHaveLength(1);
    expect(queue.jobs).toHaveLength(0);
  });

  // Nghi lỗi (báo cáo, chưa sửa): process-outbox.ts – declare trả { accepted: true } mà không có channel/errors
  // → errors undefined nên `failed = false`: outbox SENT + thông điệp IN "OK" với summary undefined, trong khi kết quả SEND_FAILED.
  it("IDC accepted nhưng không có phân luồng → coi là lỗi (outbox FAILED, có thông điệp lỗi), không phải SENT", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: true }) });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(uow.data.outbox[0]?.lastError).toMatch(/^E-IDC-NO-CHANNEL/);
    expect(uow.data.messages.find((m) => m.direction === "IN")).toMatchObject({ result: "ERROR" });
    expect(uow.data.results[0]?.state).toBe("SEND_FAILED");
  });
});

describe("submitDeclaration – nhánh biên", () => {
  it("hồ sơ đã truyền/đã thông quan → ALREADY_SUBMITTED", async () => {
    dossiers.rows[0]!.status = "SUBMITTED";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    dossiers.rows[0]!.status = "CLEARED";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
  });

  it("chưa có tờ khai → NO_DECLARATION; tờ khai đã SUBMITTED → ALREADY_SUBMITTED; không chọn chứng thư → NO_CERT", async () => {
    dossiers.rows.push({ ...dossiers.rows[0]!, id: "dos_none" });
    expect(errCode(await submitDeclaration(deps, declarant, "dos_none", "cert_1"))).toBe("NO_DECLARATION");
    decls.status = "SUBMITTED";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    decls.status = "APPROVED";
    expect(errCode(await submitDeclaration(deps, declarant, D, ""))).toBe("NO_CERT");
  });

  it("EDA: outbox nghiệp vụ EDA", async () => {
    decls.kind = "EDA";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.outbox[0]).toMatchObject({ operation: "EDA", idempotencyKey: `${D}:EDA:v2` });
  });

  it("outbox đã có (crash trước khi đẩy job, chưa gửi lần nào) → đẩy lại job, báo ALREADY_SUBMITTED", async () => {
    const ob = seedOutbox();
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "customs-send", payload: expect.objectContaining({ outboxId: ob.id }) })]);
  });

  it("outbox đã có và đã gửi → không đẩy lại job", async () => {
    seedOutbox({ attempts: 1 });
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(queue.jobs).toHaveLength(0);
  });

  it("hai request song song: insert vi phạm unique → ALREADY_SUBMITTED; lỗi DB khác → ném ra", async () => {
    const withOutbox = (insert: (row: OutboxRow) => Promise<void>): CustomsUow => ({
      asOrg: (c, fn) => uow.asOrg(c, (r) => fn({ ...r, outbox: { ...r.outbox, findByKey: async () => null, insert } })),
    });
    deps.uow = withOutbox(async () => { throw new Error("duplicate key value violates unique constraint customs_outbox_key_uq"); });
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    deps.uow = withOutbox(async () => { throw "connection reset"; });
    await expect(submitDeclaration(deps, declarant, D, "cert_1")).rejects.toBe("connection reset");
    expect(decls.submitted).toEqual([]);
  });
});
