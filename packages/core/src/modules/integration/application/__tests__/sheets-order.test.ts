// Thứ tự truyền theo tờ cho khai chính thức (IDC/IDE/EDC/EDE) và hiển thị khóa của getSubmission (lô nhiều tờ).
// Harness sao từ customs-use-cases.test.ts (file đó không export helper).
import { beforeEach, describe, expect, it } from "vitest";
import type { DeclarationStatus, DocKind } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import { unwrap } from "../../../../shared/result.js";
import type { ProgressEvent } from "../../../dossier/index.js";
import type { DeclarationPayload } from "../../domain/declaration-to-fpt.js";
import type { CustomsDeps, CustomsDossierPort, DeclarationReader, DossierBrief, ResultRow } from "../customs-ports.js";
import { getSubmission } from "../get-submission.js";
import { performOperation } from "../perform-operation.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
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
let decls: FakeDeclarations;
let dossiers: FakeDossiers;
let deps: CustomsDeps;
const D = "dos_1";
const T = new Date("2026-10-14T03:00:00.000Z");

beforeEach(() => {
  uow = new InMemoryCustomsUow();
  queue = new InMemoryJobQueue();
  decls = new FakeDeclarations();
  dossiers = new FakeDossiers([{ id: D, orgId: ORG, code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: T }]);
  deps = {
    notify: new RecordingNotifier(), uow, queue, gateway: new FakeCustomsGateway({ clearAfterPolls: 2 }), declarations: decls, dossiers,
    validation: { blockerFails: async () => 0 }, certificates: { exists: async (_o, id) => id === "cert_1" },
    audit: { append: async () => undefined }, org: { fourEyes: async () => false },
    pollDelayMs: 10, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
});

const lines = (n: number): DeclarationPayload["items"] => Array.from({ length: n }, (_, i) => ({ ...payload().items[0]!, lineNo: i + 1, description: `Vòng bi ${i + 1}` }));
/** Kết quả tờ `branch` ở giai đoạn `stage` (có số tờ khai trừ NOT_SENT). */
const seed = (branch: number, stage: string) => {
  const row: ResultRow = {
    id: `res_${branch}`, orgId: ORG, dossierId: D, branch, externalId: `fpt-b${branch}`, declarationNo: `10400000000${branch}`, channel: null, channelNote: null, clearanceStatus: "WAITING",
    customsTaxVnd: null, state: stage === "CLEARED" ? "CLEARED" : stage === "REJECTED" ? "REJECTED" : stage === "PRE_DECLARED" || stage === "RECALLED" ? "PRE_DECLARED" : "DECLARED", pollCount: 0, raw: { stage, certificateId: "cert_1" } as ResultRow["raw"], updatedAt: T,
  };
  uow.data.results.push(row);
};
const lot = (...stages: string[]) => {
  decls.items = lines(stages.length * 50 - 10);
  decls.status = "SUBMITTED";
  dossiers.rows[0]!.status = "SUBMITTED";
  stages.forEach((st, i) => seed(i + 1, st));
};
const orderErr = (reason: string, sheet: number, waitFor: number) => ({ ok: false, error: { code: "INVALID_STATE", reason, params: { sheet, waitFor } } });

describe("khai chính thức (IDC/IDE) theo thứ tự tờ – SHEET_ORDER_DECLARE (quyết định D2)", () => {
  it("tờ 1 RECALLED, tờ 2 PRE_DECLARED → IDC tờ 2 bị chặn (chờ tờ 1), không tạo outbox", async () => {
    lot("RECALLED", "PRE_DECLARED", "PRE_DECLARED");
    expect(await performOperation(deps, declarant, D, "IDC", 2)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 2, 1));
    expect(await performOperation(deps, declarant, D, "IDC", 3)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 3, 1));
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("tờ 1 AMEND_RECALLED, tờ 2 AMEND_PRE_DECLARED → IDE tờ 2 bị chặn", async () => {
    lot("AMEND_RECALLED", "AMEND_PRE_DECLARED");
    expect(await performOperation(deps, declarant, D, "IDE", 2)).toMatchObject(orderErr("SHEET_ORDER_DECLARE", 2, 1));
    expect(uow.data.outbox).toHaveLength(0);
  });
  it("D2: tờ 1 PRE_DECLARED (chưa IDC), tờ 2 PRE_DECLARED → IDC tờ 2 gửi được", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED", "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 2));
    expect(uow.data.outbox.map((o) => [o.branch, o.operation])).toEqual([[2, "IDC"]]);
  });
  it("tờ 1 CLEARED / REJECTED (miễn), tờ 2 PRE_DECLARED → IDC tờ 2 gửi được", async () => {
    lot("CLEARED", "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 2));
    expect(uow.data.outbox).toHaveLength(1);
  });
  it("lô một tờ → IDC như cũ", async () => {
    decls.items = lines(10);
    decls.status = "SUBMITTED";
    seed(1, "PRE_DECLARED");
    unwrap(await performOperation(deps, declarant, D, "IDC", 1));
    expect(uow.data.outbox.map((o) => [o.branch, o.operation, o.idempotencyKey])).toEqual([[1, "IDC", `${D}:IDC:n1`]]);
  });
});

describe("getSubmission – dòng nghiệp vụ của tờ đang chờ khóa theo thứ tự tờ", () => {
  const pipelineOf = async (no: number) => unwrap(await getSubmission(deps, declarant, D)).branches[no - 1]!.pipeline;
  it("tờ 1 RECALLED: dòng IDC tờ 2 enabled=false, reasonCode SHEET_ORDER_DECLARE; tờ 1 không bị khóa", async () => {
    lot("RECALLED", "PRE_DECLARED");
    expect((await pipelineOf(2)).find((r) => r.op === "IDC")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER_DECLARE", reasonParams: { sheet: 2, waitFor: 1 } });
    expect((await pipelineOf(1)).find((r) => r.op === "IDA")).toMatchObject({ enabled: true });
  });
  it("tờ 1 RECALLED, tờ 2 RECALLED, tờ khai đã duyệt lại: dòng IDA tờ 2 enabled=false, reasonCode SHEET_ORDER", async () => {
    lot("RECALLED", "RECALLED");
    decls.status = "APPROVED";
    expect((await pipelineOf(2)).find((r) => r.op === "IDA")).toMatchObject({ enabled: false, reasonCode: "SHEET_ORDER", reasonParams: { sheet: 2, waitFor: 1 } });
    expect((await pipelineOf(1)).find((r) => r.op === "IDA")).toMatchObject({ enabled: true });
  });
  it("tờ 1 PRE_DECLARED: IDC tờ 2 bấm được", async () => {
    lot("PRE_DECLARED", "PRE_DECLARED");
    expect((await pipelineOf(2)).find((r) => r.op === "IDC")).toMatchObject({ enabled: true });
  });
});
