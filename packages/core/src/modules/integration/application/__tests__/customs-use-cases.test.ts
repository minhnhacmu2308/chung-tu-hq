import { beforeEach, describe, expect, it } from "vitest";
import type { DeclarationStatus, DocKind } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { errCode, unwrap } from "../../../../shared/result.js";
import type { ProgressEvent } from "../../../dossier/index.js";
import { lockedSheetCount } from "@kb/contracts";
import { buildFptRequest, type DeclarationPayload } from "../../domain/declaration-to-fpt.js";
import type { CustomsDeps, CustomsDossierPort, CustomsGateway, CustomsUow, DeclarationReader, DossierBrief, MessageRow, OutboxRow, ResultRow } from "../customs-ports.js";
import { dossierCustomsSummaries, getSubmission, listCustomsDeclarations } from "../get-submission.js";
import { markOutboxFailed, reopenDeclaration } from "../reopen-declaration.js";
import { domainError } from "../../../../shared/errors.js";
import { RecordingUsageMeter } from "../../../../shared/usage.js";
import { MAX_POLLS, pollStatus } from "../poll-status.js";
import { MAX_ATTEMPTS, processOutbox } from "../process-outbox.js";
import { resendOperation } from "../resend-operation.js";
import { enqueueBranchPreDeclare, outboxKey, submitDeclaration } from "../submit-declaration.js";
import { requeueStuckOutbox } from "../requeue-stuck-outbox.js";
import { performOperation, startPostAmendment } from "../perform-operation.js";
import { addPostAmendmentLines, approvePostAmendment, copyPostAmendmentHeader, getPostAmendmentView, updatePostAmendmentField } from "../post-amendment.js";
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
  /** Phiên bản tờ khai (duyệt lại sau khi sửa → tăng). */
  version = 2;
  /** Ghi đè chỉ tiêu của payload (giá trị rỗng = người khai xóa ô sau khi duyệt). */
  fields: Record<string, { value: string }> = {};
  /** Ghi đè dòng hàng (lô > 50 dòng → nhiều tờ khai nhánh). */
  items: DeclarationPayload["items"] | null = null;
  /** Lần phê duyệt hiện tại (duyệt lại sau khi mở lại → đổi; phiên bản giữ nguyên). */
  approvedAt: string | null = null;
  /** Thuế dự tính từng tờ khai nhánh (lô nhiều tờ). */
  branchTaxVnd: string[] | undefined = undefined;
  readonly submitted: string[] = [];
  async get(_orgId: string, dossierId: string) {
    if (dossierId === "dos_none") return null;
    const p = payload(this.kind);
    return { declarationId: "dec_1", version: this.version, status: this.status, payload: { ...p, fields: { ...p.fields, ...this.fields }, ...(this.items ? { items: structuredClone(this.items) } : {}) }, unconfirmedHs: this.unconfirmedHs, estimatedTaxVnd: "58449312", exchangeRateDate: this.rateDate, approvedAt: this.approvedAt, ...(this.branchTaxVnd ? { branchTaxVnd: this.branchTaxVnd } : {}) };
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
  it("lần trước crash sau khi đánh dấu SUBMITTED mà chưa đẩy job (outbox PENDING, attempts 0) → bấm truyền lại đẩy lại đúng job đó", async () => {
    const r = unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    queue.jobs.length = 0; // mô phỏng job chưa từng được đẩy
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(queue.jobs).toEqual([{ name: "customs-send", payload: { orgId: ORG, userId: "usr_chau", outboxId: r.outboxId }, jobId: `customs-send:${r.outboxId}` }]);
    expect(uow.data.outbox).toHaveLength(1);
    // Job đã chạy (attempts > 0) thì không đẩy lại.
    uow.data.outbox[0]!.attempts = 1;
    queue.jobs.length = 0;
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(queue.jobs).toHaveLength(0);
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
  const row: ResultRow = { id: "res_1", orgId: ORG, dossierId: D, branch: 1, externalId: "fpt-1", declarationNo: "107000000001", channel: "YELLOW", channelNote: null, clearanceStatus: "INSPECTING", customsTaxVnd: null, state: "DOCS_SENT", pollCount: 0, raw: { progress: "DOCS_SENT" }, updatedAt: T, ...p };
  uow.data.results.push(row);
  return row;
};
const seedOutbox = (p: Partial<OutboxRow> = {}): OutboxRow => {
  const row: OutboxRow = { id: `ob_${uow.data.outbox.length + 1}`, orgId: ORG, dossierId: D, branch: 1, declarationId: "dec_1", operation: "IDA", idempotencyKey: `${D}:IDA:v2`, payload: { request: null }, status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: null, createdAt: T, updatedAt: T, ...p };
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
    expect(unwrap(await listCustomsDeclarations(deps, declarant))[0]).toEqual({ dossierId: D, dossierCode: "HS-NK-2610-021", branch: 1, of: 1, direction: "NK", partner: "HANSOL", typeCode: "A11", state: "READY", stage: "NOT_SENT", updatedAt: "2026-10-14T02:00:00.000Z" });
    (decls as DeclarationReader).listForCustoms = async () => [{ dossierId: D, status: "APPROVED", approvedAt: null }];
    dossiers.rows[0]!.updatedAt = new Date("2026-10-10T00:00:00.000Z");
    expect(unwrap(await listCustomsDeclarations(deps, declarant))[0]?.updatedAt).toBe("2026-10-10T00:00:00.000Z");
  });

  it("danh sách: có kết quả + thông điệp → luồng (ghi chú mặc định), thuế, thao tác cuối; sắp xếp mới nhất trước", async () => {
    dossiers.rows.push({ ...dossiers.rows[0]!, id: "dos_2", code: "HS-NK-2610-022" });
    decls.listForCustoms = async () => [{ dossierId: D, status: "SUBMITTED", approvedAt: T }, { dossierId: "dos_2", status: "APPROVED", approvedAt: new Date("2026-10-15T00:00:00.000Z") }];
    seedResult({ customsTaxVnd: "58449312" });
    uow.data.messages.push({ id: "m1", orgId: ORG, dossierId: D, branch: 1, operation: "HYS", direction: "IN", result: "OK", summary: "ok", payloadMasked: {}, externalRef: null, at: T });
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

describe("ghi chi phí Customs Hub (usage_events)", () => {
  let meter: RecordingUsageMeter;
  beforeEach(() => {
    meter = new RecordingUsageMeter();
    deps.usage = meter;
  });
  const sends = () => meter.events.filter((e) => e.kind === "CUSTOMS_SEND").map((e) => e.operation);
  const queries = () => meter.events.filter((e) => e.kind === "CUSTOMS_QUERY").map((e) => e.operation);

  it("luồng IDA → IDC → hỏi IID tới thông quan: mỗi nghiệp vụ gửi thật 1 sự kiện, mỗi lần hỏi trạng thái 1 sự kiện", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    unwrap(await perform("IDC"));
    await drain();
    expect(sends()).toEqual(["IDA", "IDC"]);
    expect(queries().length).toBe(uow.data.results[0]!.pollCount);
    expect(queries().every((q) => q === "IID")).toBe(true);
    expect(meter.events.every((e) => e.provider === "CUSTOMS_HUB" && e.orgId === ORG && e.dossierId === D && e.quantity === 1)).toBe(true);
    expect(meter.events.find((e) => e.operation === "IDA")?.dedupeKey).toBe(`customs:${D}:IDA:v2`);
  });

  it("lỗi tạm (503) rồi thử lại thành công → chỉ 1 sự kiện IDA; job chạy lại sau khi đã SENT → không ghi thêm", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const ob = uow.data.outbox[0]!.id;
    deps.gateway = gw({ preDeclare: async () => { throw new Error("FPT 503"); } });
    await expect(send(ob)).rejects.toThrow(/503/);
    expect(meter.events).toEqual([]);
    deps.gateway = gateway;
    unwrap(await send(ob));
    unwrap(await send(ob));
    expect(sends()).toEqual(["IDA"]);
  });

  it("đã gửi nhưng chưa kịp ghi SENT (crash) → job chạy lại gửi lại cùng khóa idempotency, không tính hai lần", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    unwrap(await send(ob.id));
    // Mô phỏng crash: dòng outbox vẫn PENDING như trước khi ghi kết quả.
    Object.assign(uow.data.outbox[0]!, { status: "PENDING", attempts: 1 });
    unwrap(await send(ob.id));
    expect(sends()).toEqual(["IDC"]);
  });

  it("Hải quan từ chối nghiệp vụ (có danh sách lỗi) → thông điệp đã xử lý, vẫn ghi 1 lần", async () => {
    seedResult({ state: "PRE_DECLARED", raw: { progress: "PRE_DECLARED" } });
    deps.gateway = gw({ declare: async () => ({ accepted: false, errors: [{ code: "E1", message: "sai" }] }) });
    const ob = seedOutbox({ operation: "IDC", idempotencyKey: `${D}:IDC:v2` });
    expect(unwrap(await send(ob.id)).status).toBe("FAILED");
    expect(sends()).toEqual(["IDC"]);
  });

  it("cổng chưa hỗ trợ nghiệp vụ (chưa gửi được) → không ghi", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    deps.gateway = gw({ send: async () => { throw domainError("NOT_SUPPORTED", "Nghiệp vụ IDB chưa kết nối FPT.VNACCS"); } });
    unwrap(await perform("IDB"));
    await drain();
    expect(sends()).toEqual(["IDA"]);
  });

  it("chạy lại IDA sau crash: tra IID thấy đã cấp số → ghi 1 lần hỏi IID, không gửi/ghi IDA lần hai", async () => {
    seedResult({ externalId: "fpt-1", declarationNo: null, state: "APPROVED", raw: { progress: "APPROVED" } });
    deps.gateway = gw({ queryStatus: async () => ({ declarationNo: "107111", status: "Đã cấp số", cleared: false }), preDeclare: async () => { throw new Error("không được gửi lại"); } });
    const ob = seedOutbox({ attempts: 1 });
    expect(unwrap(await send(ob.id)).status).toBe("SENT");
    expect(sends()).toEqual([]);
    expect(queries()).toEqual(["IID"]);
  });

  it("nút Tra cứu (IID) → 1 sự kiện hỏi trạng thái; meter lỗi không làm hỏng tra cứu", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    unwrap(await perform("IID"));
    expect(queries()).toEqual(["IID"]);
    meter.fail = true;
    expect(unwrap(await perform("IID")).sent).toBe(false);
  });
});

describe("requeueStuckOutbox – job quét outbox kẹt", () => {
  it("PENDING attempts 0 quá 10 phút → đẩy lại đúng job customs-send:<id>; đã có lần xử lý / còn mới / org khác → không", async () => {
    const r = unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    queue.jobs.length = 0;
    expect((await requeueStuckOutbox(deps, { orgId: ORG })).requeued).toEqual([]); // vừa tạo
    uow.data.outbox[0]!.createdAt = new Date(deps.clock.now().getTime() - 15 * 60_000);
    expect((await requeueStuckOutbox(deps, { orgId: ORG })).requeued).toEqual([r.outboxId]);
    expect(queue.jobs).toEqual([{ name: "customs-send", payload: { orgId: ORG, userId: "", outboxId: r.outboxId }, jobId: `customs-send:${r.outboxId}` }]);
    uow.data.outbox[0]!.attempts = 1;
    expect((await requeueStuckOutbox(deps, { orgId: ORG })).requeued).toEqual([]);
    expect((await requeueStuckOutbox(deps, { orgId: "org_b" })).requeued).toEqual([]);
  });
});

// ───────────────────────── Tờ khai nhánh (lô > 50 dòng): truyền lần đầu + khai tạm nối tiếp ─────────────────────────

const lines = (n: number): DeclarationPayload["items"] => Array.from({ length: n }, (_, i) => ({ ...payload().items[0]!, lineNo: i + 1, description: `Vòng bi ${i + 1}` }));
type IdaReq = { objVN_IDA: Record<string, unknown> };
const idaOf = (o: OutboxRow) => (o.payload as { request: IdaReq }).request.objVN_IDA;
const idaOutbox = (branch: number) => uow.data.outbox.filter((o) => o.branch === branch && o.operation === "IDA");
const stages = () => uow.data.results.map((r) => [r.branch, r.raw?.stage, r.declarationNo]);
/** Cổng giả cấp số tờ khai theo số tờ (tK_BNO): tờ k → 10400000000k; `reject(tờ, lần gọi)` → Hải quan từ chối. */
/** Số tờ (tK_BNO) của từng lần gọi preDeclare. */
let preDeclared: number[] = [];
const branchGateway = (reject: (bno: number, call: number) => boolean = () => false, o: Partial<CustomsGateway> = {}) => {
  const calls = new Map<number, number>();
  preDeclared = [];
  return gw({
    preDeclare: async (_org, msg) => {
      const bno = Number((msg.request as IdaReq).objVN_IDA["tK_BNO"] ?? 1);
      const n = (calls.get(bno) ?? 0) + 1;
      calls.set(bno, n);
      preDeclared.push(bno);
      return reject(bno, n) ? { externalId: `fpt-b${bno}`, errors: [{ code: "E-X", message: "Từ chối" }] } : { externalId: `fpt-b${bno}`, declarationNo: `10400000000${bno}` };
    },
    ...o,
  });
};

describe("tờ khai nhánh – truyền lần đầu + khai tạm nối tiếp", () => {
  beforeEach(() => {
    decls.items = lines(120);
  });

  it("outboxKey: nhánh 1 giữ dạng cũ; nhánh ≥ 2 thêm :b<no>", () => {
    expect(outboxKey(D, "IDA", 2)).toBe(`${D}:IDA:v2`);
    expect(outboxKey(D, "IDA", 2, 1)).toBe(`${D}:IDA:v2:retry1`);
    expect(outboxKey(D, "IDA", 2, 0, 1)).toBe(`${D}:IDA:v2`);
    expect(outboxKey(D, "IDA", 2, 0, 2)).toBe(`${D}:IDA:v2:b2`);
    expect(outboxKey(D, "EDA", 3, 1, 3)).toBe(`${D}:EDA:v3:retry1:b3`);
  });

  it("lô 120 dòng: 3 kết quả NOT_SENT, chỉ 1 outbox IDA nhánh 1 khóa cũ (tờ 1/3, TK_FIC F); hồ sơ SUBMITTED", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.results.map((r) => [r.branch, r.raw?.stage, r.raw?.certificateId])).toEqual([[1, "NOT_SENT", "cert_1"], [2, "NOT_SENT", "cert_1"], [3, "NOT_SENT", "cert_1"]]);
    expect(uow.data.outbox).toHaveLength(1);
    expect(uow.data.outbox[0]).toMatchObject({ branch: 1, operation: "IDA", idempotencyKey: `${D}:IDA:v2`, status: "PENDING" });
    expect(idaOf(uow.data.outbox[0]!)).toMatchObject({ tK_FIC: "F", tK_BNO: 1, tK_DNO: 3 });
    expect(queue.jobs).toHaveLength(1);
    expect(decls.submitted).toEqual([D]);
    expect(dossiers.rows[0]).toMatchObject({ status: "SUBMITTED", step: "submit" });
  });

  it("dòng 75 (tờ 2) thiếu ô bắt buộc → REQUIRED_FIELDS_MISSING_SUBMIT nêu tờ và dòng gốc, không tạo outbox/kết quả nào", async () => {
    decls.items![74]!.description = "";
    const r = await submitDeclaration(deps, declarant, D, "cert_1");
    expect(r).toMatchObject({ ok: false, error: { code: "VALIDATION", reason: "REQUIRED_FIELDS_MISSING_SUBMIT", message: expect.stringContaining("Tờ 2/3: Dòng hàng 75") } });
    expect(uow.data.outbox).toHaveLength(0);
    expect(uow.data.results).toHaveLength(0);
    expect(decls.submitted).toEqual([]);
    expect(dossiers.rows[0]!.status).toBe("APPROVED");
  });

  it("IDA nhánh 1 thành công → tự khai tạm nhánh 2 (TK_FIC = số tờ 1); nhánh 2 xong → nhánh 3; nhánh 3 xong → dừng", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain(1);
    expect(idaOutbox(2)).toHaveLength(1);
    expect(idaOutbox(2)[0]).toMatchObject({ idempotencyKey: `${D}:IDA:v2:b2`, status: "PENDING", declarationId: "dec_1" });
    expect(idaOf(idaOutbox(2)[0]!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 2, tK_DNO: 3 });
    expect(idaOutbox(3)).toHaveLength(0);
    await drain(1);
    expect(idaOutbox(3)).toHaveLength(1);
    expect(idaOf(idaOutbox(3)[0]!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 3, tK_DNO: 3 });
    await drain(1);
    expect(queue.jobs).toHaveLength(0);
    expect(uow.data.outbox.map((o) => [o.branch, o.operation, o.status])).toEqual([[1, "IDA", "SENT"], [2, "IDA", "SENT"], [3, "IDA", "SENT"]]);
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
    // Số tờ khai của hồ sơ là số tờ 1; nhật ký ghi đúng nhánh.
    expect(dossiers.rows[0]!.declarationNo).toBe("104000000001");
    expect(uow.data.messages.filter((m) => m.branch === 2).map((m) => [m.operation, m.direction, m.result])).toEqual([["IDA", "OUT", "OK"], ["IDA", "IN", "OK"]]);
  });

  it("chạy lại job nhánh 1 đã SENT → vẫn đúng 1 outbox nhánh 2; crash trước khi nối → chạy lại thì nối; tạo trùng song song → bỏ qua", async () => {
    deps.gateway = branchGateway();
    const { outboxId } = unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain(1);
    await send(outboxId);
    await send(outboxId);
    expect(idaOutbox(2)).toHaveLength(1);
    expect(queue.jobs).toHaveLength(1);
    // Crash sau khi ghi SENT nhánh 1 mà chưa kịp tạo outbox nhánh 2 → BullMQ chạy lại job → nối tiếp.
    uow.data.outbox.splice(uow.data.outbox.findIndex((o) => o.branch === 2), 1);
    queue.jobs.length = 0;
    await send(outboxId);
    expect(idaOutbox(2)).toHaveLength(1);
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "customs-send", payload: expect.objectContaining({ outboxId: idaOutbox(2)[0]!.id }) })]);
    // Hai job cùng nối nhánh 2 → khóa unique: lần thứ hai không tạo thêm.
    unwrap(await enqueueBranchPreDeclare(deps, declarant, D, 2, { by: "chain", version: 2 }));
    expect(idaOutbox(2)).toHaveLength(1);
  });

  it("IDA nhánh 2 bị từ chối → dừng, nhánh 3 giữ NOT_SENT; Gửi lại IDA nhánh 2 thành công → nối nhánh 3", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 2 && n === 1, { queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    expect(idaOutbox(2)[0]).toMatchObject({ status: "FAILED" });
    expect(idaOutbox(3)).toHaveLength(0);
    expect(uow.data.results.map((r) => [r.branch, r.state, r.raw?.stage])).toEqual([[1, "PRE_DECLARED", "PRE_DECLARED"], [2, "SEND_FAILED", "NOT_SENT"], [3, "APPROVED", "NOT_SENT"]]);
    expect(unwrap(await resendOperation(deps, declarant, D, "IDA", 2))).toMatchObject({ resent: true });
    expect(idaOutbox(2).map((o) => o.idempotencyKey)).toEqual([`${D}:IDA:v2:b2`, `${D}:IDA:v2:retry1:b2`]);
    expect(uow.data.messages.filter((m) => m.operation === "IID").every((m) => m.branch === 2)).toBe(true);
    await drain();
    expect(idaOutbox(1)).toHaveLength(1);
    expect(idaOutbox(3)).toHaveLength(1);
    expect(idaOf(idaOutbox(3)[0]!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 3 });
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("tờ khai bị mở lại (DRAFT) trước khi nối → không khai tạm nhánh 2 (bất biến 7), ghi lỗi trên nhánh 2", async () => {
    // Mở lại trong lúc tờ 1 đang gửi (sau bước kiểm ghim của tờ 1).
    const base = branchGateway();
    deps.gateway = { ...base, preDeclare: async (o, m, k) => { decls.status = "DRAFT"; return base.preDeclare(o, m, k); } };
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    expect(preDeclared).toEqual([1]);
    expect(idaOutbox(2)).toHaveLength(0);
    expect(uow.data.results.find((r) => r.branch === 2)?.raw?.stage).toBe("NOT_SENT");
    expect(uow.data.messages.filter((m) => m.branch === 2)).toEqual([expect.objectContaining({ operation: "IDA", direction: "IN", result: "ERROR", summary: expect.stringContaining("Tờ 2/3") })]);
  });

  it("outbox tờ 1 (lô nhiều tờ) cũng ghim lần duyệt: tờ khai mở lại trước khi gửi → không gửi tờ 1, tờ 1 SEND_FAILED", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(idaOutbox(1)[0]!.payload).toMatchObject({ pin: "v2@" });
    decls.status = "DRAFT";
    await drain();
    expect(preDeclared).toEqual([]);
    expect(idaOutbox(1)[0]).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("Tờ 1: không gửi khai tạm") });
    expect(uow.data.results.find((r) => r.branch === 1)!.state).toBe("SEND_FAILED");
  });

  it("lô 40 dòng: một tờ – outbox/khóa/thông điệp như trước, không nối tiếp", async () => {
    decls.items = lines(40);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    const snap = (await decls.get(ORG, D))!;
    expect(uow.data.outbox[0]).toMatchObject({ branch: 1, idempotencyKey: `${D}:IDA:v2` });
    expect((uow.data.outbox[0]!.payload as { request: unknown }).request).toEqual(buildFptRequest(snap.payload).request);
    expect(idaOf(uow.data.outbox[0]!)["tK_FIC"]).toBeUndefined();
    await drain();
    expect(uow.data.outbox).toHaveLength(1);
    expect(uow.data.results).toHaveLength(1);
  });

  it("outbox cũ PENDING tạo trước migration (nhánh 1, khóa cũ) → truyền lại báo ALREADY_SUBMITTED, không tạo trùng", async () => {
    const ob = seedOutbox();
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(uow.data.outbox.map((o) => o.id)).toEqual([ob.id]);
    expect(uow.data.results).toHaveLength(0);
    expect(queue.jobs).toEqual([expect.objectContaining({ payload: expect.objectContaining({ outboxId: ob.id }) })]);
  });

  it("thông điệp tờ 2/3 chỉ chứa đúng lát dòng của tờ (50 dòng 51–100, 20 dòng 101–120), đánh số lại từ 01", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    const hang = (b: number) => ((idaOutbox(b)[0]!.payload as { request: { objVN_IDA_HANG: Record<string, unknown>[] } }).request.objVN_IDA_HANG);
    const desc = (h: Record<string, unknown>) => Object.values(h).find((v) => typeof v === "string" && v.startsWith("Vòng bi"));
    expect([1, 2, 3].map((b) => hang(b).length)).toEqual([50, 50, 20]);
    expect([hang(2)[0]!["haG_B25"], desc(hang(2)[0]!), desc(hang(2).at(-1)!)]).toEqual(["01", "Vòng bi 51", "Vòng bi 100"]);
    expect([hang(3)[0]!["haG_B25"], desc(hang(3)[0]!), desc(hang(3).at(-1)!)]).toEqual(["01", "Vòng bi 101", "Vòng bi 120"]);
  });

  it("outbox nhánh 2 đã xếp nhưng tờ khai bị gọi về sửa (DRAFT) / duyệt lại phiên bản mới → không gửi nội dung cũ: FAILED + lỗi, không nối nhánh 3", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain(1);
    expect(idaOutbox(2)[0]).toMatchObject({ status: "PENDING" });
    decls.status = "DRAFT";
    await drain(1);
    expect(preDeclared).toEqual([1]);
    expect(idaOutbox(2)[0]).toMatchObject({ status: "FAILED", lastError: expect.stringContaining("Tờ 2: không gửi khai tạm") });
    expect(uow.data.messages.filter((m) => m.branch === 2)).toEqual([expect.objectContaining({ operation: "IDA", direction: "IN", result: "ERROR" })]);
    expect(idaOutbox(3)).toHaveLength(0);
    // Duyệt lại phiên bản mới (APPROVED v3): worker không nối bằng nội dung v3 sau các tờ đã gửi v2.
    decls.status = "APPROVED";
    decls.version = 3;
    expect(errCode(await enqueueBranchPreDeclare(deps, declarant, D, 3, { by: "chain", version: 2 }))).toBe("INVALID_STATE");
    expect(idaOutbox(3)).toHaveLength(0);
  });

  it("nhánh 2 bị từ chối, gửi lại đang chờ; tờ khai sang phiên bản mới → bản gửi lại không gửi, Gửi lại tiếp bị chặn, nhánh 3 không được nối", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 2 && n === 1, { queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    unwrap(await resendOperation(deps, declarant, D, "IDA", 2));
    decls.version = 3; // gọi về sửa → duyệt lại → truyền lại (SUBMITTED v3)
    await drain();
    expect(preDeclared).toEqual([1, 2]);
    expect(idaOutbox(2).map((o) => o.status)).toEqual(["FAILED", "FAILED"]);
    expect(idaOutbox(2)[1]!.lastError).toContain("v2, hiện v3");
    expect(errCode(await resendOperation(deps, declarant, D, "IDA", 2))).toBe("INVALID_STATE");
    expect(idaOutbox(3)).toHaveLength(0);
    expect(errCode(await enqueueBranchPreDeclare(deps, declarant, D, 3, { by: "chain", version: 2 }))).toBe("INVALID_STATE");
    // Người dùng (Task 7) chỉ khai khi tờ khai đã duyệt lại.
    expect(errCode(await enqueueBranchPreDeclare(deps, declarant, D, 3, { by: "user" }))).toBe("NOT_APPROVED");
  });

  it("enqueueBranchPreDeclare: insert vi phạm unique (job song song) → ok, không đẩy job; lỗi DB khác → ném ra", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    Object.assign(uow.data.results.find((r) => r.branch === 1)!, { declarationNo: "104000000001", raw: { stage: "PRE_DECLARED", certificateId: "cert_1" } });
    queue.jobs.length = 0;
    const withInsert = (insert: (row: OutboxRow) => Promise<void>): CustomsUow => ({ asOrg: (c, fn) => uow.asOrg(c, (r) => fn({ ...r, outbox: { ...r.outbox, findByKey: async () => null, insert } })) });
    deps.uow = withInsert(async () => { throw new Error("duplicate key value violates unique constraint customs_outbox_key_uq"); });
    unwrap(await enqueueBranchPreDeclare(deps, declarant, D, 2, { by: "chain", version: 2 }));
    expect(queue.jobs).toHaveLength(0);
    deps.uow = withInsert(async () => { throw "connection reset"; });
    await expect(enqueueBranchPreDeclare(deps, declarant, D, 2, { by: "chain", version: 2 })).rejects.toBe("connection reset");
  });

  it("markOutboxFailed (hết lượt thử) đánh SEND_FAILED đúng nhánh của outbox, nhánh 1 giữ nguyên", async () => {
    seedResult({ branch: 1, state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED" } });
    seedResult({ id: "res_2", branch: 2, externalId: null, declarationNo: null, state: "APPROVED", raw: { stage: "NOT_SENT" } });
    const ob = seedOutbox({ branch: 2, idempotencyKey: `${D}:IDA:v2:b2`, attempts: 5 });
    unwrap(await markOutboxFailed(deps, { orgId: ORG, outboxId: ob.id, reason: "timeout" }));
    expect(uow.data.results.map((r) => [r.branch, r.state])).toEqual([[1, "PRE_DECLARED"], [2, "SEND_FAILED"]]);
    expect(uow.data.messages).toEqual([expect.objectContaining({ branch: 2, result: "ERROR" })]);
  });

  it("số tờ giảm giữa hai lần truyền (120 → 90 dòng sau khi tờ 1 bị từ chối trước khi có số) → bỏ kết quả nhánh 3, chuỗi dừng ở tờ 2", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 1 && n === 1);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await drain();
    expect(uow.data.results.map((r) => r.branch)).toEqual([1, 2, 3]);
    unwrap(await reopenDeclaration(deps, declarant, D));
    decls.items = lines(90);
    decls.version = 3;
    decls.status = "APPROVED";
    dossiers.rows[0]!.status = "APPROVED";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.results.map((r) => r.branch).sort()).toEqual([1, 2]);
    await drain();
    expect(uow.data.outbox.filter((o) => o.idempotencyKey.includes(":v3")).map((o) => [o.branch, o.status])).toEqual([[1, "SENT"], [2, "SENT"]]);
    // Kết quả thừa còn sót (dữ liệu cũ) không kéo chuỗi sang tờ 3: dừng theo số tờ của tờ khai.
    seedResult({ id: "res_3", branch: 3, externalId: null, declarationNo: null, state: "APPROVED", raw: { stage: "NOT_SENT" } });
    await send(idaOutbox(2).at(-1)!.id);
    expect(idaOutbox(3)).toHaveLength(0);
    expect(uow.data.messages.filter((m) => m.branch === 3)).toEqual([]);
  });
});

// ───────────────────────── Task 7: nghiệp vụ, hỏi trạng thái, mở lại và trạng thái hồ sơ theo nhánh ─────────────────────────

/** Chỉ chạy job customs-send (job hỏi trạng thái để nguyên trong hàng đợi). */
async function sendAll(max = 30) {
  for (let i = 0; i < max; i++) {
    const at = queue.jobs.findIndex((j) => j.name === "customs-send");
    if (at < 0) return;
    const [job] = queue.jobs.splice(at, 1);
    await send(String((job!.payload as Record<string, unknown>)["outboxId"]));
  }
}
const seedBranch = (branch: number, p: Partial<ResultRow> = {}) =>
  seedResult({ id: `res_${branch}`, branch, externalId: `fpt-b${branch}`, declarationNo: `10400000000${branch}`, state: "DECLARED", raw: { stage: "DECLARED", certificateId: "cert_1" }, ...p });
const pollB = (branch: number, attempt = 1) => pollStatus(deps, { orgId: ORG, userId: "usr_chau", dossierId: D, attempt, branch });
const keysOf = (op: string, branch: number) => uow.data.outbox.filter((o) => o.operation === op && o.branch === branch).map((o) => o.idempotencyKey);

describe("tờ khai nhánh – nghiệp vụ, hỏi trạng thái, mở lại theo nhánh", () => {
  beforeEach(() => {
    decls.items = lines(120);
  });

  it("IDC nhánh 2 dùng externalId/số tờ khai của nhánh 2; IDC nhánh 3 còn NOT_SENT → INVALID_STATE; phân luồng nhánh 2 không ghi đè hồ sơ; hỏi trạng thái theo nhánh 2", async () => {
    const declares: string[] = [];
    deps.gateway = branchGateway((bno) => bno === 3, { declare: async (_o, msg) => (declares.push(msg.externalId), { accepted: true, channel: "RED" as const }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "NOT_SENT", null]]);
    expect(errCode(await performOperation(deps, declarant, D, "IDC", 3))).toBe("INVALID_STATE");
    unwrap(await performOperation(deps, declarant, D, "IDC", 2));
    expect(uow.data.outbox.filter((o) => o.operation === "IDC")).toEqual([expect.objectContaining({ branch: 2, idempotencyKey: `${D}:IDC:n1:b2`, payload: expect.objectContaining({ request: { soToKhai: "104000000002" } }) })]);
    await sendAll();
    expect(declares).toEqual(["fpt-b2"]);
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "DECLARED", "104000000002"], [3, "NOT_SENT", null]]);
    expect(uow.data.results.find((r) => r.branch === 2)!.channel).toBe("RED");
    expect(dossiers.patches).not.toContainEqual(expect.objectContaining({ channel: "RED" }));
    expect(queue.jobs).toEqual([expect.objectContaining({ name: "customs-poll", payload: expect.objectContaining({ dossierId: D, branch: 2, attempt: 1 }) })]);
  });

  it("hỏi trạng thái theo nhánh: nhánh 1 thông quan → hồ sơ vẫn SUBMITTED; nhánh 2, 3 thông quan → CLEARED; báo “đã thông quan” mỗi tờ một lần kèm Tờ k/N", async () => {
    dossiers.rows[0]!.status = "SUBMITTED";
    [1, 2, 3].forEach((b) => seedBranch(b));
    const cleared = new Set<string>();
    const asked: string[] = [];
    deps.gateway = gw({ queryStatus: async (_o, ext) => (asked.push(ext), { status: cleared.has(ext) ? "Đã thông quan" : "Chờ kiểm tra", cleared: cleared.has(ext) }) });
    cleared.add("fpt-b1");
    expect(unwrap(await pollB(1))).toEqual({ done: true, cleared: true });
    expect(dossiers.rows[0]!.status).toBe("SUBMITTED");
    expect(unwrap(await pollB(2))).toEqual({ done: false, cleared: false });
    expect(queue.jobs.at(-1)).toMatchObject({ name: "customs-poll", payload: { dossierId: D, branch: 2, attempt: 2 }, jobId: expect.stringMatching(/:b2$/) });
    cleared.add("fpt-b2");
    cleared.add("fpt-b3");
    unwrap(await pollB(2, 2));
    expect(dossiers.rows[0]!.status).toBe("SUBMITTED");
    unwrap(await pollB(3));
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
    expect(unwrap(await pollB(1))).toEqual({ done: true, cleared: true });
    expect(asked).toEqual(["fpt-b1", "fpt-b2", "fpt-b2", "fpt-b3"]);
    expect(uow.data.results.map((r) => [r.branch, r.raw?.stage, r.clearanceStatus])).toEqual([[1, "CLEARED", "CLEARED"], [2, "CLEARED", "CLEARED"], [3, "CLEARED", "CLEARED"]]);
    expect(notifier.sent.map((n) => n.draft.title)).toEqual(["HS-NK-2610-021 – Tờ 1/3 đã thông quan", "HS-NK-2610-021 – Tờ 2/3 đã thông quan", "HS-NK-2610-021 – Tờ 3/3 đã thông quan"]);
    expect(dossiers.patches.filter((p) => (p as { status?: string }).status === "CLEARED")).toHaveLength(1);
    expect(new Set(uow.data.messages.map((m) => m.branch))).toEqual(new Set([1, 2, 3]));
  });

  it("tra cứu IID nhánh 2 (nút tra cứu và lối tắt của Gửi lại) dùng externalId nhánh 2, ghi nhật ký nhánh 2; đủ nhánh thông quan → CLEARED", async () => {
    dossiers.rows[0]!.status = "SUBMITTED";
    seedBranch(1);
    seedBranch(2);
    const asked: string[] = [];
    deps.gateway = gw({ queryStatus: async (_o, ext) => (asked.push(ext), { status: "Đã thông quan", cleared: true }) });
    unwrap(await performOperation(deps, declarant, D, "IID", 2));
    expect(unwrap(await resendOperation(deps, declarant, D, "IID", 2))).toMatchObject({ resent: false });
    expect(asked).toEqual(["fpt-b2", "fpt-b2"]);
    expect(uow.data.messages.every((m) => m.branch === 2)).toBe(true);
    expect(stages()).toEqual([[1, "DECLARED", "104000000001"], [2, "CLEARED", "104000000002"]]);
    expect(dossiers.rows[0]!.status).toBe("SUBMITTED");
    unwrap(await performOperation(deps, declarant, D, "IID"));
    expect(dossiers.rows[0]!.status).toBe("CLEARED");
  });

  it("chuỗi dừng vì guard → người khai bấm IDA trên tờ đó: khai tạm theo phiên bản đang truyền (khóa như chuỗi), tờ trước chưa khai tạm → chặn; không gửi trùng", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    blockers = 1;
    await sendAll();
    expect(idaOutbox(2)).toHaveLength(0);
    expect(uow.data.messages.filter((m) => m.branch === 2)).toEqual([expect.objectContaining({ result: "ERROR", summary: expect.stringContaining("Tờ 2/3: chưa khai tạm tự động") })]);
    blockers = 0;
    expect(errCode(await performOperation(deps, declarant, D, "IDA", 3))).toBe("INVALID_STATE");
    expect(errCode(await performOperation(deps, viewer, D, "IDA", 2))).toBe("FORBIDDEN");
    expect(unwrap(await performOperation(deps, declarant, D, "IDA", 2))).toMatchObject({ sent: true });
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`]);
    expect(idaOf(idaOutbox(2)[0]!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 2 });
    expect(errCode(await performOperation(deps, declarant, D, "IDA", 2))).toBe("INVALID_STATE");
    expect(idaOutbox(2)).toHaveLength(1);
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
    // Đã khai tạm → IDA nhánh 2 không còn bấm được.
    expect(errCode(await performOperation(deps, declarant, D, "IDA", 2))).toBe("INVALID_STATE");
  });

  it("người khai bấm IDA và worker nối tiếp cùng một tờ → cùng khóa xác định, chỉ một outbox (cả hai thứ tự và khi chạy song song)", async () => {
    deps.gateway = branchGateway();
    const { outboxId } = unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    // Worker nối trước → người khai bấm sau: đang chờ gửi, không tạo thêm.
    await sendAll(1);
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`]);
    expect(errCode(await performOperation(deps, declarant, D, "IDA", 2))).toBe("INVALID_STATE");
    expect(idaOutbox(2)).toHaveLength(1);
    // Người khai bấm trước → job nhánh 1 chạy lại (nối tiếp) không tạo thêm.
    uow.data.outbox = uow.data.outbox.filter((o) => o.branch !== 2);
    queue.jobs.length = 0;
    unwrap(await performOperation(deps, declarant, D, "IDA", 2));
    await send(outboxId);
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`]);
    // Song song: cả hai cùng qua bước kiểm tra trước khi ghi → cùng khóa, unique chặn bản thứ hai.
    uow.data.outbox = uow.data.outbox.filter((o) => o.branch !== 2);
    const tried: string[] = [];
    const real = deps.uow;
    const racing = (hideBranch2: boolean): CustomsUow => ({
      asOrg: (c, fn) => real.asOrg(c, (r) => fn({
        ...r,
        outbox: {
          ...r.outbox, findByKey: async () => null,
          listForDossier: async (o, d) => (await r.outbox.listForDossier(o, d)).filter((x) => !hideBranch2 || x.branch !== 2),
          insert: async (row) => { tried.push(row.idempotencyKey); await r.outbox.insert(row); },
        },
      })),
    });
    deps.uow = racing(false);
    unwrap(await enqueueBranchPreDeclare(deps, declarant, D, 2, { by: "chain", version: 2 }));
    deps.uow = racing(true);
    unwrap(await performOperation(deps, declarant, D, "IDA", 2));
    expect(tried).toEqual([`${D}:IDA:v2:b2`, `${D}:IDA:v2:b2`]);
    expect(idaOutbox(2)).toHaveLength(1);
  });

  it("outbox tờ 2 bị chặn trước khi gửi (tờ khai đã mở lại) → kết quả tờ 2 SEND_FAILED để giao diện hiện lỗi; tờ 1 giữ nguyên", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll(1);
    decls.status = "DRAFT";
    await sendAll(1);
    expect(idaOutbox(2)[0]).toMatchObject({ status: "FAILED" });
    expect(uow.data.results.map((r) => [r.branch, r.state, r.raw?.stage])).toEqual([[1, "PRE_DECLARED", "PRE_DECLARED"], [2, "SEND_FAILED", "NOT_SENT"], [3, "APPROVED", "NOT_SENT"]]);
  });

  it("duyệt lại (cùng phiên bản) sau khi gọi về sửa → outbox tờ 2 của lần truyền trước không được gửi (ghim theo lần duyệt)", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll(1);
    decls.approvedAt = "2026-10-14T05:00:00.000Z"; // gọi về sửa → duyệt lại → truyền lại: vẫn v2, SUBMITTED
    await sendAll(1);
    expect(preDeclared).toEqual([1]);
    expect(idaOutbox(2)[0]).toMatchObject({ status: "FAILED" });
    expect(uow.data.results.find((r) => r.branch === 2)!.state).toBe("SEND_FAILED");
  });

  it("Gửi lại outbox nội dung tờ ≥ 2 có khóa theo lượt (:n<k>, không phiên bản) → áp guard thường, gửi lại được", async () => {
    decls.status = "SUBMITTED";
    seedBranch(1, { state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED" } });
    seedBranch(2, { state: "SEND_FAILED", raw: { stage: "RECALLED", certificateId: "cert_1" } });
    seedOutbox({ branch: 2, operation: "IDA", idempotencyKey: `${D}:IDA:n1:b2`, status: "FAILED", payload: { request: { x: 1 } } });
    deps.gateway = gw({ queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    expect(unwrap(await resendOperation(deps, declarant, D, "IDA", 2))).toMatchObject({ resent: true });
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:n1:b2`, `${D}:IDA:n1:retry1:b2`]);
  });

  it("thuế dự tính trên kết quả từng tờ (lô nhiều tờ) lấy theo tờ khai nhánh", async () => {
    decls.branchTaxVnd = ["1000", "2000", "300"];
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(uow.data.results.map((r) => [r.branch, r.customsTaxVnd])).toEqual([[1, "1000"], [2, "2000"], [3, "300"]]);
  });

  it("gọi về sửa nhiều tờ → mở lại cả bộ một lần → duyệt lại → gửi nội dung theo giai đoạn từng tờ, nối tiếp: tờ 1 IDA01, tờ 2 IDA (đã gọi về), tờ 3 chưa có số → IDA lần đầu", async () => {
    const sends: string[] = [];
    deps.gateway = branchGateway((bno, n) => bno === 3 && n === 1, {
      queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }),
      declare: async () => ({ accepted: true, channel: "YELLOW" as const }),
      send: async (_o, msg) => (sends.push(`${msg.op}:${msg.externalId}`), { note: "ok" }),
    });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDC", 1));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDD", 1));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDB", 2));
    await sendAll();
    expect(uow.data.results.map((r) => [r.branch, r.raw?.stage])).toEqual([[1, "AMEND_RECALLED"], [2, "RECALLED"], [3, "NOT_SENT"]]);
    expect(decls.status).toBe("DRAFT");
    // Duyệt lại rồi mở lại cả bộ một lần (giữ giai đoạn các tờ).
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    dossiers.rows[0]!.status = "APPROVED";
    const before = decls.reopened.length;
    unwrap(await reopenDeclaration(deps, declarant, D));
    expect(decls.reopened.length - before).toBe(1);
    expect(decls.status).toBe("DRAFT");
    expect(uow.data.results.map((r) => [r.branch, r.raw?.stage])).toEqual([[1, "AMEND_RECALLED"], [2, "RECALLED"], [3, "NOT_SENT"]]);
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T06:00:00.000Z";
    // Truyền lại: tờ đầu tiên cần gửi nội dung là tờ 1 (IDA01).
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(keysOf("IDA01", 1)).toEqual([`${D}:IDA01:v2`]);
    expect(decls.status).toBe("SUBMITTED");
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`]);
    await sendAll();
    expect(sends).toContain("IDA01:fpt-b1");
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`, `${D}:IDA:v2:n2:b2`]);
    expect(keysOf("IDA", 3)).toEqual([`${D}:IDA:v2:b3`, `${D}:IDA:v2:n2:b3`]);
    expect(idaOf(idaOutbox(3).at(-1)!)).toMatchObject({ tK_FIC: "104000000001", tK_BNO: 3 });
    expect(preDeclared).toEqual([1, 2, 3, 2, 3]);
    expect(uow.data.results.map((r) => [r.branch, r.raw?.stage, r.declarationNo])).toEqual([[1, "AMEND_PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
    unwrap(await performOperation(deps, declarant, D, "IDE", 1));
  });

  it("tờ 2 bị từ chối trước khi có số, tờ 1 đã có số → mở lại bị chặn (tờ 1 phải gọi về trước, R3/R4); gọi về tờ 1 → duyệt lại → truyền lại: tờ 1 IDA, tờ 2 IDA lần đầu, tờ 3", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 2 && n === 1);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(uow.data.results.map((r) => [r.branch, r.state, r.raw?.stage])).toEqual([[1, "PRE_DECLARED", "PRE_DECLARED"], [2, "SEND_FAILED", "NOT_SENT"], [3, "APPROVED", "NOT_SENT"]]);
    expect(await reopenDeclaration(deps, declarant, D)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "SHEETS_RECALL_FIRST", params: { sheets: "1" }, message: "Tờ 1: gọi về sửa (IDB/IDD) trước" } });
    expect(decls.status).toBe("SUBMITTED");
    unwrap(await performOperation(deps, declarant, D, "IDB", 1));
    await sendAll();
    expect(decls.status).toBe("DRAFT");
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    dossiers.rows[0]!.status = "APPROVED";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(keysOf("IDA", 1)).toEqual([`${D}:IDA:v2`, `${D}:IDA:v2:n2`]);
    expect(decls.status).toBe("SUBMITTED");
    await sendAll();
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`, `${D}:IDA:v2:n2:b2`]);
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("R3: chỉ gọi về tờ 2 (tờ 1, 3 đã có số, chưa gọi về) → truyền lại, mở lại, bấm IDA tờ 2 đều bị chặn nêu tờ 1, 3; worker không tự gọi về", async () => {
    deps.gateway = branchGateway(() => false, { queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDB", 2));
    await sendAll();
    expect(uow.data.results.map((r) => r.raw?.stage)).toEqual(["PRE_DECLARED", "RECALLED", "PRE_DECLARED"]);
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    dossiers.rows[0]!.status = "APPROVED";
    const before = uow.data.outbox.length;
    const refused = { ok: false, error: { code: "INVALID_STATE", reason: "SHEETS_RECALL_FIRST", params: { sheets: "1, 3" }, message: "Tờ 1, 3: gọi về sửa (IDB/IDD) trước" } };
    expect(await submitDeclaration(deps, declarant, D, "cert_1")).toMatchObject(refused);
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject(refused);
    expect(await reopenDeclaration(deps, declarant, D)).toMatchObject(refused);
    await sendAll();
    expect(uow.data.outbox.length).toBe(before);
    expect(uow.data.outbox.filter((o) => o.operation === "IDB").map((o) => o.branch)).toEqual([2]);
    expect(decls.status).toBe("APPROVED");
  });

  it("CRITICAL: IDA tờ 1 (lô nhiều tờ) hết lượt thử → bấm IDA lại bị chặn, phải Gửi lại (chưa có externalId: gửi lại thông điệp đã ghim; có externalId: tra trạng thái trước)", async () => {
    deps.gateway = branchGateway(() => false, { queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    uow.data.outbox[0]!.attempts = 5;
    await sendAll();
    expect(uow.data.results.find((r) => r.branch === 1)).toMatchObject({ state: "SEND_FAILED", raw: expect.objectContaining({ stage: "NOT_SENT" }) });
    expect(uow.data.results.find((r) => r.branch === 1)?.externalId).toBeNull();
    expect(await performOperation(deps, declarant, D, "IDA", 1)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringContaining("dùng Gửi lại") } });
    expect(keysOf("IDA", 1)).toEqual([`${D}:IDA:v2`]);
    expect(unwrap(await resendOperation(deps, declarant, D, "IDA", 1))).toMatchObject({ resent: true });
    expect(keysOf("IDA", 1)).toEqual([`${D}:IDA:v2`, `${D}:IDA:v2:retry1`]);
    // Chưa có externalId → không có gì để tra; thông điệp gửi lại là bản đã ghim.
    expect(uow.data.messages.some((m) => m.operation === "IID")).toBe(false);
    expect(uow.data.outbox.at(-1)!.payload).toEqual(uow.data.outbox[0]!.payload);
  });

  it("CRITICAL: IDA01 (AMEND_RECALLED) / IDA (RECALLED) đã gửi lỗi ở lần truyền này → bấm lại bị chặn; outbox của lần truyền trước (ghim khác) không chặn", async () => {
    decls.status = "SUBMITTED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    const pin = "v2@2026-10-14T05:00:00.000Z";
    seedBranch(1, { state: "SEND_FAILED", raw: { stage: "AMEND_RECALLED", certificateId: "cert_1" } });
    seedBranch(2, { state: "SEND_FAILED", raw: { stage: "RECALLED", certificateId: "cert_1" } });
    seedBranch(3, { externalId: null, declarationNo: null, state: "APPROVED", raw: { stage: "NOT_SENT", certificateId: "cert_1" } }); // 120 dòng = 3 tờ đã khai
    seedOutbox({ branch: 1, operation: "IDA01", idempotencyKey: `${D}:IDA01:v2`, status: "FAILED", payload: { request: {}, pin } });
    seedOutbox({ branch: 2, operation: "IDA", idempotencyKey: `${D}:IDA:v2:n2:b2`, status: "FAILED", payload: { request: {}, pin } });
    expect(await performOperation(deps, declarant, D, "IDA01", 1)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringContaining("dùng Gửi lại") } });
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringContaining("dùng Gửi lại") } });
    expect(uow.data.outbox).toHaveLength(2);
    // Outbox lỗi thuộc lần duyệt trước → nội dung lần này chưa gửi tờ 1 → được gửi.
    uow.data.outbox[0]!.payload = { request: {}, pin: "v2@" };
    unwrap(await performOperation(deps, declarant, D, "IDA01", 1));
    expect(keysOf("IDA01", 1)).toEqual([`${D}:IDA01:v2`, `${D}:IDA01:v2:n2`]);
  });

  it("thứ tự truyền lại: mọi tờ có số đã gọi về, duyệt lại → bấm IDA tờ 3 chưa có số bị chặn (tờ 1, 2 chưa gửi lại nội dung); không đánh dấu SUBMITTED; truyền lại từ tờ 1 vẫn chạy", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 3 && n === 1, { queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDB", 1));
    unwrap(await performOperation(deps, declarant, D, "IDB", 2));
    await sendAll();
    expect(uow.data.results.map((r) => r.raw?.stage)).toEqual(["RECALLED", "RECALLED", "NOT_SENT"]);
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    dossiers.rows[0]!.status = "APPROVED";
    const before = uow.data.outbox.length;
    expect(await performOperation(deps, declarant, D, "IDA", 3)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", reason: "SHEET_ORDER", params: { sheet: 3, waitFor: 2 } } });
    expect(uow.data.outbox.length).toBe(before);
    expect(decls.status).toBe("APPROVED");
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("R5: tờ 1 bị từ chối trước khi có số → mở lại → duyệt lại cùng phiên bản → truyền lại: khóa mới :n2 (không kẹt ALREADY_SUBMITTED), nối các tờ", async () => {
    deps.gateway = branchGateway((bno, n) => bno === 1 && n === 1);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    unwrap(await reopenDeclaration(deps, declarant, D));
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    dossiers.rows[0]!.status = "APPROVED";
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(keysOf("IDA", 1)).toEqual([`${D}:IDA:v2`, `${D}:IDA:v2:n2`]);
    // Bấm truyền lần nữa ở cùng lần duyệt → không tạo thêm.
    decls.status = "APPROVED";
    dossiers.rows[0]!.status = "APPROVED";
    expect(errCode(await submitDeclaration(deps, declarant, D, "cert_1"))).toBe("ALREADY_SUBMITTED");
    expect(keysOf("IDA", 1)).toHaveLength(2);
    decls.status = "SUBMITTED";
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("số tờ đổi giữa hai lần truyền (luật R-BRANCH-COUNT-LOCKED qua blockerFails) → truyền lại bị chặn, không tạo outbox", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    for (const b of [1, 2, 3]) unwrap(await performOperation(deps, declarant, D, "IDB", b));
    await sendAll();
    decls.items = lines(95); // 3 tờ đã có số → nay chỉ 2 tờ
    decls.status = "APPROVED";
    dossiers.rows[0]!.status = "APPROVED";
    blockers = 1; // R-BRANCH-COUNT-LOCKED FAIL (luật kiểm ở module validation, test riêng ở line-items.test.ts)
    const before = uow.data.outbox.length;
    expect(await submitDeclaration(deps, declarant, D, "cert_1")).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED", reason: "BLOCKER_RULES_FAILED" } });
    expect(await performOperation(deps, declarant, D, "IDA", 1)).toMatchObject({ ok: false, error: { code: "BLOCKER_FAILED" } });
    expect(uow.data.outbox.length).toBe(before);
  });

  it("mọi tờ đã có số, không tờ nào gọi về → mở lại bị chặn, nêu các tờ phải gọi về", async () => {
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(await reopenDeclaration(deps, declarant, D)).toMatchObject({ ok: false, error: { reason: "SHEETS_RECALL_FIRST", params: { sheets: "1, 2, 3" } } });
  });

});

describe("AMA theo tờ khai nhánh (spec §6.6)", () => {
  const info = (p: Record<string, unknown> = {}) => ({ receivedAt: "2026-10-14T02:00:00.000Z", exchangeRates: [], taxes: [], items: [], directives: [], ...p });
  const cleared = (branch: number, raw: Record<string, unknown> = {}) =>
    seedBranch(branch, { state: "CLEARED", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1", ...raw } });
  const amaView = (branch: number, ctx: Ctx = declarant) => getPostAmendmentView(deps, ctx, D, branch);
  const readyToSend = async (branch: number) => {
    const pa = unwrap(await addPostAmendmentLines(deps, declarant, D, [1], branch));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REC", value: "2" }, branch));
    unwrap(await approvePostAmendment(deps, approver, D, branch));
    return pa;
  };

  beforeEach(() => {
    decls.items = lines(120);
    decls.status = "SUBMITTED";
    dossiers.rows[0]!.status = "SUBMITTED";
  });

  it("chỉ tờ đã thông quan bắt đầu được AMA; tờ khác ở giai đoạn nào (kể cả đang chờ phản hồi) không chặn; AMA tờ 1 truyền được với khóa cũ", async () => {
    cleared(1);
    seedBranch(2);
    seedBranch(3, { state: "PRE_DECLARED", raw: { stage: "PRE_DECLARED", certificateId: "cert_1" } });
    seedOutbox({ branch: 2, operation: "IDC", idempotencyKey: `${D}:IDC:n1:b2` });
    expect(errCode(await startPostAmendment(deps, declarant, D, 2))).toBe("INVALID_STATE");
    expect(errCode(await startPostAmendment(deps, declarant, D, 3))).toBe("INVALID_STATE");
    unwrap(await startPostAmendment(deps, declarant, D, 1));
    expect(stages()).toEqual([[1, "POST_EDITING", "104000000001"], [2, "DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
    expect(uow.data.amendments).toEqual([expect.objectContaining({ branch: 1, seq: 1, header: expect.objectContaining({ TK_ICN: "104000000001" }) })]);
    await readyToSend(1);
    // Lô nhiều tờ, tờ khai SUBMITTED, tờ 2 chưa thông quan: guard nội dung (R3 / đã gửi ở lần truyền này) không áp cho AMA.
    unwrap(await performOperation(deps, declarant, D, "AMA", 1));
    expect(keysOf("AMA", 1)).toEqual([`${D}:AMA:n1`]);
    await sendAll();
    expect(stages()[0]).toEqual([1, "POST_PRE_DECLARED", "104000000001"]);
    expect(unwrap(await amaView(1)).current).toMatchObject({ status: "PRE_DECLARED", result: { TK_A25: "1" } });
  });

  it("AMA tờ 2: số tờ khai + thông tin Hải quan của tờ 2, dòng nguồn 51–100 đánh số 1..50, seq riêng từng tờ; field_audit ama:b2:…; phản hồi chỉ đổi bản khai của tờ 2", async () => {
    cleared(1);
    cleared(2, { customsInfo: info({ subsection: "02" }) });
    unwrap(await startPostAmendment(deps, declarant, D, 1));
    unwrap(await startPostAmendment(deps, declarant, D, 2));
    const v2 = unwrap(await amaView(2));
    expect(v2.current).toMatchObject({ branch: 2, seq: 1, status: "DRAFT", header: { TK_ICN: "104000000002", TK_CHB: "02" }, lines: [] });
    expect(v2.sourceLines).toHaveLength(50);
    expect(v2.sourceLines[0]).toMatchObject({ lineNo: 1, description: "Vòng bi 51" });
    expect(v2.sourceLines[49]).toMatchObject({ lineNo: 50, description: "Vòng bi 100" });
    expect(unwrap(await amaView(1)).current).toMatchObject({ seq: 1, header: { TK_ICN: "104000000001" } });
    expect(unwrap(await amaView(1)).sourceLines[0]).toMatchObject({ lineNo: 1, description: "Vòng bi 1" });

    expect(errCode(await addPostAmendmentLines(deps, declarant, D, [51], 2))).toBe("NOT_FOUND");
    const pa = unwrap(await addPostAmendmentLines(deps, declarant, D, [1], 2));
    expect(pa.lines[0]!.values).toMatchObject({ HAG_RAN: "01", HAG_CMB: "Vòng bi 51" });
    unwrap(await updatePostAmendmentField(deps, declarant, D, { lineId: pa.lines[0]!.id, key: "HAG_AKB", value: "100" }, 2));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REC", value: "2" }, 2));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REC", value: "6" }, 1));
    expect(audits.map((a) => a.key)).toEqual(["ama:b2:1:1:HAG_AKB", "ama:b2:1:TK_REC", "ama:1:TK_REC"]);
    expect(unwrap(await amaView(1)).current!.lines).toEqual([]);

    unwrap(await approvePostAmendment(deps, approver, D, 2));
    expect(unwrap(await amaView(1)).current!.status).toBe("DRAFT");
    expect(errCode(await performOperation(deps, declarant, D, "AMA", 1))).toBe("INVALID_STATE");
    unwrap(await performOperation(deps, declarant, D, "AMA", 2));
    expect(keysOf("AMA", 2)).toEqual([`${D}:AMA:n1:b2`]);
    await sendAll();
    expect(unwrap(await amaView(2)).current!.status).toBe("PRE_DECLARED");
    expect(unwrap(await amaView(1)).current!.status).toBe("DRAFT");
    expect(stages()).toEqual([[1, "POST_EDITING", "104000000001"], [2, "POST_PRE_DECLARED", "104000000002"]]);
  });

  it("sửa chỉ tiêu chung ở tờ 1 → commonEdits; nhân bản sang tờ đã thông quan (lập AMA nháp), bỏ qua tờ chưa thông quan / AMA đã duyệt; ghi audit", async () => {
    cleared(1);
    cleared(2);
    seedBranch(3);
    unwrap(await startPostAmendment(deps, declarant, D, 1));
    expect(unwrap(await amaView(1)).commonEdits).toEqual([]);
    const old = unwrap(await amaView(1)).current!.header["TK_REF"] ?? "";
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REF", value: "REF-MOI" }, 1));
    expect(unwrap(await amaView(1)).commonEdits).toEqual(["TK_REF"]);
    expect(unwrap(await amaView(2))).toMatchObject({ current: null, commonEdits: [] });

    expect(errCode(await copyPostAmendmentHeader(deps, viewer, D, { fromBranch: 1, keys: ["TK_REF"] }))).toBe("FORBIDDEN");
    expect(errCode(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["TK_ICN"] }))).toBe("VALIDATION");
    expect(errCode(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["HAG_AKB"] }))).toBe("VALIDATION");
    expect(errCode(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 3, keys: ["TK_REF"] }))).toBe("NOT_FOUND");
    expect(errCode(await copyPostAmendmentHeader(deps, other, D, { fromBranch: 1, keys: ["TK_REF"] }))).toBe("NOT_FOUND");
    audits.length = 0;

    expect(unwrap(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["TK_REF"] }))).toEqual({ applied: [2], skipped: [{ no: 3, reason: "NOT_CLEARED" }] });
    const v2 = unwrap(await amaView(2));
    expect(v2.current).toMatchObject({ branch: 2, seq: 1, status: "DRAFT", header: { TK_REF: "REF-MOI", TK_ICN: "104000000002" } });
    expect(v2.commonEdits).toEqual(["TK_REF"]);
    expect(stages()).toEqual([[1, "POST_EDITING", "104000000001"], [2, "POST_EDITING", "104000000002"], [3, "DECLARED", "104000000003"]]);
    expect(audits).toEqual([expect.objectContaining({ dossierId: D, key: "ama:b2:1:TK_REF", oldValue: old, newValue: "REF-MOI" })]);
    expect(uow.data.amendments.filter((a) => a.branch === 3)).toEqual([]);

    // Tờ 2 đã duyệt → không đè (bỏ duyệt ngầm); tờ 1 đang nháp nhận bản sửa từ tờ 2 (khóa audit dạng cũ).
    await readyToSend(2);
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_IMT", value: "0225999" }, 2));
    unwrap(await approvePostAmendment(deps, approver, D, 2));
    audits.length = 0;
    expect(unwrap(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["TK_REF"] }))).toEqual({ applied: [], skipped: [{ no: 2, reason: "OPEN_NOT_DRAFT" }, { no: 3, reason: "NOT_CLEARED" }] });
    expect(unwrap(await amaView(2)).current!.status).toBe("APPROVED");
    expect(unwrap(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 2, keys: ["TK_IMT"] }))).toEqual({ applied: [1], skipped: [{ no: 3, reason: "NOT_CLEARED" }] });
    expect(unwrap(await amaView(1)).current!.header["TK_IMT"]).toBe("0225999");
    expect(audits.map((a) => a.key)).toEqual(["ama:1:TK_IMT"]);
  });
});

describe("view / danh sách theo tờ khai nhánh (spec §7)", () => {
  const msg = (branch: number, p: Partial<MessageRow> = {}): MessageRow => ({ id: `m_${uow.data.messages.length + 1}`, orgId: ORG, dossierId: D, branch, operation: "IDA", direction: "OUT", result: "OK", summary: "s", payloadMasked: {}, externalRef: null, at: new Date(T.getTime() + uow.data.messages.length * 1000), ...p });
  /** Tờ 1 thông quan, tờ 2 đã khai chính thức (đang gửi HYS), tờ 3 chưa gửi – nối tiếp bị chặn (thông điệp IDA IN/ERROR ghi trên tờ 3). */
  const seedThree = () => {
    seedBranch(1, { state: "CLEARED", clearanceStatus: "CLEARED", channel: "GREEN", raw: { stage: "CLEARED", certificateId: "cert_1" } });
    seedBranch(2, { channel: "RED" });
    seedBranch(3, { declarationNo: null, externalId: null, channel: null, state: "APPROVED", raw: { stage: "NOT_SENT", certificateId: "cert_1" } });
    uow.data.messages.push(msg(1));
    uow.data.messages.push(msg(1, { direction: "IN" }));
    uow.data.messages.push(msg(2));
    uow.data.messages.push(msg(2, { direction: "IN" }));
    uow.data.messages.push(msg(2, { operation: "HYS" }));
    uow.data.messages.push(msg(3, { direction: "IN", result: "ERROR", summary: "Tờ 3/3: chưa khai tạm tự động – Tờ khai chưa phê duyệt" }));
    seedOutbox({ branch: 1, status: "SENT" });
    seedOutbox({ branch: 2, operation: "HYS", idempotencyKey: `${D}:HYS:n1:b2`, status: "PENDING" });
  };

  beforeEach(() => {
    decls.items = lines(120);
    decls.status = "SUBMITTED";
  });

  it("getSubmission: mỗi tờ một mục với pipeline / thông điệp / kết quả riêng; trường cấp hồ sơ = tờ 1; summary k/N", async () => {
    seedThree();
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.branches.map((b) => [b.no, b.of, b.stage, b.declarationNo, b.channel, b.started, b.inProgress])).toEqual([
      [1, 3, "CLEARED", "104000000001", "GREEN", true, false],
      [2, 3, "DECLARED", "104000000002", "RED", true, true],
      [3, 3, "NOT_SENT", null, null, false, false],
    ]);
    expect(v.branches[1]!.messages.map((m) => m.operation)).toEqual(["HYS", "IDA", "IDA"]);
    expect(v.branches[1]!.pipeline.find((p) => p.op === "HYS")?.status).toBe("SENDING");
    expect(v.branches[0]!.pipeline.find((p) => p.op === "HYS")?.status).toBe("NOT_SENT");
    expect(v.branches[0]!.result).toMatchObject({ declarationNo: "104000000001", clearanceStatus: "CLEARED" });
    // Trường cấp hồ sơ = tờ 1 (tương thích): thông điệp, giai đoạn, kết quả của tờ 1.
    expect(v).toMatchObject({ stage: "CLEARED", started: true, inProgress: false, result: { declarationNo: "104000000001" } });
    expect(v.messages).toHaveLength(2);
    expect(v.summary).toEqual({ of: 3, cleared: 1, problems: [] });
  });

  it("getSubmission: thông điệp từ chối nối tiếp (IDA IN/ERROR) trên tờ chưa gửi không tính là lần gửi – started/inProgress false, IDA hiện lỗi kèm lý do", async () => {
    seedThree();
    const b3 = unwrap(await getSubmission(deps, declarant, D)).branches[2]!;
    expect(b3).toMatchObject({ stage: "NOT_SENT", started: false, inProgress: false, result: null });
    expect(b3.pipeline.find((p) => p.op === "IDA")).toMatchObject({ status: "ERROR", summary: expect.stringContaining("chưa khai tạm tự động") });
    expect(b3.messages).toHaveLength(1);
    const row3 = unwrap(await listCustomsDeclarations(deps, declarant)).find((r) => r.branch === 3)!;
    expect(row3).toMatchObject({ state: "READY", stage: "NOT_SENT", lastOperation: "IDA" });
  });

  it("getSubmission: 'đã duyệt' của AMA theo bản khai đang mở của từng tờ", async () => {
    seedBranch(1, { state: "CLEARED", clearanceStatus: "CLEARED", raw: { stage: "POST_EDITING", certificateId: "cert_1" } });
    seedBranch(2, { state: "CLEARED", clearanceStatus: "CLEARED", raw: { stage: "POST_EDITING", certificateId: "cert_1" } });
    seedBranch(3, { state: "CLEARED", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1" } });
    const ama = (branch: number, status: "DRAFT" | "APPROVED") => uow.data.amendments.push({ id: `pam_${branch}`, orgId: ORG, dossierId: D, branch, seq: 1, status, header: {}, lines: [], approvedAt: null, createdAt: T, updatedAt: T });
    ama(1, "DRAFT");
    ama(2, "APPROVED");
    const v = unwrap(await getSubmission(deps, declarant, D));
    const amaRow = (i: number) => v.branches[i]!.pipeline.find((p) => p.op === "AMA")!;
    expect(amaRow(0)).toMatchObject({ action: "EDIT" });
    expect(amaRow(1)).toMatchObject({ enabled: true, action: "SEND" });
    expect(v.branches[1]!.nextOp).toBe("AMA");
    expect(v.summary).toEqual({ of: 3, cleared: 3, problems: [] });
  });

  it("getSubmission: chưa truyền → số tờ theo dòng hàng (120 dòng → 3 tờ NOT_SENT); lô 1 tờ → 1 mục", async () => {
    const v = unwrap(await getSubmission(deps, declarant, D));
    expect(v.branches.map((b) => [b.no, b.of, b.stage, b.started])).toEqual([[1, 3, "NOT_SENT", false], [2, 3, "NOT_SENT", false], [3, 3, "NOT_SENT", false]]);
    decls.items = null;
    expect(unwrap(await getSubmission(deps, declarant, D)).branches.map((b) => [b.no, b.of])).toEqual([[1, 1]]);
  });

  it("listCustomsDeclarations: hồ sơ 3 tờ → 3 dòng of 3, mỗi dòng số tờ khai / luồng / thao tác cuối của tờ; các dòng cùng hồ sơ liền nhau", async () => {
    seedThree();
    const rows = unwrap(await listCustomsDeclarations(deps, declarant));
    expect(rows.map((r) => [r.dossierId, r.branch, r.of, r.declarationNo, r.channel, r.state, r.lastOperation])).toEqual([
      [D, 1, 3, "104000000001", "GREEN", "CLEARED", "IDA"],
      [D, 2, 3, "104000000002", "RED", "SENDING", "HYS"],
      [D, 3, 3, undefined, undefined, "READY", "IDA"],
    ]);
  });

  it("listCustomsDeclarations: chưa truyền lô 120 dòng → 3 dòng READY", async () => {
    const rows = unwrap(await listCustomsDeclarations(deps, declarant));
    expect(rows.map((r) => [r.branch, r.of, r.state])).toEqual([[1, 3, "READY"], [2, 3, "READY"], [3, 3, "READY"]]);
  });

  it("dossierCustomsSummaries: tóm tắt k/N + tờ lỗi theo hồ sơ; hồ sơ chưa truyền vắng; org khác không thấy", async () => {
    seedThree();
    uow.data.results.find((r) => r.branch === 2)!.state = "SEND_FAILED";
    const map = unwrap(await dossierCustomsSummaries(deps, declarant, [D, "dos_khac"]));
    expect([...map.entries()]).toEqual([[D, { of: 3, cleared: 1, problems: [{ no: 2, kind: "SEND_FAILED" }] }]]);
    expect(unwrap(await dossierCustomsSummaries(deps, declarant, []))).toEqual(new Map());
    expect(unwrap(await dossierCustomsSummaries(deps, other, [D]))).toEqual(new Map());
  });
});

describe("nhân bản chỉ tiêu chung AMA – bổ sung (Task 9)", () => {
  const cleared = (branch: number) => seedBranch(branch, { state: "CLEARED", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1" } });
  beforeEach(() => {
    decls.items = lines(120);
    decls.status = "SUBMITTED";
    dossiers.rows[0]!.status = "SUBMITTED";
  });

  it("TK_CHB (đội thủ tục Hải quan xác định theo từng tờ) không là chỉ tiêu chung: không vào commonEdits, không nhân bản được", async () => {
    cleared(1);
    cleared(2);
    unwrap(await startPostAmendment(deps, declarant, D, 1));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_CHB", value: "09" }, 1));
    expect(unwrap(await getPostAmendmentView(deps, declarant, D, 1)).commonEdits).toEqual([]);
    expect(errCode(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["TK_CHB"] }))).toBe("VALIDATION");
  });

  it("ghi field_audit từng tờ ngay sau khi tờ đó lưu; bản khai lập do nhân bản → hồ sơ về bước review; bỏ qua tờ vượt số tờ hiện tại", async () => {
    cleared(1);
    cleared(2);
    cleared(3);
    cleared(4); // tờ thừa (số tờ hiện tại 3) – không nhân bản sang
    unwrap(await startPostAmendment(deps, declarant, D, 1));
    unwrap(await updatePostAmendmentField(deps, declarant, D, { key: "TK_REF", value: "REF-MOI" }, 1));
    dossiers.rows[0]!.step = "submit";
    dossiers.patches.length = 0;
    audits.length = 0;
    // Lúc ghi audit của tờ 2, bản khai tờ 3 chưa được lập (audit không dồn tới cuối vòng lặp).
    const seen: number[] = [];
    deps.audit = { append: async (_c, row) => { audits.push(row); seen.push(uow.data.amendments.filter((a) => a.branch === 3).length); } };
    expect(unwrap(await copyPostAmendmentHeader(deps, declarant, D, { fromBranch: 1, keys: ["TK_REF"] }))).toEqual({ applied: [2, 3], skipped: [] });
    expect(audits.map((a) => a.key)).toEqual(["ama:b2:1:TK_REF", "ama:b3:1:TK_REF"]);
    expect(seen).toEqual([0, 1]);
    expect(uow.data.amendments.filter((a) => a.branch === 4)).toEqual([]);
    expect(dossiers.rows[0]!.step).toBe("review");
    expect(dossiers.patches).toContainEqual({ step: "review" });
  });
});

// ───────────────────────── Sửa sau review toàn nhánh: khóa số tờ, miễn gọi về tờ đã thông quan, gửi lại tờ chưa có số, "đã duyệt" chung ─────────────────────────

describe("tờ khai nhánh – sửa sau review toàn nhánh", () => {
  const reapprove = (at: string) => {
    decls.status = "APPROVED";
    decls.approvedAt = at;
    dossiers.rows[0]!.status = "APPROVED";
  };

  it("C1: chuỗi dừng giữa chừng (tờ 1 có số, tờ 2 bị từ chối chưa có số, tờ 3 chưa gửi) → đã khai 3 tờ; gọi về tờ 1, sửa, duyệt lại → truyền lại không bị chặn vì số tờ", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway((bno, n) => bno === 2 && n === 1);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(uow.data.results.map((r) => [r.branch, r.declarationNo])).toEqual([[1, "104000000001"], [2, null], [3, null]]);
    // Reader luật R-BRANCH-COUNT-LOCKED: 3 tờ đã khai (không phải 1 tờ có số).
    expect(lockedSheetCount(uow.data.results)).toBe(3);
    unwrap(await performOperation(deps, declarant, D, "IDB", 1));
    await sendAll();
    reapprove("2026-10-14T05:00:00.000Z");
    unwrap(await reopenDeclaration(deps, declarant, D));
    decls.items = lines(140); // sửa dòng hàng nhưng vẫn 3 tờ
    reapprove("2026-10-14T06:00:00.000Z");
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("C1: lô 50 dòng đã có số tờ 1, gọi về sửa, tăng lên 51 dòng (2 tờ) → truyền lại / IDA / khai tạm tờ 2 bị chặn (không gửi tờ 1 với TK_DNO = 2), không tạo outbox", async () => {
    decls.items = lines(50);
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    unwrap(await performOperation(deps, declarant, D, "IDB", 1));
    await sendAll();
    decls.items = lines(51);
    reapprove("2026-10-14T05:00:00.000Z");
    const before = uow.data.outbox.length;
    const refused = { ok: false, error: { code: "BLOCKER_FAILED", reason: "SHEET_COUNT_CHANGED", params: { planned: 1, now: 2 } } };
    expect(await submitDeclaration(deps, declarant, D, "cert_1")).toMatchObject(refused);
    expect(await performOperation(deps, declarant, D, "IDA", 1)).toMatchObject(refused);
    expect(await enqueueBranchPreDeclare(deps, declarant, D, 2, { by: "user" })).toMatchObject(refused);
    expect(uow.data.outbox.length).toBe(before);
    expect(decls.status).toBe("APPROVED");
  });

  it("C1: số tờ giảm sau khi có số (120 → 95 dòng, 3 tờ đã khai) → chặn ở mã nguồn kể cả khi luật chưa chạy lại", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    for (const b of [1, 2, 3]) unwrap(await performOperation(deps, declarant, D, "IDB", b));
    await sendAll();
    decls.items = lines(95);
    reapprove("2026-10-14T05:00:00.000Z");
    expect(await submitDeclaration(deps, declarant, D, "cert_1")).toMatchObject({ ok: false, error: { reason: "SHEET_COUNT_CHANGED", params: { planned: 3, now: 2 } } });
  });

  it("C2/R7: tờ 1 đã thông quan, tờ 2 luồng đỏ gọi sửa đổi (IDD) → sửa, duyệt lại → truyền lại tờ 2 (IDA01) được; tờ 1 không bị bắt gọi về, không gửi gì", async () => {
    decls.items = lines(100);
    decls.status = "SUBMITTED";
    dossiers.rows[0]!.status = "SUBMITTED";
    seedBranch(1, { state: "CLEARED", channel: "GREEN", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1" } });
    seedBranch(2, { channel: "RED", raw: { stage: "DECLARED", certificateId: "cert_1" } });
    deps.gateway = branchGateway(() => false, { send: async () => ({ note: "ok" }), queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    unwrap(await performOperation(deps, declarant, D, "IDD", 2));
    await sendAll();
    expect(stages()).toEqual([[1, "CLEARED", "104000000001"], [2, "AMEND_RECALLED", "104000000002"]]);
    expect(decls.status).toBe("DRAFT");
    reapprove("2026-10-14T05:00:00.000Z");
    // Mở lại (đang sửa ở tờ 2) không bị chặn bởi tờ 1 đã thông quan.
    unwrap(await reopenDeclaration(deps, declarant, D));
    reapprove("2026-10-14T06:00:00.000Z");
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(keysOf("IDA01", 2)).toEqual([`${D}:IDA01:v2:b2`]);
    expect(uow.data.outbox.filter((o) => o.branch === 1)).toEqual([]);
    await sendAll();
    expect(stages()).toEqual([[1, "CLEARED", "104000000001"], [2, "AMEND_PRE_DECLARED", "104000000002"]]);
    expect(dossiers.rows[0]!.status).toBe("SUBMITTED");
  });

  it("C2/R7: tờ đã thông quan / sửa sau thông quan / bị từ chối không chặn; tờ có số còn nhận nội dung chưa gọi về vẫn chặn", async () => {
    decls.items = lines(200);
    seedBranch(1, { state: "CLEARED", raw: { stage: "CLEARED" } });
    seedBranch(2, { state: "CLEARED", raw: { stage: "POST_EDITING" } });
    seedBranch(3, { state: "REJECTED", raw: { stage: "REJECTED" } });
    seedBranch(4, { raw: { stage: "DECLARED" } });
    expect(await reopenDeclaration(deps, declarant, D)).toMatchObject({ ok: false, error: { reason: "SHEETS_RECALL_FIRST", params: { sheets: "4" } } });
  });

  it("I3: IDA tờ 2 hết lượt thử, chưa có externalId → Gửi lại dựng lại từ thông điệp đã ghim (khóa :retry1), nối tiếp tờ 3; bấm IDA vẫn chặn (dùng Gửi lại)", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway(() => false, { queryStatus: async () => { throw new Error("không có externalId để tra"); } });
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll(1); // chỉ tờ 1 → xếp tờ 2
    const b2 = idaOutbox(2)[0]!;
    b2.attempts = MAX_ATTEMPTS;
    await sendAll();
    expect(uow.data.results.find((r) => r.branch === 2)).toMatchObject({ state: "SEND_FAILED", externalId: null, raw: expect.objectContaining({ stage: "NOT_SENT" }) });
    expect(idaOutbox(3)).toHaveLength(0);
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject({ ok: false, error: { code: "INVALID_STATE", message: expect.stringContaining("dùng Gửi lại") } });
    expect(unwrap(await resendOperation(deps, declarant, D, "IDA", 2))).toMatchObject({ resent: true });
    expect(keysOf("IDA", 2)).toEqual([`${D}:IDA:v2:b2`, `${D}:IDA:v2:retry1:b2`]);
    expect(idaOutbox(2)[1]!.payload).toEqual(b2.payload);
    expect(uow.data.results.find((r) => r.branch === 2)?.state).toBe("APPROVED");
    await sendAll();
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("I3: Gửi lại tờ chưa có externalId vẫn kiểm ghim – tờ khai đã mở lại/duyệt lại → không gửi nội dung cũ", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll(1);
    idaOutbox(2)[0]!.attempts = MAX_ATTEMPTS;
    await sendAll();
    decls.status = "APPROVED";
    decls.approvedAt = "2026-10-14T05:00:00.000Z";
    expect(await resendOperation(deps, declarant, D, "IDA", 2)).toMatchObject({ ok: false, error: { code: "INVALID_STATE" } });
    expect(keysOf("IDA", 2)).toHaveLength(1);
  });

  it("I3 (R8): lô một tờ chưa có externalId → Gửi lại giữ như trước (NOT_FOUND)", async () => {
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    uow.data.outbox[0]!.attempts = MAX_ATTEMPTS;
    await sendAll();
    expect(errCode(await resendOperation(deps, declarant, D, "IDA"))).toBe("NOT_FOUND");
  });

  it("I4: lần truyền lại đang chạy (tờ khai SUBMITTED) – tờ 2, 3 đã gọi về: màn Truyền và thực hiện nghiệp vụ cùng coi là đã duyệt (IDA không phải EDIT)", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    for (const b of [1, 2, 3]) unwrap(await performOperation(deps, declarant, D, "IDB", b));
    await sendAll();
    reapprove("2026-10-14T05:00:00.000Z");
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    expect(decls.status).toBe("SUBMITTED");
    const v = unwrap(await getSubmission(deps, declarant, D));
    for (const b of [v.branches[1]!, v.branches[2]!]) {
      expect(b.stage).toBe("RECALLED");
      expect(b.pipeline.find((p) => p.op === "IDA")?.action).not.toBe("EDIT");
    }
  });

  it("minor: IDA người khai bấm trên tờ đã gọi về chạy guard của tờ (ô bắt buộc trống ở dòng của tờ) như chuỗi nối tiếp", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    for (const b of [1, 2, 3]) unwrap(await performOperation(deps, declarant, D, "IDB", b));
    await sendAll();
    decls.items = lines(120).map((i) => (i.lineNo === 25 ? { ...i, description: "" } : i));
    reapprove("2026-10-14T05:00:00.000Z");
    const before = uow.data.outbox.length;
    expect(await performOperation(deps, declarant, D, "IDA", 1)).toMatchObject({ ok: false, error: { reason: "REQUIRED_FIELDS_MISSING_SUBMIT", message: expect.stringContaining("Tờ 1/3") } });
    expect(uow.data.outbox.length).toBe(before);
  });
});

describe("tờ khai nhánh – luôn truyền theo thứ tự tờ (người khai bấm IDA/IDA01 trên tờ sau)", () => {
  const reapprove = (at: string) => {
    decls.status = "APPROVED";
    decls.approvedAt = at;
    dossiers.rows[0]!.status = "APPROVED";
  };
  const order = (sheet: number, waitFor: number) => ({ ok: false, error: { code: "INVALID_STATE", reason: "SHEET_ORDER", params: { sheet, waitFor }, message: `Tờ ${sheet}: chờ tờ ${waitFor} gửi nội dung trước – truyền theo thứ tự tờ khai` } });

  it("3 tờ có số đã gọi về, duyệt lại → IDA tờ 2 / tờ 3 bị chặn (không outbox, tờ khai vẫn APPROVED); IDA tờ 1 → nối 1 → 2 → 3; đang truyền tờ 1 → tờ 3 vẫn chặn", async () => {
    decls.items = lines(120);
    deps.gateway = branchGateway();
    unwrap(await submitDeclaration(deps, declarant, D, "cert_1"));
    await sendAll();
    for (const b of [1, 2, 3]) unwrap(await performOperation(deps, declarant, D, "IDB", b));
    await sendAll();
    expect(uow.data.results.map((r) => r.raw?.stage)).toEqual(["RECALLED", "RECALLED", "RECALLED"]);
    reapprove("2026-10-14T05:00:00.000Z");
    const before = uow.data.outbox.length;
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject(order(2, 1));
    expect(await performOperation(deps, declarant, D, "IDA", 3)).toMatchObject(order(3, 2));
    expect(uow.data.outbox.length).toBe(before);
    expect(decls.status).toBe("APPROVED");
    expect(dossiers.rows[0]!.status).toBe("APPROVED");
    preDeclared = [];
    unwrap(await performOperation(deps, declarant, D, "IDA", 1));
    expect(decls.status).toBe("SUBMITTED");
    // Lần truyền đang chạy (SUBMITTED, tờ 1 chưa có phản hồi): tờ sau vẫn chờ.
    expect(await performOperation(deps, declarant, D, "IDA", 3)).toMatchObject(order(3, 2));
    expect(await performOperation(deps, declarant, D, "IDA", 2)).toMatchObject(order(2, 1));
    await sendAll();
    expect(preDeclared).toEqual([1, 2, 3]);
    expect(stages()).toEqual([[1, "PRE_DECLARED", "104000000001"], [2, "PRE_DECLARED", "104000000002"], [3, "PRE_DECLARED", "104000000003"]]);
  });

  it("R7: tờ 1 đã thông quan, tờ 2, 3 gọi sửa đổi → IDA01 tờ 3 bị chặn (chờ tờ 2); IDA01 tờ 2 được, nối tờ 3; tờ 1 không gửi gì", async () => {
    decls.items = lines(150);
    reapprove("2026-10-14T05:00:00.000Z");
    seedBranch(1, { state: "CLEARED", channel: "GREEN", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1" } });
    seedBranch(2, { raw: { stage: "AMEND_RECALLED", certificateId: "cert_1" } });
    seedBranch(3, { raw: { stage: "AMEND_RECALLED", certificateId: "cert_1" } });
    deps.gateway = branchGateway(() => false, { send: async () => ({ note: "ok" }), queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    expect(await performOperation(deps, declarant, D, "IDA01", 3)).toMatchObject(order(3, 2));
    expect(uow.data.outbox).toEqual([]);
    expect(decls.status).toBe("APPROVED");
    unwrap(await performOperation(deps, declarant, D, "IDA01", 2));
    await sendAll();
    expect(keysOf("IDA01", 3)).toHaveLength(1);
    expect(uow.data.outbox.filter((o) => o.branch === 1)).toEqual([]);
    expect(stages()).toEqual([[1, "CLEARED", "104000000001"], [2, "AMEND_PRE_DECLARED", "104000000002"], [3, "AMEND_PRE_DECLARED", "104000000003"]]);
  });

  it("chuỗi nối tiếp bỏ qua tờ giữa đã thông quan: tờ 1, 3 gọi sửa đổi, tờ 2 thông quan → IDA01 tờ 3 chặn (chờ tờ 1); IDA01 tờ 1 → nối thẳng tờ 3", async () => {
    decls.items = lines(150);
    reapprove("2026-10-14T05:00:00.000Z");
    seedBranch(1, { raw: { stage: "AMEND_RECALLED", certificateId: "cert_1" } });
    seedBranch(2, { state: "CLEARED", channel: "GREEN", clearanceStatus: "CLEARED", raw: { stage: "CLEARED", certificateId: "cert_1" } });
    seedBranch(3, { raw: { stage: "AMEND_RECALLED", certificateId: "cert_1" } });
    deps.gateway = branchGateway(() => false, { send: async () => ({ note: "ok" }), queryStatus: async () => ({ status: "Chưa ghi nhận", cleared: false }) });
    expect(await performOperation(deps, declarant, D, "IDA01", 3)).toMatchObject(order(3, 1));
    expect(uow.data.outbox).toEqual([]);
    unwrap(await performOperation(deps, declarant, D, "IDA01", 1));
    await sendAll();
    expect(uow.data.outbox.filter((o) => o.branch === 2)).toEqual([]);
    expect(keysOf("IDA01", 3)).toHaveLength(1);
    expect(stages()).toEqual([[1, "AMEND_PRE_DECLARED", "104000000001"], [2, "CLEARED", "104000000002"], [3, "AMEND_PRE_DECLARED", "104000000003"]]);
  });

  it("enqueueBranchPreDeclare (chuỗi / người khai) cũng giữ thứ tự: tờ trước còn chờ gửi nội dung → chặn, không tạo outbox", async () => {
    decls.items = lines(120);
    reapprove("2026-10-14T05:00:00.000Z");
    seedBranch(1, { raw: { stage: "RECALLED", certificateId: "cert_1" } });
    seedBranch(2, { raw: { stage: "RECALLED", certificateId: "cert_1" } });
    seedBranch(3, { raw: { stage: "RECALLED", certificateId: "cert_1" } });
    expect(await enqueueBranchPreDeclare(deps, declarant, D, 3, { by: "user" })).toMatchObject(order(3, 2));
    expect(uow.data.outbox).toEqual([]);
  });
});
