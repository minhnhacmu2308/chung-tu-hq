import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema, ValueSourceSchema } from "../common.js";

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
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const DeclarationSectionSchema = z.enum(["GENERAL", "PARTIES", "TRANSPORT", "VALUE"]);
export type DeclarationSection = z.infer<typeof DeclarationSectionSchema>;

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
});
export type DeclarationField = z.infer<typeof DeclarationFieldSchema>;

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
