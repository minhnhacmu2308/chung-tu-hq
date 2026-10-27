import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, ValueSourceSchema, type Role } from "../common.js";
import { HsItemErrorSchema, HsPendingQuestionSchema } from "../integrations/hscodepro.js";

export const LineItemSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  lineNo: z.number().int().positive(),
  description: z.string(),
  quantity: DecimalStringSchema,
  unit: z.string(),
  unitPrice: DecimalStringSchema,
  amount: DecimalStringSchema,
  /** Mã nước ISO-2. */
  origin: z.string(),
  /** Mã trên invoice nước ngoài – chỉ tham khảo 6 số. */
  invoiceHsCode: z.string().optional(),
  hsSuggested: z.string().optional(),
  hsConfidence: z.number().min(0).max(1).optional(),
  hsConfirmed: z.string().optional(),
  importDutyRate: DecimalStringSchema.optional(),
  vatRate: DecimalStringSchema.optional(),
  policyNote: z.string().optional(),
  /** Mã VAT VNACCS của thuế đã áp (VB901, VB245, VKxxx = không chịu thuế) – điền chỉ tiêu mã áp dụng thuế suất GTGT khi truyền. */
  vatCode: z.string().optional(),
  /** Căn cứ/điều kiện VAT (HSCodePro); `vatCertain` false = VAT phụ thuộc điều kiện ngoài mã HS, người khai tự xét. */
  vatNote: z.string().optional(),
  vatCertain: z.boolean().optional(),
  /** Thuế của mã đã xác nhận chưa khớp kết quả phân loại mới nhất (mã không còn trong gợi ý, mã nhập tay chưa có thuế…) – cần kiểm tra lại. */
  taxNeedsReview: z.boolean().optional(),
  /** Phân loại HS (HSCodePro): trạng thái dòng, câu hỏi chờ trả lời, gợi ý + mã thay thế kèm thuế. */
  hs: z.lazy(() => LineItemHsSchema).optional(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

/** idle: chưa gửi · skipped: không gửi được (thiếu xuất xứ/mô tả) · answering: đã trả lời, đang gửi. Còn lại theo HSCodePro. */
export const LineItemHsStatusSchema = z.enum(["idle", "skipped", "queued", "processing", "need_info", "answering", "completed", "failed", "cancelled"]);
export type LineItemHsStatus = z.infer<typeof LineItemHsStatusSchema>;
export const HsCandidateSchema = z.object({
  code: z.string(), description: z.string(), confidence: z.number().min(0).max(1), whyNot: z.string().nullable(),
  importRate: DecimalStringSchema.nullable(), basis: z.enum(["MFN", "FTA"]).nullable(), agreement: z.string().nullable(), vatRate: DecimalStringSchema.nullable(),
  /** Mã VAT VNACCS (VB901, VB245, VKxxx…), căn cứ/điều kiện VAT, VAT chắc chắn theo mã HS hay không, thuế NK thông thường – vắng khi API cũ. */
  vatCode: z.string().nullable().optional(), vatNote: z.string().nullable().optional(), vatCertain: z.boolean().nullable().optional(), normalImportRate: DecimalStringSchema.nullable().optional(),
});
export type HsCandidate = z.infer<typeof HsCandidateSchema>;
export const LineItemHsSchema = z.object({
  status: LineItemHsStatusSchema,
  question: HsPendingQuestionSchema.nullable(),
  error: HsItemErrorSchema.nullable(),
  reasoning: z.string().nullable(),
  legalBasis: z.array(z.string()),
  warnings: z.array(z.string()),
  /** Gợi ý chính đứng đầu, sau đó các mã thay thế. */
  candidates: z.array(HsCandidateSchema),
  /** Mô tả hàng tiếng Việt AI gợi ý (vắng khi API cũ). */
  descriptionVi: z.string().nullable().optional(),
});
export type LineItemHs = z.infer<typeof LineItemHsSchema>;

export const DeclarationSectionSchema = z.enum(["GENERAL", "PARTIES", "TRANSPORT", "VALUE"]);
export type DeclarationSection = z.infer<typeof DeclarationSectionSchema>;

export const FieldProvenanceSchema = z.object({ rule: z.string(), via: z.enum(["default", "source", "fixed", "profile", "lesson"]), sourceId: z.string().optional() });
export type FieldProvenance = z.infer<typeof FieldProvenanceSchema>;

export const DeclarationFieldSchema = z.object({
  /** Khóa ổn định của chỉ tiêu (mnemonic, ví dụ TONG_TG) – dùng cho FE và API sửa. */
  code: z.string(),
  /** Số chỉ tiêu theo Phụ lục II TT39/121 (ví dụ "1.43"). */
  no: z.string().optional(),
  label: z.string(),
  value: z.string(),
  source: ValueSourceSchema,
  section: DeclarationSectionSchema,
  suspect: z.boolean().optional(),
  /** Lý do nghi ngờ / ghi chú cho người duyệt. */
  note: z.string().optional(),
  /** Nguồn gốc giá trị: quy tắc mặc định / Mặc định khai báo / giá trị cố định / nguồn doanh nghiệp chọn (Cài đặt → Khai báo). */
  provenance: FieldProvenanceSchema.optional(),
  /** Chỉ tiêu theo tình huống: lý do chỉ tiêu xuất hiện trên tờ khai này (ví dụ "Loại hình tạm nhập (G11–G14)"). */
  condition: z.string().optional(),
});
export type DeclarationField = z.infer<typeof DeclarationFieldSchema>;

/**
 * Chỉ tiêu không sửa tay trên tờ khai:
 * - SOTK: Hải quan cấp sau khi truyền; MA_LH: loại hình của hồ sơ (quyết định cả cách tính thuế) – đổi ở hồ sơ.
 * - Còn lại là đầu vào của trị giá tính thuế (hóa đơn, hóa đơn cước, tỷ giá): sửa ở bước đọc chứng từ rồi dựng lại, nếu không số trên tờ khai lệch với thuế.
 */
export const DERIVED_DECLARATION_FIELD_CODES: readonly string[] = ["SOTK", "MA_LH", "DK_GIA", "MA_TT", "TONG_TG", "TY_GIA", "PHI_VC", "PHI_BH", "KHOAN_DC"];
export const isDeclarationFieldEditable = (code: string) => !DERIVED_DECLARATION_FIELD_CODES.includes(code);
/** Vai trò được sửa chỉ tiêu và mở lại tờ khai (VIEWER chỉ xem). Backend chặn bằng requireRole; FE dùng để ẩn nút. */
export const canEditDeclaration = (role: Role) => role !== "VIEWER";

export const DeclarationStatusSchema = z.enum(["NOT_CREATED", "DRAFT", "APPROVED", "SUBMITTED"]);
export type DeclarationStatus = z.infer<typeof DeclarationStatusSchema>;

export const ValueAdjustmentSchema = z.object({ label: z.string(), amount: DecimalStringSchema, currency: z.string(), source: ValueSourceSchema });
export type ValueAdjustment = z.infer<typeof ValueAdjustmentSchema>;

export const DeclarationSchema = z.object({
  dossierId: z.string(),
  kind: z.enum(["IDA", "EDA"]),
  status: DeclarationStatusSchema,
  fields: z.array(DeclarationFieldSchema),
  /** VND / ngoại tệ, theo ngày. */
  exchangeRate: DecimalStringSchema,
  exchangeRateDate: IsoDateSchema,
  customsValueVnd: DecimalStringSchema,
  valueAdjustments: z.array(ValueAdjustmentSchema),
  estimatedImportDutyVnd: DecimalStringSchema,
  estimatedVatVnd: DecimalStringSchema,
  approvedBy: z.string().optional(),
  approvedAt: IsoDateTimeSchema.optional(),
});
export type Declaration = z.infer<typeof DeclarationSchema>;

export const AgentTaskIdSchema = z.enum(["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"]);
export type AgentTaskId = z.infer<typeof AgentTaskIdSchema>;
export const AgentTaskStatusSchema = z.enum(["PENDING", "RUNNING", "DONE", "ERROR", "SKIPPED"]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;
export const AgentModeSchema = z.enum(["DECLARATION", "DIGITIZE", "BOTH"]);
export type AgentMode = z.infer<typeof AgentModeSchema>;
export const AgentRunSchema = z.object({
  dossierId: z.string(),
  mode: AgentModeSchema,
  startedAt: IsoDateTimeSchema,
  tasks: z.array(z.object({ id: AgentTaskIdSchema, status: AgentTaskStatusSchema, progress: z.number().min(0).max(100), message: z.string() })),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;
