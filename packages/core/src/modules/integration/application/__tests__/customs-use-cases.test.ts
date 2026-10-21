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
import { performOperation, startPostAmendment } from "../perform-operation.js";
import { addPostAmendmentLines, approvePostAmendment, getPostAmendmentView, updatePostAmendmentField } from "../post-amendment.js";
import { FakeCustomsGateway, hashId } from "../test/fake-customs-gateway.js";
import { InMemoryCustomsUow } from "../test/in-memory-customs-uow.js";

const ORG = "org_a";
const declarant: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_chau"), role: "DECLARANT" };
const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_v"), role: "VIEWER" };
const approver: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_duyet"), role: "APPROVER" };
const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };

const payload = (kind: "IDA" | "EDA" = "IDA"): DeclarationPayload => ({
  kind, direction: kind === "IDA" ? "NK" : "XK", currency: "USD", containers: ["SITU2246781"], adjustments: [],
  fields: { MA_LH: { value: "A11" }, CQHQ: { value: "03CE – HP" }, PTVC: { value: "2 – Biển" }, NNK_MST: { value: "0316789012" }, NNK_TEN: { value: "AN PHÁT" }, NNK_DC: { value: "Hải Phòng" }, NXK_MST: { value: "0316789012" }, NXK_TEN: { value: "HANSOL" }, NXK_DC: { value: "Changwon" }, MA_NUOC: { value: "KR" }, SO_VD: { value: "HPSEL2610078" }, SO_KIEN: { value: "48 PL" }, TRONG_LUONG: { value: "3860.5" }, KHO: { value: "03CCS01 – Kho" }, CANG_DO: { value: "VNHPH – Cảng Hải Phòng" }, CANG_XEP: { value: "KRPUS – Busan" }, PTVC_TEN: { value: "SITC" }, NGAY_DEN: { value: "2026-10-15" }, NGAY_DI: { value: "2026-10-15" }, SO_HD: { value: "HSP-1" }, NGAY_HD: { value: "2026-10-02" }, PT_TT: { value: "TTR – T/T" }, DK_GIA: { value: "FCA" }, MA_TT: { value: "USD" }, TONG_TG: { value: "20850" }, VBPQ: { value: "MO" },
    // Đủ ô bắt buộc trước khi khai (@kb/contracts declarationRequiredGaps): IDA và EDA đường biển container, giá FCA.
    PL_CN: { value: "4 – Tổ chức" }, HO_HIEU: { value: "VRDK5" }, HD_PL: { value: "A – Hóa đơn thương mại" }, GIA_PL: { value: "A" }, NGUOI_NT: { value: "1" },
    NXK_DT: { value: "0225 3 888 123" }, TG_TT: { value: "20850 USD" }, SO_CONT: { value: "SITU2246781" }, CON_VC1: { value: "03CCS01" } },
  items: [{ lineNo: 1, description: "Vòng bi", quantity: "2000", unit: "PCE", unitPrice: "1.85", amount: "3700", origin: "KR", hsConfirmed: "8482.10.00", importDutyRate: "3", vatRate: "8", policyNote: null }],
});

class FakeDeclarations implements DeclarationReader {
  constructor(public status: DeclarationStatus = "APPROVED", public unconfirmedHs = 0, public kind: "IDA" | "EDA" = "IDA") {}
  /** Ngày tra tỷ giá khi dựng tờ khai (giờ VN). */
  rateDate = "2026-10-14";
  /** Ghi đè chỉ tiêu của payload (giá trị rỗng = người khai xóa ô sau khi duyệt). */
  fields: Record<string, { value: string }> = {};
  readonly submitted: string[] = [];
  async get(_orgId: string, dossierId: string) {
    if (dossierId === "dos_none") return null;
    const p = payload(this.kind);
    return { declarationId: "dec_1", version: 2, status: this.status, payload: { ...p, fields: { ...p.fields, ...this.fields } }, unconfirmedHs: this.unconfirmedHs, estimatedTaxVnd: "58449312", exchangeRateDate: this.rateDate };
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
let audits: { dossierId: string; key: string; oldValue: string; newValue: string }[];
let fourEyes: boolean;
const D = "dos_1";

beforeEach(() => {
  uow = new InMemoryCustomsUow();
  queue = new InMemoryJobQueue();
  gateway = new FakeCustomsGateway({ clearAfterPolls: 2 });
  decls = new FakeDeclarations();
  dossiers = new FakeDossiers([{ id: D, orgId: ORG, code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: new Date("2026-10-14T02:00:00.000Z") }]);
  blockers = 0;
  notifier = new RecordingNotifier();
  audits = [];
  fourEyes = false;
  deps = {
    notify: notifier,
    uow, queue, gateway, declarations: decls, dossiers, validation: { blockerFails: async () => blockers }, certificates: { exists: async (_o, id) => id === "cert_1" },
    audit: { append: async (_c, row) => void audits.push(row) }, org: { fourEyes: async () => fourEyes },
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
  it("ô bắt buộc trống (đổi sau khi duyệt) → VALIDATION nêu chỉ tiêu, không tạo outbox, hồ sơ chưa SUBMITTED", async () => {
    decls.fields = { KHO: { value: "" } };
    const r = await submitDeclaration(deps, declarant, D, "cert_1");
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("1.29 Mã địa điểm lưu kho") } });
    expect(uow.data.outbox).toHaveLength(0);
    expect(decls.submitted).toEqual([]);
  });
  it("sai đặc tả FPT (vd ngày hàng đến sai định dạng) → chặn trước khi đánh dấu đã khai", async () => {
    decls.fields = { NGAY_DEN: { value: "15.10.2026" } };
    const r = await submitDeclaration(deps, declarant, D, "cert_1");
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION", message: expect.stringContaining("đặc tả truyền Hải quan") } });
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
  it("IDA (tự dừng ở khai tạm) → người khai bấm IDC → hỏi IID tới thông quan; nhật ký OUT/IN đủ; hồ sơ CLEARED", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    let v = unwrap(await getSubmission(deps, declarant, D));
    // Khai tạm xong: không tự khai chính thức – chờ người khai xem số tờ khai + thuế dự kiến.
    expect(v).toMatchObject({ stage: "PRE_DECLARED", nextOp: "IDC", queryOp: "IID", inProgress: false });
    // Hải quan trả về sau khai tạm: số tờ khai, Chi cục, tỷ giá, thuế; thời điểm nhận theo clock hệ thống.
    expect(v.customsInfo).toMatchObject({ declarationNo: gateway.declarationNoFor(D, "IDA"), customsOfficeName: "CCHQ mô phỏng", exchangeRates: [{ currency: "USD", rate: "26150" }], totalTaxVnd: "0", receivedAt: "2026-10-14T03:00:00.000Z" });
    expect(v.customsInfo?.registeredDate).toBeUndefined();
    expect(v.pipeline.slice(0, 3).map((p) => `${p.op}:${p.status}:${p.enabled}`)).toEqual(["IDA:OK:false", "IDB:NOT_SENT:true", "IDC:NOT_SENT:true"]);
    expect(uow.data.outbox.map((o) => o.operation)).toEqual(["IDA"]);
    expect(unwrap(await performOperation(deps, declarant, D, "IDC"))).toMatchObject({ sent: true });
    await drain();
    v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.result).toMatchObject({ declarationNo: gateway.declarationNoFor(D, "IDA"), channel: gateway.channelFor(D), clearanceStatus: "CLEARED" });
    expect(v).toMatchObject({ stage: "CLEARED", inProgress: false });
    // Gộp dần: khai chính thức thêm ngày đăng ký + mã phân loại kiểm tra, thông quan thêm ngày cấp phép; số tờ khai, tỷ giá từ IDA vẫn giữ.
    expect(v.customsInfo).toMatchObject({
      declarationNo: gateway.declarationNoFor(D, "IDA"), exchangeRates: [{ currency: "USD", rate: "26150" }],
      registeredDate: "2026-10-14", inspectionCode: { GREEN: "1", YELLOW: "2", RED: "3" }[gateway.channelFor(D)], permitDate: "2026-10-14",
    });
    expect(v.messages.map((m) => `${m.operation}/${m.direction}/${m.result}`)).toContain("IDC/IN/OK");
    expect(v.messages[v.messages.length - 1]!.payloadPreview).not.toContain("0316789012"); // MST đã che
    expect(uow.data.outbox.map((o) => `${o.operation}:${o.status}`)).toEqual(["IDA:SENT", "IDC:SENT"]);
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
    expect(dossiers.rows[0]!.declarationNo).toBe(gateway.declarationNoFor(D, "IDA"));
    expect(uow.data.results[0]!.state).toBe("CLEARED");
    expect(notifier.sent.map((n) => n.draft.title)).toEqual([expect.stringMatching(/Luồng/), expect.stringMatching(/đã thông quan/)]);
    expect(notifier.sent[1]!.audience).toEqual({ dossierOwnerOf: D, roles: ["APPROVER"] });
    const rows = unwrap(await listCustomsDeclarations(deps, declarant));
    expect(rows[0]).toMatchObject({ dossierId: D, state: "CLEARED", stage: "CLEARED", declarationNo: gateway.declarationNoFor(D, "IDA") });
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
  it("HYS lỗi lần đầu (hash%7==0) → SEND_FAILED giữ giai đoạn, dòng HYS ERROR; Gửi lại → tra IID, outbox retry1, rồi OK", async () => {
    // Chọn id có hash % 7 == 0.
    let id = "dos_r";
    while (hashId(id) % 7 !== 0) id += "x";
    dossiers.rows.push({ id, orgId: ORG, code: "HS-NK-2610-099", direction: "NK", typeCode: "A11", partner: "X", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: new Date() });
    unwrap(await submitDeclaration(deps, declarant, id, "cert_1"));
    await drain();
    unwrap(await performOperation(deps, declarant, id, "HYS"));
    await drain();
    let v = unwrap(await getSubmission(deps, declarant, id));
    expect(v.pipeline.find((p) => p.op === "HYS")).toMatchObject({ status: "ERROR", summary: expect.stringMatching(/E-SIG-401/) });
    expect(uow.data.results.find((r) => r.dossierId === id)).toMatchObject({ state: "SEND_FAILED", raw: { stage: "PRE_DECLARED" } });
    const rs = unwrap(await resendOperation(deps, declarant, id, "HYS"));
    expect(rs.resent).toBe(true);
    expect(uow.data.outbox.filter((o) => o.dossierId === id && o.operation === "HYS").map((o) => o.idempotencyKey)).toEqual([`${id}:HYS:n1`, `${id}:HYS:n1:retry1`]);
    await drain();
    v = unwrap(await getSubmission(deps, declarant, id));
    expect(v.pipeline.find((p) => p.op === "HYS")?.status).toBe("OK");
    expect(v.messages.some((m) => m.operation === "IID" && m.summary.includes("được phép gửi lại"))).toBe(true);
    // Khai chính thức, rồi Gửi lại IDC khi Hải quan đã ghi nhận phân luồng → không gửi.
    unwrap(await performOperation(deps, declarant, id, "IDC"));
    const ob = uow.data.outbox.find((o) => o.dossierId === id && o.operation === "IDC")!;
    await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ob.id });
    uow.data.results.find((r) => r.dossierId === id)!.raw = { ...uow.data.results.find((r) => r.dossierId === id)!.raw, stage: "PRE_DECLARED" }; // giả lập: IN của IDC chưa ghi
    ob.status = "FAILED";
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
  it("EDA: EDA → EDC, mã E… và tra cứu IEX; org khác không thấy submission", async () => {
    decls.kind = "EDA";
    dossiers.rows[0]!.direction = "XK";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    unwrap(await performOperation(deps, declarant, D, "EDC"));
    await drain();
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.pipeline.map((p) => p.op)).toEqual(["EDA", "EDB", "EDC", "EDD", "EDA01", "EDE", "AMA", "AMB", "AMC", "HYS", "CONT", "PORT_FEE"]);
    expect(v.pipeline.filter((p) => p.status === "OK").map((p) => p.op)).toEqual(["EDA", "EDC"]);
    expect(v.queryOp).toBe("IEX");
    expect(uow.data.messages.some((m) => m.operation === "IEX" && m.direction === "IN")).toBe(true);
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
  name: "stub", preDeclare: gateway.preDeclare.bind(gateway), declare: gateway.declare.bind(gateway), attachDocuments: gateway.attachDocuments.bind(gateway), queryStatus: gateway.queryStatus.bind(gateway), send: gateway.send.bind(gateway), ...o,
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
    [{ raw: { progress: "PRE_DECLARED" } }, { done: true, cleared: false }],
    [{ state: "APPROVED" as const, raw: null }, { done: true, cleared: false }],
    [{ raw: { stage: "POST_EDITING" as const } }, { done: true, cleared: false }],
  ])("kết quả %o → dừng hỏi %o, không gọi IID, không xếp job", async (patch, expected) => {
    seedResult(patch);
    deps.gateway = noQuery();
    expect(unwrap(await poll())).toEqual(expected);
    expect(queue.jobs).toHaveLength(0);
  });

  it("chưa thông quan, trạng thái đổi → ghi IN mã IID (số tờ khai cũ khi không trả), giữ DECLARED, đếm lần hỏi, xếp lần hỏi kế", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ kiểm tra chi tiết hồ sơ", cleared: false }) });
    expect(unwrap(await poll(3))).toEqual({ done: false, cleared: false });
    expect(uow.data.messages).toHaveLength(1);
    expect(uow.data.messages[0]).toMatchObject({ operation: "IID", direction: "IN", payloadMasked: { soToKhai: "107000000001", trangThai: "Chờ kiểm tra chi tiết hồ sơ" } });
    expect(uow.data.results[0]).toMatchObject({ state: "DECLARED", pollCount: 1, clearanceStatus: "INSPECTING", channel: "YELLOW", raw: { progress: "DOCS_SENT", stage: "DECLARED", lastStatus: "Chờ kiểm tra chi tiết hồ sơ" } });
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
    expect(uow.data.results[0]).toMatchObject({ state: "REJECTED", clearanceStatus: "REJECTED", raw: { stage: "REJECTED" } });
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
    [{ state: "DECLARED" as const, raw: { progress: "DECLARED" as const } }, true],
    [{ state: "PRE_DECLARED" as const, raw: { stage: "PRE_DECLARED" as const } }, false],
  ])("kết quả %o → đang hỏi trạng thái = %s", async (patch, polling) => {
    seedResult(patch);
    expect(unwrap(await getSubmission(deps, declarant, D)).inProgress).toBe(polling);
  });

  it("danh sách: hồ sơ bị xóa → bỏ qua", async () => {
    dossiers.rows = [];
    expect(unwrap(await listCustomsDeclarations(deps, declarant))).toEqual([]);
  });

  it("danh sách: chưa truyền → READY, thời điểm = ngày duyệt; không có ngày duyệt → ngày cập nhật hồ sơ", async () => {
    expect(unwrap(await listCustomsDeclarations(deps, declarant))[0]).toEqual({ dossierId: D, dossierCode: "HS-NK-2610-021", direction: "NK", partner: "HANSOL", typeCode: "A11", state: "READY", stage: "NOT_SENT", updatedAt: "2026-10-14T02:00:00.000Z" });
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

  it("tra cứu (IEX cũ/IID): chỉ tra trạng thái → ghi OUT + IN mã IID (tờ khai nhập), INSPECTING, không tạo outbox", async () => {
    seedResult();
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chờ kiểm tra", cleared: false }) });
    expect(unwrap(await resendOperation(deps, declarant, D, "IEX"))).toEqual({ resent: false, message: "Trạng thái tờ khai: Chờ kiểm tra" });
    expect(uow.data.messages.map((m) => `${m.operation}/${m.direction}`)).toEqual(["IID/OUT", "IID/IN"]);
    expect(uow.data.messages[1]?.summary).toBe("Trạng thái tờ khai: Chờ kiểm tra");
    expect(uow.data.results[0]).toMatchObject({ state: "DECLARED", clearanceStatus: "INSPECTING", raw: { lastStatus: "Chờ kiểm tra" } });
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

  it.each([[{ progress: "PRE_DECLARED" }], [null]])("tra cứu khi mới khai tạm (raw %o) → giữ giai đoạn khai tạm, không đổi trạng thái thông quan", async (raw) => {
    seedResult({ state: "PRE_DECLARED", raw, clearanceStatus: "WAITING" });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Đã khai trước", cleared: false }) });
    unwrap(await resendOperation(deps, declarant, D, "IEX"));
    expect(uow.data.results[0]).toMatchObject({ state: "PRE_DECLARED", clearanceStatus: "WAITING", raw: { stage: "PRE_DECLARED" } });
  });

  it.each([
    ["EDA" as const, { stage: "NOT_SENT" as const }, { status: "s", cleared: false, declarationNo: "307000000001" }],
    ["EDC" as const, { stage: "PRE_DECLARED" as const }, { status: "s", cleared: false, channel: "GREEN" as const }],
    ["HYS" as const, { stage: "DECLARED" as const, receiptNo: "HYS00000001", done: ["HYS" as const] }, { status: "s", cleared: false }],
  ])("%s đã được Hải quan ghi nhận → không gửi lại", async (op, raw, status) => {
    seedResult({ raw });
    deps.gateway = gw({ queryStatus: async () => status });
    expect(unwrap(await resendOperation(deps, declarant, D, op))).toEqual({ resent: false, message: `Hải quan đã ghi nhận ${op}, không cần gửi lại – bấm Tra cứu để cập nhật` });
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
    expect(unwrap(await resendOperation(deps, declarant, D, "IDC"))).toEqual({ resent: false, message: "Khai chính thức tờ khai đang được gửi" });
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

  it("SEND_FAILED không có raw → gửi lại từ bước đầu (APPROVED / chưa khai)", async () => {
    seedResult({ state: "SEND_FAILED", declarationNo: null, raw: null });
    seedOutbox({ status: "FAILED", attempts: 1 });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await resendOperation(deps, declarant, D, "IDA"));
    expect(uow.data.results[0]).toMatchObject({ state: "APPROVED", raw: null });
  });

  it("nghiệp vụ đã thành công → không gửi lại (INVALID_STATE)", async () => {
    seedResult({ raw: { stage: "DECLARED" } });
    seedOutbox({ operation: "PORT_FEE", idempotencyKey: `${D}:PORT_FEE:n1`, status: "SENT" });
    deps.gateway = gw({ queryStatus: async () => ({ status: "s", cleared: false }) });
    expect(errCode(await resendOperation(deps, declarant, D, "PORT_FEE"))).toBe("INVALID_STATE");
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

  it("outbox của nghiệp vụ tra cứu (IEX) → NOT_SUPPORTED", async () => {
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
    expect(notifier.sent[0]).toMatchObject({ audience: { dossierOwnerOf: D }, draft: { title: "HS-NK-2610-021: Khai tạm thông tin tờ khai bị từ chối" } });
  });

  it("IDA thành công nhưng chưa có số tờ khai → ghi “(chưa có)”, sang giai đoạn khai tạm, không tự tạo IDC", async () => {
    seedResult({ externalId: null, declarationNo: null, state: "APPROVED", raw: { progress: "APPROVED" } });
    deps.gateway = gw({ preDeclare: async () => ({ externalId: "fpt-9" }) });
    const ob = seedOutbox();
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: null });
    expect(uow.data.messages.find((m) => m.direction === "IN")?.summary).toBe("Hải quan cấp số tờ khai (chưa có) – kiểm tra thuế dự kiến rồi khai chính thức");
    expect(uow.data.results[0]).toMatchObject({ state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED", done: ["IDA"] } });
    expect(uow.data.outbox).toHaveLength(1);
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
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: null });
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

  it("HYS thành công không có số tiếp nhận → tóm tắt không kèm số; giữ giai đoạn, ghi đã làm, không xếp job hỏi", async () => {
    seedResult({ state: "DECLARED", raw: { progress: "DECLARED" } });
    deps.gateway = gw({ attachDocuments: async () => ({}) });
    const ob = seedOutbox({ operation: "HYS", idempotencyKey: `${D}:HYS:v2`, payload: { files: [{ name: "inv.pdf", storageKey: "k/inv.pdf" }] } });
    expect(unwrap(await send(ob.id))).toEqual({ status: "SENT", next: null });
    expect(uow.data.messages.find((m) => m.direction === "IN")?.summary).toBe("Đã tiếp nhận hồ sơ chứng từ điện tử (1 tệp)");
    expect(uow.data.results[0]?.raw).toMatchObject({ stage: "DECLARED", done: ["HYS"], side: { HYS: "Đã tiếp nhận 1 tệp" } });
    expect(queue.jobs).toHaveLength(0);
  });

  it("IDC thành công → không tự tạo HYS; xếp job hỏi trạng thái", async () => {
    seedResult({ state: "PRE_DECLARED", channel: null, raw: { progress: "PRE_DECLARED" } });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).next).toBeNull();
    expect(uow.data.outbox.filter((o) => o.operation === "HYS")).toHaveLength(0);
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "customs-poll", payload: expect.objectContaining({ dossierId: D, attempt: 1 }) })]);
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

// ───────────────────────── Luồng nghiệp vụ: gọi sửa, sửa đổi bổ sung, sau thông quan, chứng từ & cảng ─────────────────────────

/** Gateway không bao giờ thông quan (để đi nhánh sửa đổi bổ sung trước thông quan). */
const neverClear = () => gw({ queryStatus: async () => ({ status: "Chờ kiểm tra chi tiết hồ sơ", cleared: false }) });
const view = async () => unwrap(await getSubmission(deps, declarant, D));
const perform = (op: Parameters<typeof performOperation>[3], ctx: Ctx = declarant) => performOperation(deps, ctx, D, op);
const declared = async () => {
  unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
  await drain();
  unwrap(await perform("IDC"));
  await drain();
};

describe("performOperation – luồng nghiệp vụ", () => {
  it("IDB gọi sửa tờ khai tạm → mở lại tờ khai; IDA ở chế độ sửa cho tới khi duyệt lại; duyệt lại → khai tạm lại (khóa n1) → về khai tạm", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    unwrap(await perform("IDB"));
    await drain();
    expect(decls.reopened).toEqual([D]);
    let v = await view();
    expect(v.stage).toBe("RECALLED");
    expect(v.pipeline.find((p) => p.op === "IDA")).toMatchObject({ enabled: true, action: "EDIT", reason: expect.stringMatching(/Review/) });
    expect(notifier.sent.at(-1)?.draft.title).toMatch(/gọi tờ khai về sửa \(IDB\)/);
    expect(errCode(await perform("IDA"))).toBe("INVALID_STATE");
    decls.status = "APPROVED"; // Người duyệt phê duyệt lại
    dossiers.rows[0]!.status = "APPROVED";
    // Nút chính “Ký số & khai tạm” đi qua submitDeclaration nhưng không tạo kết quả truyền mới.
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.outbox.filter((o) => o.operation === "IDA").map((o) => o.idempotencyKey)).toEqual([`${D}:IDA:v2`, `${D}:IDA:n2`]);
    expect(uow.data.results).toHaveLength(1);
    await drain();
    v = await view();
    expect(v).toMatchObject({ stage: "PRE_DECLARED", nextOp: "IDC" });
    expect(decls.status).toBe("SUBMITTED");
  });

  it("sửa đổi bổ sung: IDD → (sửa, duyệt lại) IDA01 → IDE → về DECLARED, đếm 1 lần sửa đổi, hỏi trạng thái lại", async () => {
    deps.gateway = neverClear();
    await declared();
    expect((await view()).stage).toBe("DECLARED");
    unwrap(await perform("IDD"));
    await drain();
    expect((await view()).stage).toBe("AMEND_RECALLED");
    expect(decls.status).toBe("DRAFT");
    expect(errCode(await perform("IDA01"))).toBe("INVALID_STATE"); // chưa duyệt lại
    decls.status = "APPROVED";
    unwrap(await perform("IDA01"));
    await drain();
    expect((await view())).toMatchObject({ stage: "AMEND_PRE_DECLARED", nextOp: "IDE" });
    queue.jobs.length = 0;
    unwrap(await perform("IDE"));
    const ide = uow.data.outbox.find((o) => o.operation === "IDE")!;
    await processOutbox(deps, { orgId: ORG, userId: "usr_chau", outboxId: ide.id });
    const v = await view();
    expect(v).toMatchObject({ stage: "DECLARED", amendments: 1 });
    expect(v.pipeline.find((p) => p.op === "IDE")).toMatchObject({ status: "OK", summary: expect.stringMatching(/sửa đổi bổ sung/) });
    expect(queue.jobs.some((j) => j.name === "customs-poll")).toBe(true);
  });

  it("sau thông quan: lập bản khai bổ sung (tờ khai gốc giữ nguyên) → duyệt → AMA → AMB → duyệt lại → AMA → AMC → CLEARED", async () => {
    gateway = new FakeCustomsGateway({ alwaysGreen: true });
    deps.gateway = gateway;
    await declared();
    expect((await view())).toMatchObject({ stage: "CLEARED" });
    expect((await view()).pipeline.find((p) => p.op === "AMA")).toMatchObject({ enabled: true, action: "START_POST_EDIT" });
    expect(errCode(await perform("AMA"))).toBe("INVALID_STATE");
    const before = decls.status;
    unwrap(await startPostAmendment(deps, declarant, D));
    expect((await view()).stage).toBe("POST_EDITING");
    expect(decls.reopened).toEqual([]);
    expect(decls.status).toBe(before);
    let pa = unwrap(await getPostAmendmentView(deps, declarant, D)).current!;
    expect(pa).toMatchObject({ status: "DRAFT", seq: 1, header: { TK_YNK: "I", TK_ICB: "A11", TK_TTC: "VND" }, lines: [] });
    expect((await view()).pipeline.find((p) => p.op === "AMA")).toMatchObject({ action: "EDIT" });

    expect(errCode(await approvePostAmendment(deps, approver, D))).toBe("VALIDATION");
    pa = unwrap(await addPostAmendmentLines(deps, declarant, D, [1]));
    expect(pa.lines[0]!.values).toMatchObject({ HAG_RAN: "01", HAG_CMB: "Vòng bi", HAG_CMA: "Vòng bi", HAG_MKT: "84821000", HAG_MK1: "VB903", HAG_AK1: "VB903" });
    pa = unwrap(await updatePostAmendmentField(deps, declarant, D, { lineId: pa.lines[0]!.id, key: "HAG_AKB", value: "100000000" }));
    expect(pa.lines[0]!.values).toMatchObject({ HAG_AKA: "3000000.0000", HAG_AB1: "103000000", HAG_AA1: "8240000.0000" });
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REC", value: "2" }));
    expect(audits.map((a) => a.key)).toEqual(["ama:1:1:HAG_AKB", "ama:1:TK_REC"]);
    expect(errCode(await updatePostAmendmentField(deps, declarant, D, { key: "TK_ICN", value: "1" }))).toBe("INVALID_STATE");
    expect(errCode(await approvePostAmendment(deps, declarant, D))).toBe("FORBIDDEN");
    unwrap(await approvePostAmendment(deps, approver, D));

    unwrap(await perform("AMA"));
    await drain();
    expect((await view()).stage).toBe("POST_PRE_DECLARED");
    const sent = uow.data.outbox.find((o) => o.operation === "AMA")!.payload as { request: { objVN_AMA: Record<string, unknown>; objVN_AMA_HANG: Record<string, unknown>[] } };
    expect(sent.request.objVN_AMA).toMatchObject({ tK_YNK: "I", tK_REC: "2", tK_ICB: "A11" });
    expect(sent.request.objVN_AMA_HANG[0]).toMatchObject({ haG_RAN: "01", haG_AKB: 100000000, haG_AKA: "3000000.0000" });
    pa = unwrap(await getPostAmendmentView(deps, declarant, D)).current!;
    expect(pa).toMatchObject({ status: "PRE_DECLARED", result: { TK_SYN: expect.stringMatching(/^SD/), TK_A25: "1" } });
    expect(errCode(await updatePostAmendmentField(deps, declarant, D, { key: "TK_NTA", value: "x" }))).toBe("INVALID_STATE");

    unwrap(await perform("AMB"));
    await drain();
    expect((await view()).stage).toBe("POST_RECALLED");
    expect(decls.reopened).toEqual([]);
    expect(unwrap(await getPostAmendmentView(deps, declarant, D)).current?.status).toBe("RECALLED");
    unwrap(await approvePostAmendment(deps, approver, D));
    unwrap(await perform("AMA"));
    await drain();
    unwrap(await perform("AMC"));
    await drain();
    const v = await view();
    expect(v).toMatchObject({ stage: "CLEARED", postAmendments: 1, result: { clearanceStatus: "CLEARED" } });
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
    const final = unwrap(await getPostAmendmentView(deps, declarant, D));
    expect(final.current).toBeNull();
    expect(final.history.map((h) => h.status)).toEqual(["REGISTERED"]);
    expect(uow.data.outbox.filter((o) => o.operation === "AMA").map((o) => o.idempotencyKey)).toEqual([`${D}:AMA:n1`, `${D}:AMA:n2`]);
  });

  it("bản khai bổ sung: org khác không đọc/ghi được; nguyên tắc 4 mắt chặn người tạo hồ sơ tự duyệt", async () => {
    deps.gateway = new FakeCustomsGateway({ alwaysGreen: true });
    await declared();
    unwrap(await startPostAmendment(deps, declarant, D));
    unwrap(await addPostAmendmentLines(deps, declarant, D, [1]));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REC", value: "6" }));
    expect(unwrap(await getPostAmendmentView(deps, other, D)).current).toBeNull();
    expect(errCode(await updatePostAmendmentField(deps, other, D, { key: "TK_REC", value: "1" }))).toBe("NOT_FOUND");
    fourEyes = true;
    dossiers.rows[0]!.ownerId = "usr_duyet";
    expect(errCode(await approvePostAmendment(deps, approver, D))).toBe("FORBIDDEN");
    dossiers.rows[0]!.ownerId = "usr_chau";
    unwrap(await approvePostAmendment(deps, approver, D));
  });

  it("chứng từ & cảng: container qua khu vực giám sát và lệ phí cảng biển – ghi số tiếp nhận, đánh dấu đã làm, không đổi giai đoạn", async () => {
    deps.gateway = neverClear();
    await declared();
    unwrap(await perform("CONT"));
    await drain();
    unwrap(await perform("PORT_FEE"));
    await drain();
    const v = await view();
    expect(v.stage).toBe("DECLARED");
    expect(v.pipeline.find((p) => p.op === "CONT")).toMatchObject({ status: "OK", summary: expect.stringMatching(/1 container.*SITU2246781/) });
    expect(v.pipeline.find((p) => p.op === "PORT_FEE")).toMatchObject({ status: "OK", summary: expect.stringMatching(/mô phỏng/) });
    expect(uow.data.results[0]!.raw).toMatchObject({ done: expect.arrayContaining(["CONT", "PORT_FEE"]), side: { CONT: expect.any(String), PORT_FEE: expect.any(String) } });
  });

  it("tra cứu IID trả lời ngay (không outbox); đang chờ phản hồi một nghiệp vụ → nghiệp vụ khác bị chặn", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(errCode(await perform("IID"))).toBe("INVALID_STATE"); // chưa có số tờ khai
    await drain();
    expect(unwrap(await perform("IID"))).toMatchObject({ sent: false, message: expect.stringMatching(/^Trạng thái tờ khai/) });
    expect(uow.data.outbox).toHaveLength(1);
    unwrap(await perform("IDC"));
    const r = await perform("IDB");
    expect(r).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringMatching(/Đang chờ phản hồi IDC/) } });
  });

  it("chặn: chưa truyền; nghiệp vụ sai giai đoạn (lý do rõ); BLOCKER khi gửi nội dung; VIEWER; org khác; sai chiều tờ khai", async () => {
    expect(errCode(await perform("IDC"))).toBe("INVALID_STATE");
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    expect(await perform("IDD")).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringMatching(/khai chính thức/) } });
    expect(errCode(await perform("EDC"))).toBe("VALIDATION");
    expect(errCode(await perform("IDC", viewer))).toBe("FORBIDDEN");
    expect(errCode(await perform("IDC", other))).toBe("NOT_FOUND");
    unwrap(await perform("IDB"));
    await drain();
    decls.status = "APPROVED";
    blockers = 1;
    expect(errCode(await perform("IDA"))).toBe("BLOCKER_FAILED");
    expect(errCode(await startPostAmendment(deps, declarant, D))).toBe("INVALID_STATE");
  });

  it("cổng FPT chưa hỗ trợ nghiệp vụ (chưa có đặc tả) → outbox FAILED, dòng ERROR nêu NOT_SUPPORTED, giữ giai đoạn", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    deps.gateway = gw({ send: async () => { throw domainError("NOT_SUPPORTED", "Nghiệp vụ IDB chưa kết nối FPT.VNACCS"); } });
    unwrap(await perform("IDB"));
    await drain();
    const v = await view();
    expect(v.stage).toBe("PRE_DECLARED");
    expect(v.pipeline.find((p) => p.op === "IDB")).toMatchObject({ status: "ERROR", summary: expect.stringMatching(/NOT_SUPPORTED/) });
    expect(decls.reopened).toEqual([]);
    expect(uow.data.results[0]!.state).toBe("SEND_FAILED");
  });
});

describe("rejection – lỗi Hải quan gắn vào chỉ tiêu", () => {
  it("IDA bị từ chối → view.rejection có mã chỉ tiêu + dòng hàng; gửi lại thành công → xóa", async () => {
    let calls = 0;
    const gw: CustomsGateway = gateway; // ghi đè hành vi theo kiểu cổng (port), không theo kiểu suy ra của cổng giả
    const real = gateway.preDeclare.bind(gateway);
    gw.preDeclare = async (orgId, msg) => {
      calls += 1;
      if (calls === 1) return { externalId: `fpt-${hashId(D)}`, errors: [{ code: "MOCK-REQ", field: "EPA", message: "Chưa nhập địa chỉ người xuất khẩu", solution: "Nhập địa chỉ" }, { code: "E1004", field: "CMD", message: "Mã HS không tồn tại", line: 2 }] };
      return real(orgId, msg);
    };
    // Lần khai bị từ chối: Hải quan chưa ghi nhận tờ khai (tra cứu không có số) → được gửi lại.
    const realQuery = gateway.queryStatus.bind(gateway);
    gw.queryStatus = async (o, e, d) => (calls < 2 ? { status: "Chưa ghi nhận", cleared: false } : realQuery(o, e, d));
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    let v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.rejection).toMatchObject({ operation: "IDA", at: "2026-10-14T03:00:00.000Z", errors: [{ code: "MOCK-REQ", field: "EPA", solution: "Nhập địa chỉ" }, { code: "E1004", field: "CMD", line: 2 }] });
    unwrap(await resendOperation(deps, declarant, D, "IDA"));
    await drain();
    v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.rejection).toBeNull();
    expect(v.stage).toBe("PRE_DECLARED");
  });
});
