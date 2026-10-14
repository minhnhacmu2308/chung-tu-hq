import { z } from "zod";
import { DocKindSchema, IsoDateTimeSchema } from "../common.js";

export const SkillKindSchema = z.enum(["DOCUMENT", "SUPPLIER", "MAPPING"]);
export type SkillKind = z.infer<typeof SkillKindSchema>;

export const SkillFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(["string", "decimal", "date", "code", "party", "items"]),
  required: z.boolean(),
  /** Nhãn có thể gặp trên chứng từ. */
  aliases: z.array(z.string()),
  /** Ánh xạ chỉ tiêu tờ khai. */
  declarationField: z.string().optional(),
  extract: z.boolean(),
  display: z.boolean(),
});
export type SkillField = z.infer<typeof SkillFieldSchema>;

export const SkillSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  kind: SkillKindSchema,
  docKind: DocKindSchema.optional(),
  supplier: z.string().optional(),
  language: z.string(),
  version: z.number().int().nonnegative(),
  /** Độ chính xác đo trên mẫu đã gắn nhãn (0–1). Không có khi chưa đủ mẫu. */
  accuracy: z.number().min(0).max(1).optional(),
  labeledSamples: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
  enabled: z.boolean(),
  fields: z.array(SkillFieldSchema),
});
export type Skill = z.infer<typeof SkillSchema>;
