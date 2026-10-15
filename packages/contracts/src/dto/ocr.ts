import { z } from "zod";
import { DocKindSchema, FieldStatusSchema, RuleResultSchema, RuleSeveritySchema } from "../common.js";

const pct = z.number().min(0).max(100);
/** Vùng trên trang chứng từ, tọa độ theo % trang (0–100) để tô khi rê chuột. */
export const RegionSchema = z.object({ page: z.number().int().positive(), x: pct, y: pct, w: pct, h: pct });
export type Region = z.infer<typeof RegionSchema>;

export const FieldGroupSchema = z.enum(["GENERAL", "PARTIES", "COMMERCIAL", "TRANSPORT", "ITEMS"]);
export type FieldGroup = z.infer<typeof FieldGroupSchema>;

export const ExtractedFieldSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  group: FieldGroupSchema,
  key: z.string(),
  label: z.string(),
  value: z.string(),
  /** Giá trị AI đọc ra lần đầu. */
  originalValue: z.string(),
  status: FieldStatusSchema,
  region: RegionSchema.optional(),
  /** Giải thích khi CONFLICT / MODEL_UNSURE. */
  note: z.string().optional(),
});
export type ExtractedField = z.infer<typeof ExtractedFieldSchema>;

export const CrossCheckSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  ruleCode: z.string(),
  title: z.string(),
  detail: z.string(),
  result: RuleResultSchema,
  severity: RuleSeveritySchema,
  documentKinds: z.array(DocKindSchema),
});
export type CrossCheck = z.infer<typeof CrossCheckSchema>;

/** Bảng đọc một chứng từ theo danh mục trường chuẩn (màn "Theo chứng từ", xuất Excel). */
export const DocumentSheetSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  kind: DocKindSchema,
  rows: z.array(z.object({ stt: z.number().int().positive(), key: z.string(), label: z.string(), value: z.string() })),
});
export type DocumentSheet = z.infer<typeof DocumentSheetSchema>;
