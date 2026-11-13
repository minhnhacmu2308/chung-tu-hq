import { z } from "zod";
import { DecimalStringSchema, IsoDateTimeSchema } from "../common.js";
import { CatalogFactorSchema, CatalogItemKindSchema } from "../item-catalog/schemas.js";
import { AgentModeSchema, AgentRunSchema, AgentTaskIdSchema, DeclarationSchema, LineItemSchema } from "../dto/declaration.js";

export const StartAgentRunInputSchema = z.object({ mode: AgentModeSchema });
export const ConfirmHsInputSchema = z.object({ code: z.string().trim().regex(/^\d{4}\.\d{2}\.\d{2}$/, "Mã HS 8 số dạng 8482.10.00") });
export const UpdateDeclarationFieldInputSchema = z.object({ value: z.string().trim().max(500) });
/**
 * Gắn mặt hàng danh mục cho dòng hàng ("Mã lạ – Chọn mặt hàng"): chọn mặt hàng có sẵn hoặc tạo mới. Part No của dòng thành bí danh trong bộ nhà cung cấp
 * (người phụ trách bộ mã → ACTIVE ngay; người khác → PROPOSED). `factor`: "1 ĐVT dòng = factor ĐVT gốc" khi ĐVT khác ĐVT gốc chưa có quy đổi.
 */
export const LinkLineItemInputSchema = z.union([
  z.object({ itemId: z.string().min(1), factor: CatalogFactorSchema.optional() }),
  z.object({ createItem: z.object({ kind: CatalogItemKindSchema, name: z.string().trim().min(1).max(500), hsCode: z.string().trim().regex(/^[\d.]{4,12}$/).optional(), baseUnit: z.string().trim().min(1).max(30).optional(), factor: CatalogFactorSchema.optional() }) }),
]);
export type LinkLineItemInput = z.infer<typeof LinkLineItemInputSchema>;
/** Hệ số quy đổi theo lô của dòng (packing list ghi khác mặc định); null = bỏ, dùng hệ số mặc định của danh mục. */
export const SetLineUnitFactorInputSchema = z.object({ factor: CatalogFactorSchema.nullable() });
export type SetLineUnitFactorInput = z.infer<typeof SetLineUnitFactorInputSchema>;
export const HsCatalogQuerySchema = z.object({ q: z.string().trim().max(100).optional() });

export const AgentLogLineSchema = z.object({ at: IsoDateTimeSchema, text: z.string(), tone: z.enum(["info", "success", "warning"]) });
export type AgentLogLine = z.infer<typeof AgentLogLineSchema>;

/** Tiến trình agent cho màn hình: run + nhật ký + việc đang chạy. */
export const AgentRunViewSchema = z.object({ run: AgentRunSchema, logs: z.array(AgentLogLineSchema), finished: z.boolean(), current: AgentTaskIdSchema.optional() });
export type AgentRunView = z.infer<typeof AgentRunViewSchema>;

/** Biểu thuế tối thiểu (D1): thuế NK MFN, ưu đãi đặc biệt theo mẫu C/O, VAT, chính sách. */
export const HsEntrySchema = z.object({
  code: z.string(),
  description: z.string(),
  mfn: DecimalStringSchema,
  pref: z.record(z.string(), DecimalStringSchema).optional(),
  vat: DecimalStringSchema,
  policy: z.string().optional(),
});
export type HsEntry = z.infer<typeof HsEntrySchema>;

export const DeclarationItemViewSchema = LineItemSchema.extend({ customsValueVnd: DecimalStringSchema, importDutyVnd: DecimalStringSchema, vatVnd: DecimalStringSchema });
export type DeclarationItemView = z.infer<typeof DeclarationItemViewSchema>;

/** Tỷ giá đã dùng khi dựng tờ khai + nguồn (màn Review): tuần hiệu lực (thứ Hai), VCB tự động / nhập tay / dữ liệu mẫu. */
export const ExchangeRateInfoSchema = z.object({ currency: z.string(), rate: DecimalStringSchema, effectiveFrom: z.string(), source: z.enum(["VCB", "MANUAL", "SEED"]), snapshotAt: IsoDateTimeSchema.nullable() });
export type ExchangeRateInfo = z.infer<typeof ExchangeRateInfoSchema>;
/** Tổng một tờ khai nhánh (tối đa 50 dòng/tờ): trị giá hóa đơn (nguyên tệ), trị giá tính thuế và thuế dự tính (VND). */
export const DeclarationBranchSchema = z.object({
  no: z.number().int(), of: z.number().int(), lineFrom: z.number().int(), lineTo: z.number().int(),
  invoiceValue: DecimalStringSchema, customsValueVnd: DecimalStringSchema, estImportDutyVnd: DecimalStringSchema, estVatVnd: DecimalStringSchema,
});
export type DeclarationBranch = z.infer<typeof DeclarationBranchSchema>;
export const DeclarationViewSchema = z.object({ declaration: DeclarationSchema.nullable(), items: z.array(DeclarationItemViewSchema), branches: z.array(DeclarationBranchSchema).default([]), unconfirmedHs: z.number().int().nonnegative(), exchangeRateInfo: ExchangeRateInfoSchema.nullable().optional() });
export type DeclarationView = z.infer<typeof DeclarationViewSchema>;

/** Người khai trả lời câu hỏi của AI phân loại HS (mỗi câu con một phần tử). */
export const HsAnswerInputSchema = z.object({
  questionId: z.string().min(1),
  answers: z
    .array(
      z.object({ id: z.string().min(1), selected: z.array(z.string()), custom: z.string().trim().max(1000).nullable() })
        .refine((a) => a.selected.length > 0 || !!a.custom, "Chọn ít nhất một đáp án hoặc nhập trả lời khác"),
    )
    .min(1)
    .max(3),
});
export type HsAnswerInput = z.infer<typeof HsAnswerInputSchema>;

/** Phân loại lại một dòng: có thể bổ sung mô tả / xuất xứ (ISO-2). */
export const HsReclassifyInputSchema = z.object({ extraDescription: z.string().trim().max(500).optional(), origin: z.string().regex(/^[A-Z]{2}$/, "Mã nước 2 chữ in hoa (vd CN, TW)").optional() });
export type HsReclassifyInput = z.infer<typeof HsReclassifyInputSchema>;
