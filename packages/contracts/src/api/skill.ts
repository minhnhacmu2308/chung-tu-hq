import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";
import { SkillFieldSchema, SkillKindSchema } from "../dto/skill.js";

export const SkillFieldPatchSchema = SkillFieldSchema.pick({ label: true, required: true, aliases: true, declarationField: true, extract: true, display: true }).partial();
export type SkillFieldPatch = z.infer<typeof SkillFieldPatchSchema>;

export const AddSkillFieldInputSchema = SkillFieldSchema.extend({ key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Mã trường chỉ gồm chữ không dấu, số, dấu _ và bắt đầu bằng chữ"), label: z.string().trim().min(1, "Nhập tên hiển thị") });
export const SetSkillEnabledInputSchema = z.object({ enabled: z.boolean() });
export const SkillListQuerySchema = z.object({ kind: SkillKindSchema.optional() });

/** Mẫu chứng từ đã gắn nhãn – ví dụ cho AI và bộ đo "Đánh giá lại". */
export const LabeledSampleSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  pages: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  labeledBy: z.string(),
  labeledAt: IsoDateTimeSchema,
  status: z.enum(["LABELED", "PENDING"]),
});
export type LabeledSample = z.infer<typeof LabeledSampleSchema>;

export const LabelSampleInputSchema = z.object({ expected: z.record(z.string(), z.unknown()) });

export const EvaluationResultSchema = z.object({
  skillId: z.string(),
  version: z.number().int(),
  previousAccuracy: z.number().min(0).max(1).optional(),
  accuracy: z.number().min(0).max(1),
  samples: z.number().int().nonnegative(),
  fields: z.array(z.object({ key: z.string(), label: z.string(), accuracy: z.number().min(0).max(1), errors: z.number().int().nonnegative() })),
  finishedAt: IsoDateTimeSchema,
});
export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

export const MIN_SAMPLES_FOR_ACCURACY = 5;
