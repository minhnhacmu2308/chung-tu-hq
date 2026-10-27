// API phân loại mã HS của HSCodePro (docs/integrations/hscodepro-api-v1.md). Dạng dây giữ snake_case như tài liệu.
import { z } from "zod";

const HS8 = z.string().regex(/^\d{8}$/, "Mã HS 8 chữ số, không dấu chấm");

/**
 * Thuế của một mã. Trường mở rộng (optional) của bản hscode-api mới – HSCodePro gốc / fpt-mock không trả vẫn hợp lệ:
 * `import.normal_rate` thuế suất thông thường (tham khảo khi áp FTA); `vat.standard_rate` thuế suất theo Luật (0/5/10);
 * `vat.vnaccs_code` mã khai VNACCS (VB901 10%, VB245 8%, VB0xx 5%, VKxxx không chịu thuế); `vat.certain` = false khi VAT phụ thuộc
 * điều kiện ngoài mã HS (giấy phép, mục đích nhập khẩu…) – đọc `vat.note`. `vat.rate` null + mã VK = KHÔNG CHỊU THUẾ GTGT.
 */
export const HsTaxSchema = z.object({
  import: z.object({ rate: z.number(), basis: z.enum(["MFN", "FTA"]), agreement: z.string().nullable(), normal_rate: z.number().nullable().optional() }),
  vat: z.object({
    rate: z.number().nullable(), note: z.string().nullable(),
    standard_rate: z.number().nullable().optional(), vnaccs_code: z.string().optional(), certain: z.boolean().optional(), legal_basis: z.array(z.string()).optional(),
  }),
  source_date: z.string(),
});
export const HsAlternativeSchema = z.object({ hs_code: HS8, hs_description: z.string(), confidence: z.number().min(0).max(100), why_not: z.string(), tax: HsTaxSchema.nullable() });
export const HsResultSchema = z.object({
  hs_code: HS8, hs_description: z.string(), confidence: z.number().min(0).max(100), reasoning: z.string(),
  legal_basis: z.array(z.string()), warnings: z.array(z.string()), tax: HsTaxSchema.nullable(), alternatives: z.array(HsAlternativeSchema).max(3),
  /** Mô tả hàng tiếng Việt AI gợi ý (bản hscode-api mới). */
  description_vi: z.string().nullable().optional(),
});
export const HsQuestionSchema = z.object({
  id: z.string(), question: z.string(), header: z.string().optional(), detail: z.string().optional(),
  options: z.array(z.object({ label: z.string(), description: z.string().optional() })).optional(), multiSelect: z.boolean().optional(),
});
export const HsPendingQuestionSchema = z.object({ id: z.string(), questions: z.array(HsQuestionSchema).min(1).max(3) });
export const HsItemStatusSchema = z.enum(["queued", "processing", "need_info", "completed", "failed", "cancelled"]);
export const HsItemErrorSchema = z.object({ code: z.string(), message: z.string() });
export const HsJobItemSchema = z.object({
  id: z.string(), line_no: z.number().int().positive(), status: HsItemStatusSchema,
  question: HsPendingQuestionSchema.nullable(), result: HsResultSchema.nullable(), error: HsItemErrorSchema.nullable(),
});
export const HsJobSchema = z.object({
  id: z.string(), external_ref: z.string().nullable(), import_date: z.string(),
  status: z.enum(["processing", "need_info", "completed"]), created_at: z.string(), items: z.array(HsJobItemSchema),
});
export const HsCreateItemSchema = z.object({
  line_no: z.number().int().positive(),
  description: z.string().min(3).max(1000),
  origin_country: z.string().regex(/^[A-Z]{2}$/, "Mã nước ISO 3166-1 alpha-2"),
  quantity: z.number().min(0).optional(),
  unit: z.string().max(20).optional(),
  value_usd: z.number().min(0).optional(),
  invoice_hs: z.string().optional(),
  co_form: z.string().nullable().optional(),
});
export const HsCreateRequestSchema = z.object({ external_ref: z.string().max(100).optional(), import_date: z.string().optional(), items: z.array(HsCreateItemSchema).min(1).max(50) });
export const HsAnswerRequestSchema = z.object({
  question_id: z.string(),
  answers: z.array(z.object({ id: z.string(), selected: z.array(z.string()), custom: z.string().nullable() })).min(1),
});
export const HsAcceptedSchema = z.object({ accepted: z.literal(true) }).passthrough();
export const HsApiErrorBodySchema = z.object({ error: z.string(), code: z.string(), details: z.array(z.object({ field: z.string(), message: z.string() })).optional() });

/** Bảng `co_form` (§9). */
export const HS_CO_FORMS = ["D", "E", "AK", "AANZ", "AI", "AJ", "VJ", "VC", "VK", "EAV", "EUR.1", "EUR.1-UK", "CPTPP", "VI", "CEPA"] as const;

export type HsTax = z.infer<typeof HsTaxSchema>;
export type HsResult = z.infer<typeof HsResultSchema>;
export type HsPendingQuestion = z.infer<typeof HsPendingQuestionSchema>;
export type HsItemStatus = z.infer<typeof HsItemStatusSchema>;
export type HsJobItem = z.infer<typeof HsJobItemSchema>;
export type HsJob = z.infer<typeof HsJobSchema>;
export type HsCreateItem = z.infer<typeof HsCreateItemSchema>;
export type HsCreateRequest = z.infer<typeof HsCreateRequestSchema>;
export type HsAnswerRequest = z.infer<typeof HsAnswerRequestSchema>;
