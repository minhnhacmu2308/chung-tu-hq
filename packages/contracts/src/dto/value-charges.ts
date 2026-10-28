// Chi phí và điều chỉnh trị giá người khai nhập ở bước OCR & kiểm tra (1.47 cước, 1.48 bảo hiểm, 1.49 khoản điều chỉnh; xuất khẩu 2.40).
// Chứng từ là nguồn chính; nhập tay để bổ sung khi chứng từ không có. Lưu riêng theo hồ sơ – đọc lại chứng từ không làm mất.
import { z } from "zod";
import { DecimalStringSchema, DocKindSchema, IsoDateTimeSchema } from "../common.js";
import type { ReasonCode, ReasonParams } from "../reason-codes.js";

const amount = DecimalStringSchema.refine((v) => Number(v) > 0, "Số tiền phải lớn hơn 0");
const currency = z.string().trim().regex(/^[A-Z]{3}$/, "Mã tiền 3 chữ in hoa (vd USD, VND)");
const note = z.string().trim().max(200).default("");

/** Lý do nhập cước tay / chưa có số cước. Có lý do mà chưa có số → cho duyệt kèm cảnh báo; không có cả hai → chặn duyệt. */
export const FreightReasonSchema = z.enum(["FORWARDER_NOTICE", "INVOICE_LATER", "CONTRACT", "OTHER"]);
export type FreightReason = z.infer<typeof FreightReasonSchema>;
export const FREIGHT_REASON_LABELS: Record<FreightReason, string> = {
  FORWARDER_NOTICE: "Theo thông báo / báo giá của forwarder",
  INVOICE_LATER: "Hóa đơn cước bổ sung sau",
  CONTRACT: "Theo hợp đồng vận tải",
  OTHER: "Khác",
};

export const ManualFreightSchema = z
  .object({ amount: amount.nullable(), currency: currency.nullable(), reason: FreightReasonSchema, note })
  .refine((f) => (f.amount === null) === (f.currency === null), { message: "Nhập cả số tiền và mã tiền", path: ["currency"] })
  .refine((f) => f.reason !== "OTHER" || f.note.length > 0, { message: "Ghi rõ lý do khác", path: ["note"] });
export type ManualFreight = z.infer<typeof ManualFreightSchema>;

/** NONE = người khai xác nhận không mua bảo hiểm (VNACCS mã D); AMOUNT = bảo hiểm riêng (mã A). */
export const ManualInsuranceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }),
  z.object({ mode: z.literal("AMOUNT"), amount, currency }),
]);
export type ManualInsurance = z.infer<typeof ManualInsuranceSchema>;

/**
 * Một khoản điều chỉnh 1.49: mã tên (danh mục ADJUSTMENT_CODE), AD cộng / SB trừ, mã tiền, trị giá.
 * `allocate` (Phân bổ phí): phần mềm tự điền số thứ tự khoản này vào 1.88 của mọi dòng hàng – mặc định bật.
 */
export const ManualAdjustmentSchema = z.object({
  code: z.string().regex(/^[A-Z]$/, "Chọn mã tên khoản điều chỉnh"),
  kind: z.enum(["AD", "SB"]),
  amount,
  currency,
  note,
  allocate: z.boolean().default(true),
});
export type ManualAdjustment = z.infer<typeof ManualAdjustmentSchema>;

/**
 * Giải trình khi điều kiện giao hàng mâu thuẫn với người trả cước trên vận đơn (vd CIF mà vận đơn ghi Freight Collect):
 * LOCAL_CHARGES = cước Collect là phí tại cảng đến (THC, D/O…), không phải cước quốc tế; PER_CONTRACT = hóa đơn / hợp đồng ghi đúng
 * điều kiện này, cước do bên khác trả theo thỏa thuận; OTHER = ghi rõ lý do.
 */
export const FreightTermReasonSchema = z.enum(["LOCAL_CHARGES", "PER_CONTRACT", "OTHER"]);
export type FreightTermReason = z.infer<typeof FreightTermReasonSchema>;
export const FREIGHT_TERM_REASON_LABELS: Record<FreightTermReason, string> = {
  LOCAL_CHARGES: "Cước Collect là phí tại cảng đến (THC, D/O…), không phải cước quốc tế",
  PER_CONTRACT: "Hóa đơn / hợp đồng ghi đúng điều kiện này – cước do bên khác trả theo thỏa thuận",
  OTHER: "Khác",
};
export const FreightTermNoteSchema = z
  .object({ reason: FreightTermReasonSchema, note })
  .refine((f) => f.reason !== "OTHER" || f.note.length > 0, { message: "Ghi rõ lý do khác", path: ["note"] });
export type FreightTermNote = z.infer<typeof FreightTermNoteSchema>;

/** null ở mỗi phần = theo chứng từ. `adjustments` khác null thay toàn bộ phí khác đọc từ chứng từ. VNACCS cho tối đa 5 khoản. */
export const ValueChargesSchema = z.object({
  freight: ManualFreightSchema.nullable(),
  insurance: ManualInsuranceSchema.nullable(),
  adjustments: z.array(ManualAdjustmentSchema).max(5, "Tối đa 5 khoản điều chỉnh").nullable(),
  /** Giải trình mâu thuẫn điều kiện giao hàng ↔ người trả cước (không có = chưa giải trình). */
  freightTermNote: FreightTermNoteSchema.nullable().optional(),
});
export type ValueCharges = z.infer<typeof ValueChargesSchema>;
export const EMPTY_VALUE_CHARGES: ValueCharges = { freight: null, insurance: null, adjustments: null };

/** Giá trị chỉ tiêu 1.48 khi người khai xác nhận không mua bảo hiểm (VNACCS KTG_IN1 = D). */
export const NO_INSURANCE_VALUE = "D – Không bảo hiểm";

/** Một khoản 1.49 đã chuẩn hóa – dùng chung cho chỉ tiêu tờ khai, form đầy đủ (KTG_VR/VI/VC/VP) và dữ liệu truyền FPT. */
export type AdjustmentLine = { code: string; kind: "AD" | "SB"; amount: string; currency: string; /** false = không phân bổ tự động vào 1.88. */ allocate?: boolean };
/** Chỉ tiêu 1.49 lưu dạng "A AD 120.5 USD; G SB 10 USD KPB" – đuôi "KPB": khoản không phân bổ tự động vào 1.88 của các dòng hàng. */
export const formatAdjustmentField = (rows: readonly AdjustmentLine[]) => rows.map((r) => `${r.code} ${r.kind} ${r.amount} ${r.currency}${r.allocate === false ? " KPB" : ""}`).join("; ");
/** Đọc lại chỉ tiêu 1.49; phần không đúng dạng (khoản chưa có mã) bị bỏ qua. */
export function parseAdjustmentField(value: string): AdjustmentLine[] {
  return value.split(";").flatMap((part) => {
    const m = /^([A-Z]) (AD|SB) (\d+(?:\.\d+)?) ([A-Z]{3})( KPB)?$/.exec(part.trim());
    return m ? [{ code: m[1]!, kind: m[2] as "AD" | "SB", amount: m[3]!, currency: m[4]!, allocate: !m[5] }] : [];
  });
}
/** Chỉ tiêu 1.88 của mỗi dòng hàng: số thứ tự (1…5) các khoản 1.49 được phân bổ cho mọi dòng. */
export const allocatedAdjustmentNos = (value: string) => parseAdjustmentField(value).slice(0, 5).flatMap((a, i) => (a.allocate === false ? [] : [i + 1]));

/** Giá trị đọc được từ chứng từ (để người khai so và gợi ý điền). */
export const DocumentChargesSchema = z.object({
  freight: z.object({ amount: DecimalStringSchema, currency: z.string(), kind: DocKindSchema.nullable() }).nullable(),
  insurance: z.object({ amount: DecimalStringSchema, currency: z.string(), kind: DocKindSchema.nullable() }).nullable(),
  other: z.array(z.object({ label: z.string(), amount: DecimalStringSchema, currency: z.string(), kind: DocKindSchema })),
});
export type DocumentCharges = z.infer<typeof DocumentChargesSchema>;

export const ValueChargesViewSchema = z.object({
  charges: ValueChargesSchema,
  fromDocuments: DocumentChargesSchema,
  direction: z.enum(["NK", "XK"]),
  /** Mã điều kiện giao hàng đã chuẩn hóa ("" khi chưa có). */
  incoterm: z.string(),
  /** Nhập khẩu: EXW/FCA/FAS/FOB phải cộng cước. Xuất khẩu: nhóm C/D phải trừ cước. */
  freightRequired: z.boolean(),
  /**
   * Cước trên chứng từ quy đổi VND theo tỷ giá tính thuế hôm nay (đặc tả VNACCS IDA (2): số tiền × tỷ giá, làm tròn đồng) – trị giá tính thuế
   * tăng / giảm đúng chừng này khi đổi điều kiện giao hàng cộng / không cộng cước; null = không có cước hoặc chưa có tỷ giá.
   */
  freightVnd: DecimalStringSchema.nullable().optional(),
  /** Người trả cước trên vận đơn (Freight Prepaid / Collect); null = vận đơn không ghi / chưa đọc được. */
  freightTerm: z.enum(["PREPAID", "COLLECT"]).nullable().optional(),
  /** Điều kiện giá đã gồm bảo hiểm (CIF, CIP…): nhập khẩu không khai 1.48. */
  insuranceIncluded: z.boolean(),
  /** Hồ sơ đã duyệt / truyền – chỉ xem. */
  locked: z.boolean(),
  updatedAt: IsoDateTimeSchema.nullable(),
  updatedBy: z.string().nullable(),
});
export type ValueChargesView = z.infer<typeof ValueChargesViewSchema>;

/**
 * Ràng buộc theo chứng từ khi lưu chi phí (giao diện, mock, backend dùng chung): cước bắt buộc mà chứng từ có cước → nhập tay phải có số tiền;
 * nhập khẩu, chứng từ có phí khác → không được khai "Không có phí phát sinh" (danh sách khoản điều chỉnh rỗng). null = hợp lệ.
 */
export function chargesConflict(
  input: ValueCharges, ctx: Pick<ValueChargesView, "direction" | "freightRequired" | "fromDocuments">,
): { reason: Extract<ReasonCode, "CHARGES_FREIGHT_AMOUNT_REQUIRED" | "CHARGES_ADJUSTMENTS_IN_DOCS">; params: ReasonParams } | null {
  const docFreight = ctx.fromDocuments.freight;
  if (ctx.freightRequired && docFreight && input.freight && input.freight.amount === null) {
    return { reason: "CHARGES_FREIGHT_AMOUNT_REQUIRED", params: { amount: docFreight.amount, currency: docFreight.currency } };
  }
  const other = ctx.fromDocuments.other.length;
  if (ctx.direction === "NK" && other > 0 && input.adjustments?.length === 0) return { reason: "CHARGES_ADJUSTMENTS_IN_DOCS", params: { n: other } };
  return null;
}

/** Điều kiện giao hàng người bán trả cước chặng chính (nhóm C, D). */
const SELLER_PAYS_FREIGHT = new Set(["CFR", "C&F", "CIF", "CPT", "CIP", "C&I", "DAP", "DPU", "DAT", "DDP", "DDU", "DAF", "DES", "DEQ"]);
/** Nhóm E, F: người mua trả cước chặng chính. */
const BUYER_PAYS_FREIGHT = new Set(["EXW", "FCA", "FAS", "FOB"]);

/** Giá theo điều kiện giao hàng đã gồm cước chặng chính (nhóm C, D – người bán trả cước). */
export const incotermIncludesFreight = (code: string): boolean => SELLER_PAYS_FREIGHT.has(code);

/** Mã điều kiện giao hàng chuẩn hóa ("CIF HAIPHONG" → "CIF", "C AND F" / "CNF" → "C&F", bỏ tiền tố "Incoterms 2020"); cùng cách đọc với luật R-INCOTERM-CODE. */
export function incotermOf(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toUpperCase().replace(/^INCOTERMS?\s*(\d{4})?[\s:,-]*/, "");
  if (/^(C\s*&\s*F|C\s*N\s*F|C\s+AND\s+F)(?![A-Z])/.test(t)) return "C&F";
  if (/^(C\s*&\s*I|C\s+AND\s+I)(?![A-Z])/.test(t)) return "C&I";
  return t.split(/[^A-Z&]+/)[0] ?? "";
}

/**
 * Điều kiện giao hàng có khớp người trả cước trên vận đơn không (luật R-FREIGHT-TERM, giao diện, mock dùng chung):
 * CONFLICT = nhóm C/D (người bán trả cước) mà vận đơn ghi Collect; CHECK = nhóm E/F mà vận đơn ghi Prepaid (người bán trả hộ – vẫn phải cộng cước);
 * OK = khớp; UNKNOWN = thiếu điều kiện giao hàng hoặc vận đơn không ghi.
 */
export function freightTermFit(incoterm: string, freightTerm: string | null | undefined): "OK" | "CONFLICT" | "CHECK" | "UNKNOWN" {
  const code = incotermOf(incoterm);
  const term = (freightTerm ?? "").trim().toUpperCase();
  if (!code || (term !== "PREPAID" && term !== "COLLECT")) return "UNKNOWN";
  if (SELLER_PAYS_FREIGHT.has(code)) return term === "COLLECT" ? "CONFLICT" : "OK";
  if (BUYER_PAYS_FREIGHT.has(code)) return term === "PREPAID" ? "CHECK" : "OK";
  return "UNKNOWN";
}
