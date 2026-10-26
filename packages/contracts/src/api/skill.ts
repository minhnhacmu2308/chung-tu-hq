import { z } from "zod";
import { DocKindSchema, IsoDateTimeSchema } from "../common.js";
import { SkillFieldSchema, SkillKindSchema, SkillSchema } from "../dto/skill.js";

export const SkillFieldPatchSchema = SkillFieldSchema.pick({ label: true, required: true, aliases: true, declarationField: true, extract: true, display: true }).partial();
export type SkillFieldPatch = z.infer<typeof SkillFieldPatchSchema>;

export const AddSkillFieldInputSchema = SkillFieldSchema.extend({ key: z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]*$/, "Mã trường chỉ gồm chữ không dấu, số, dấu _ và bắt đầu bằng chữ"), label: z.string().trim().min(1, "Nhập tên hiển thị") });
export const SetSkillEnabledInputSchema = z.object({ enabled: z.boolean() });
export const SkillListQuerySchema = z.object({ kind: SkillKindSchema.optional() });

/** Mã skill: SK- + chữ in hoa/số, nhóm cách nhau bằng "-" (SK-INV-GEN, SK-CO-AK, SK-INV-2). */
export const SKILL_CODE_PATTERN = /^SK-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const DEFAULT_SKILL_LANGUAGE = "Đa ngôn ngữ";

/**
 * Doanh nghiệp tự tạo skill. Bỏ trống `code` → tự sinh từ loại chứng từ (SK-INV-2…).
 * `copyFromSkillId`: sao chép trường + ghi chú prompt từ skill của org hoặc skill mẫu đã phát hành; không có → trường chuẩn của danh mục.
 */
export const CreateSkillInputSchema = z
  .object({
    name: z.string().trim().min(2, "Tên skill tối thiểu 2 ký tự").max(120, "Tên skill tối đa 120 ký tự"),
    kind: SkillKindSchema,
    docKind: DocKindSchema,
    supplier: z.string().trim().max(120, "Tên nhà cung cấp tối đa 120 ký tự").nullish(),
    language: z.string().trim().max(60, "Ngôn ngữ tối đa 60 ký tự").optional(),
    code: z.string().trim().toUpperCase().max(44, "Mã skill tối đa 44 ký tự").regex(SKILL_CODE_PATTERN, "Mã skill dạng SK-XXX (chữ in hoa không dấu, số, dấu -)").nullish(),
    copyFromSkillId: z.string().trim().min(1).nullish(),
  })
  .superRefine((v, ctx) => {
    const supplier = v.supplier ?? "";
    if (v.kind === "SUPPLIER" && supplier.length < 2) ctx.addIssue({ code: "custom", path: ["supplier"], message: "Nhập tên nhà cung cấp (tối thiểu 2 ký tự)" });
    if (v.kind === "DOCUMENT" && supplier) ctx.addIssue({ code: "custom", path: ["supplier"], message: "Skill theo loại chứng từ không gắn nhà cung cấp" });
  })
  .transform((v) => ({
    name: v.name,
    kind: v.kind,
    docKind: v.docKind,
    supplier: v.kind === "SUPPLIER" ? (v.supplier ?? null) : null,
    language: v.language || DEFAULT_SKILL_LANGUAGE,
    code: v.code || null,
    copyFromSkillId: v.copyFromSkillId || null,
  }));
/** Dữ liệu gửi lên (trước khi chuẩn hóa). Bản đã chuẩn hóa parse lại vẫn ra chính nó (route parse ở biên, use case parse lại). */
export type CreateSkillInput = z.input<typeof CreateSkillInputSchema>;
/** Sau khi chuẩn hóa: supplier/code/copyFromSkillId null khi không có, language đã có mặc định. */
export type CreateSkillCommand = z.output<typeof CreateSkillInputSchema>;

/** Mẫu chứng từ đã gắn nhãn – ví dụ cho AI và bộ đo "Đánh giá lại". */
export const LabeledSampleSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  pages: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  labeledBy: z.string(),
  labeledAt: IsoDateTimeSchema,
  status: z.enum(["LABELED", "PENDING"]),
  /** UPLOAD = tải lên ở trang skill; REVIEW = tự học từ chứng từ người dùng đã kiểm tra/sửa ở bước OCR. */
  source: z.enum(["UPLOAD", "REVIEW"]).optional(),
  supplier: z.string().optional(),
});
export type LabeledSample = z.infer<typeof LabeledSampleSchema>;
/** Một mẫu kèm nhãn (giá trị đúng theo key trường skill). `expected` null khi AI chưa đọc xong mẫu. */
export const SampleLabelSchema = z.object({ sample: LabeledSampleSchema, expected: z.record(z.string(), z.unknown()).nullable() });
export type SampleLabel = z.infer<typeof SampleLabelSchema>;

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

// ---- Tự học từ bước kiểm tra OCR ----

/** Kết quả ghi nhớ sau khi người dùng xác nhận dữ liệu: bao nhiêu chứng từ thành mẫu, skill nào (tự tạo skill riêng cho nhà cung cấp). */
export const LearnSummarySchema = z.object({
  learned: z.number().int().nonnegative(),
  skills: z.array(z.object({ id: z.string(), name: z.string(), supplier: z.string().optional(), created: z.boolean() })),
});
export type LearnSummary = z.infer<typeof LearnSummarySchema>;

/** Gợi ý thêm nhãn in trên chứng từ cho một trường của skill – người dùng đồng ý mới áp vào. */
export const SkillSuggestionSchema = z.object({
  id: z.string(),
  skillId: z.string(),
  skillName: z.string(),
  fieldKey: z.string(),
  fieldLabel: z.string(),
  alias: z.string(),
  hits: z.number().int().positive(),
  supplier: z.string().optional(),
  createdAt: IsoDateTimeSchema,
});
export type SkillSuggestion = z.infer<typeof SkillSuggestionSchema>;

/** Người dùng chỉ/sửa giá trị trên file gốc: nhãn in cạnh giá trị đó (vd "Ref. Inv#"). */
export const SuggestAliasInputSchema = z.object({ fieldId: z.string().min(1), label: z.string().trim().min(2).max(80) });
export type SuggestAliasInput = z.infer<typeof SuggestAliasInputSchema>;

export const AcceptSuggestionResultSchema = z.object({ skill: SkillSchema, evaluationQueued: z.boolean() });
export type AcceptSuggestionResult = z.infer<typeof AcceptSuggestionResultSchema>;

/** Chứng từ trong hồ sơ còn ở bước kiểm tra đã đọc bằng cấu hình cũ của skill – có thể đọc lại bằng cấu hình mới. */
export const StaleReadsSchema = z.object({
  documents: z.array(z.object({ documentId: z.string(), dossierId: z.string(), dossierCode: z.string(), fileName: z.string() })),
  dossiers: z.number().int().nonnegative(),
});
export type StaleReads = z.infer<typeof StaleReadsSchema>;
