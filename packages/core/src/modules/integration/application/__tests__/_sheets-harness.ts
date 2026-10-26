// Harness dùng chung cho test lô nhiều tờ (sheets-order, sheets-declare-all): kho in-memory, khai báo giả, hồ sơ giả, dựng lô theo giai đoạn.
// Gốc: customs-use-cases.test.ts (file đó không export helper).
import { fillAttachmentSlot, type AttachmentValues, type DeclarationStatus, type DocKind } from "@kb/contracts";
import { fixedClock } from "../../../../shared/clock.js";
import type { Ctx } from "../../../../shared/ctx.js";
import { asOrgId, asUserId, sequentialIdGen } from "../../../../shared/ids.js";
import { InMemoryJobQueue } from "../../../../shared/queue.js";
import { RecordingNotifier } from "../../../../shared/notifier.js";
import type { ProgressEvent } from "../../../dossier/index.js";
import type { DeclarationPayload } from "../../domain/declaration-to-fpt.js";
import { sheetSnapshot } from "../../domain/branches.js";
import type { CustomsDeps, CustomsDossierPort, DeclarationReader, DossierBrief, ResultRow } from "../customs-ports.js";
import { FakeCustomsGateway } from "../test/fake-customs-gateway.js";
import { InMemoryCustomsUow } from "../test/in-memory-customs-uow.js";

export const ORG = "org_a";
export const declarant: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_chau"), role: "DECLARANT" };
export const viewer: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_v"), role: "VIEWER" };
export const approver: Ctx = { orgId: asOrgId(ORG), userId: asUserId("usr_duyet"), role: "APPROVER" };
export const other: Ctx = { orgId: asOrgId("org_b"), userId: asUserId("usr_x"), role: "ADMIN" };

export const payload = (kind: "IDA" | "EDA" = "IDA"): DeclarationPayload => ({
  kind, direction: kind === "IDA" ? "NK" : "XK", currency: "USD", containers: ["SITU2246781"], adjustments: [],
  fields: { MA_LH: { value: "A11" }, CQHQ: { value: "03CE – HP" }, PTVC: { value: "2 – Biển" }, NNK_MST: { value: "0316789012" }, NNK_TEN: { value: "AN PHÁT" }, NNK_DC: { value: "Hải Phòng" }, NXK_MST: { value: "0316789012" }, NXK_TEN: { value: "HANSOL" }, NXK_DC: { value: "Changwon" }, MA_NUOC: { value: "KR" }, SO_VD: { value: "HPSEL2610078" }, SO_KIEN: { value: "48 PL" }, TRONG_LUONG: { value: "3860.5" }, KHO: { value: "03CCS01 – Kho" }, CANG_DO: { value: "VNHPH – Cảng Hải Phòng" }, CANG_XEP: { value: "KRPUS – Busan" }, PTVC_TEN: { value: "SITC" }, NGAY_DEN: { value: "2026-10-15" }, NGAY_DI: { value: "2026-10-15" }, SO_HD: { value: "HSP-1" }, NGAY_HD: { value: "2026-10-02" }, PT_TT: { value: "TTR – T/T" }, DK_GIA: { value: "FCA" }, MA_TT: { value: "USD" }, TONG_TG: { value: "20850" }, VBPQ: { value: "MO" },
    // Đủ ô bắt buộc trước khi khai (@kb/contracts declarationRequiredGaps): IDA và EDA đường biển container, giá FCA.
    PL_CN: { value: "4 – Tổ chức" }, HO_HIEU: { value: "VRDK5" }, HD_PL: { value: "A – Hóa đơn thương mại" }, GIA_PL: { value: "A" }, NGUOI_NT: { value: "1" },
    NXK_DT: { value: "0225 3 888 123" }, TG_TT: { value: "20850 USD" }, SO_CONT: { value: "SITU2246781" }, CON_VC1: { value: "03CCS01" } },
  items: [{ lineNo: 1, description: "Vòng bi", quantity: "2000", unit: "PCE", unitPrice: "1.85", amount: "3700", origin: "KR", hsConfirmed: "8482.10.00", importDutyRate: "3", vatRate: "8", policyNote: null }],
});

export class FakeDeclarations implements DeclarationReader {
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
  /** Payload hiện tại (đồng bộ – dựng ảnh chụp nội dung đã gửi khi gieo kết quả). */
  payloadNow(): DeclarationPayload {
    const p = payload(this.kind);
    return { ...p, fields: { ...p.fields, ...this.fields }, ...(this.items ? { items: structuredClone(this.items) } : {}) };
  }
  async get(_orgId: string, dossierId: string) {
    if (dossierId === "dos_none") return null;
    return { declarationId: "dec_1", version: this.version, status: this.status, payload: this.payloadNow(), unconfirmedHs: this.unconfirmedHs, estimatedTaxVnd: "58449312", exchangeRateDate: this.rateDate, approvedAt: this.approvedAt, ...(this.branchTaxVnd ? { branchTaxVnd: this.branchTaxVnd } : {}) };
  }
  async markSubmitted(_ctx: { orgId: string }, dossierId: string) {
    this.submitted.push(dossierId);
    this.status = "SUBMITTED";
  }
  /** Các lần điền đính kèm HYS: ghi lại và áp fillAttachmentSlot lên `fields` để test sau kiểm tra. */
  readonly attachments: { dossierId: string; procedureCode: string; receiptNo: string; note: string }[] = [];
  async fillAttachment(_ctx: { orgId: string }, dossierId: string, input: { procedureCode: string; receiptNo: string; note: string }) {
    this.attachments.push({ dossierId, ...input });
    if (this.status !== "DRAFT" && this.status !== "APPROVED") return { outcome: "LOCKED" as const, afterApproval: false };
    const cur = this.payloadNow().fields;
    const values: AttachmentValues = {};
    for (const n of [1, 2, 3] as const) { values[`TK_EA${n}`] = cur[`TK_EA${n}`]?.value ?? ""; values[`TK_EB${n}`] = cur[`TK_EB${n}`]?.value ?? ""; }
    const fill = fillAttachmentSlot(values, input.procedureCode, input.receiptNo);
    for (const [k, v] of Object.entries(fill.set ?? {})) this.fields[k] = { value: v };
    return { outcome: fill.outcome, ...(fill.slot ? { slot: fill.slot } : {}), afterApproval: this.status === "APPROVED" };
  }
  readonly reopened: string[] = [];
  /** Hồ sơ giả gắn kèm: markDraft thật đưa hồ sơ về NEEDS_REVIEW/review (port DeclarationReader.markDraft). */
  dossiers: FakeDossiers | null = null;
  async markDraft(_ctx: { orgId: string }, dossierId: string) {
    this.reopened.push(dossierId);
    this.status = "DRAFT";
    for (const d of this.dossiers?.rows ?? []) if (d.id === dossierId) Object.assign(d, { status: "NEEDS_REVIEW", step: "review" });
  }
  async listForCustoms() {
    return [{ dossierId: "dos_1", status: this.status, approvedAt: new Date("2026-10-14T02:00:00.000Z") }];
  }
}
export class FakeDossiers implements CustomsDossierPort {
  readonly events: ProgressEvent[] = [];
  readonly patches: unknown[] = [];
  constructor(public rows: (DossierBrief & { orgId: string })[], public docs: { id: string; kind: DocKind; fileName: string; storageKey: string; mime: string; sizeBytes: number }[] = [{ id: "doc_1", kind: "INVOICE", fileName: "inv.pdf", storageKey: "k/inv.pdf", mime: "application/pdf", sizeBytes: 4 }]) {}
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
  readonly files = new Map<string, Buffer>();
  async readFile(key?: string) {
    return (key ? this.files.get(key) : undefined) ?? Buffer.from("%PDF");
  }
  async putFile(key: string, bytes: Buffer) {
    this.files.set(key, bytes);
  }
  async deleteFile(key: string) {
    this.files.delete(key);
  }
  async publish(_o: string, _d: string, e: ProgressEvent) {
    this.events.push(e);
  }
}

export const D = "dos_1";
export const T = new Date("2026-10-14T03:00:00.000Z");

export type Harness = { uow: InMemoryCustomsUow; queue: InMemoryJobQueue; decls: FakeDeclarations; dossiers: FakeDossiers; deps: CustomsDeps };
export function makeHarness(): Harness {
  const uow = new InMemoryCustomsUow();
  const queue = new InMemoryJobQueue();
  const decls = new FakeDeclarations();
  const dossiers = new FakeDossiers([{ id: D, orgId: ORG, code: "HS-NK-2610-021", direction: "NK", typeCode: "A11", partner: "HANSOL", status: "APPROVED", step: "submit", declarationNo: null, updatedAt: T }]);
  decls.dossiers = dossiers;
  const deps: CustomsDeps = {
    notify: new RecordingNotifier(), uow, queue, gateway: new FakeCustomsGateway({ clearAfterPolls: 2 }), declarations: decls, dossiers,
    validation: { blockerFails: async () => 0 }, certificates: { exists: async (_o, id) => id === "cert_1" },
    audit: { append: async () => undefined }, org: { fourEyes: async () => false },
    pollDelayMs: 10, clock: fixedClock("2026-10-14T03:00:00.000Z"), idGen: sequentialIdGen(),
  };
  return { uow, queue, decls, dossiers, deps };
}

export const lines = (n: number): DeclarationPayload["items"] => Array.from({ length: n }, (_, i) => ({ ...payload().items[0]!, lineNo: i + 1, description: `Vòng bi ${i + 1}` }));
/**
 * Kết quả tờ `branch` ở giai đoạn `stage` (có số tờ khai trừ NOT_SENT). Tờ có số mang ảnh chụp nội dung đã gửi (raw.sent) = payload hiện tại
 * (Hải quan giữ đúng nội dung đang có); `sent: false` = dữ liệu cũ gửi trước khi có ảnh chụp.
 */
export const seed = (h: Harness, branch: number, stage: string, opts: { sent?: boolean } = {}) => {
  const sent = stage !== "NOT_SENT" && opts.sent !== false ? { sent: sheetSnapshot(h.decls.payloadNow(), branch) } : {};
  const row: ResultRow = {
    id: `res_${branch}`, orgId: ORG, dossierId: D, branch, externalId: `fpt-b${branch}`, declarationNo: `10400000000${branch}`, channel: null, channelNote: null, clearanceStatus: "WAITING",
    customsTaxVnd: null, state: stage === "CLEARED" ? "CLEARED" : stage === "REJECTED" ? "REJECTED" : stage === "PRE_DECLARED" || stage === "RECALLED" ? "PRE_DECLARED" : "DECLARED", pollCount: 0, raw: { stage, certificateId: "cert_1", ...sent } as ResultRow["raw"], updatedAt: T,
  };
  h.uow.data.results.push(row);
};
/** Lô `stages.length` tờ (50 dòng/tờ, tờ cuối 40 dòng), tờ khai đang truyền (SUBMITTED), tờ k ở giai đoạn stages[k-1]. */
export const lot = (h: Harness, ...stages: string[]) => {
  h.decls.items = lines(stages.length * 50 - 10);
  h.decls.status = "SUBMITTED";
  h.dossiers.rows[0]!.status = "SUBMITTED";
  stages.forEach((st, i) => seed(h, i + 1, st));
};
