// Dạy khai báo: doanh nghiệp upload tờ khai đã thông quan → app so với tờ khai nháp dựng từ bộ chứng từ → bài học (chờ duyệt)
// → bài học đã duyệt điền vào tờ khai nháp các lô sau. Bài học chỉ thuộc doanh nghiệp đó.
import { z } from "zod";
import { IsoDateTimeSchema } from "../common.js";

/** Gặp từ chừng này lần trở lên, luôn cùng một giá trị → tự điền không cần kiểm; ít hơn → điền sẵn nhưng đánh dấu cần kiểm. */
export const LESSON_AUTO_FILL_AFTER = 3;

export const TeachSampleStatusSchema = z.enum(["UPLOADED", "READING", "READ", "FAILED"]);
export type TeachSampleStatus = z.infer<typeof TeachSampleStatusSchema>;

export const TeachSampleSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: TeachSampleStatusSchema,
  declarationNo: z.string().nullable(),
  /** Hồ sơ trong app có cùng lô (ghép theo số vận đơn / số hóa đơn); null = tờ khai cũ không có hồ sơ. */
  dossierId: z.string().nullable(),
  dossierCode: z.string().nullable(),
  matched: z.number().int().nonnegative().nullable(),
  total: z.number().int().nonnegative().nullable(),
  /** Số bài học rút ra từ tờ khai này. */
  lessons: z.number().int().nonnegative(),
  error: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type TeachSample = z.infer<typeof TeachSampleSchema>;

/** Ô khác nhau thuộc loại nào: DOCUMENT = có trên chứng từ (app lấy sai/chưa lấy → báo đội phát triển, sửa quy tắc/cách đọc); KNOWLEDGE = không có trên chứng từ (học theo ngữ cảnh). */
export const TeachDiffKindSchema = z.enum(["MATCH", "DOCUMENT", "KNOWLEDGE"]);
export type TeachDiffKind = z.infer<typeof TeachDiffKindSchema>;

export const TeachFieldDiffSchema = z.object({
  code: z.string(),
  label: z.string(),
  draft: z.string(),
  real: z.string(),
  kind: TeachDiffKindSchema,
  /** Chứng từ có ghi giá trị thật (loại DOCUMENT), vd ["CERT_OF_ORIGIN"]. */
  foundIn: z.array(z.string()),
});
export type TeachFieldDiff = z.infer<typeof TeachFieldDiffSchema>;

export const TeachLineDiffSchema = z.object({
  lineNo: z.number().int().positive(),
  draftHs: z.string(),
  realHs: z.string(),
  draftDescription: z.string(),
  realDescription: z.string(),
  draftImportRate: z.string(),
  realImportRate: z.string(),
  draftVatRate: z.string(),
  realVatRate: z.string(),
});
export type TeachLineDiff = z.infer<typeof TeachLineDiffSchema>;

export const TeachComparisonSchema = z.object({
  sample: TeachSampleSchema,
  fields: z.array(TeachFieldDiffSchema),
  lines: z.array(TeachLineDiffSchema),
});
export type TeachComparison = z.infer<typeof TeachComparisonSchema>;

/** FIELD = chỉ tiêu chung theo ngữ cảnh (kho, phương thức thanh toán, cảng…); CLAUSE = câu cố định trong chi tiết khai trị giá / ghi chú; LINE = mặt hàng (HS, mô tả tiếng Việt, thuế). */
export const LessonKindSchema = z.enum(["FIELD", "CLAUSE", "LINE"]);
export type LessonKind = z.infer<typeof LessonKindSchema>;
export const LessonStatusSchema = z.enum(["PENDING", "ACTIVE", "OFF"]);
export type LessonStatus = z.infer<typeof LessonStatusSchema>;

export const LessonContextSchema = z.object({
  supplier: z.string().optional(),
  carrier: z.string().optional(),
  mode: z.string().optional(),
  office: z.string().optional(),
  partNo: z.string().optional(),
});
export type LessonContext = z.infer<typeof LessonContextSchema>;

export const LessonLineValueSchema = z.object({
  hsCode: z.string().nullable(),
  description: z.string().nullable(),
  importRate: z.string().nullable(),
  importTaxSchedule: z.string().nullable(),
  vatRate: z.string().nullable(),
  vatExemptCode: z.string().nullable(),
});
export type LessonLineValue = z.infer<typeof LessonLineValueSchema>;

export const LessonSchema = z.object({
  id: z.string(),
  kind: LessonKindSchema,
  fieldCode: z.string(),
  label: z.string(),
  context: LessonContextSchema,
  /** Giá trị học được (FIELD/CLAUSE) hoặc mã HS (LINE). */
  value: z.string(),
  line: LessonLineValueSchema.nullable(),
  hits: z.number().int().nonnegative(),
  /** Các giá trị khác từng gặp trong cùng ngữ cảnh (mâu thuẫn). */
  conflicts: z.array(z.object({ value: z.string(), hits: z.number().int().positive() })),
  status: LessonStatusSchema,
  /** Đủ LESSON_AUTO_FILL_AFTER lần, không mâu thuẫn → tự điền không cần kiểm. */
  autoFill: z.boolean(),
  lastDeclarationNo: z.string().nullable(),
  updatedAt: IsoDateTimeSchema,
});
export type Lesson = z.infer<typeof LessonSchema>;

export const UpdateLessonInputSchema = z.object({
  status: LessonStatusSchema.optional(),
  value: z.string().trim().min(1).max(500).optional(),
}).refine((x) => x.status !== undefined || x.value !== undefined, { message: "Cần trạng thái hoặc giá trị mới" });
export type UpdateLessonInput = z.infer<typeof UpdateLessonInputSchema>;

export const TeachSettingsSchema = z.object({ enabled: z.boolean() });
export type TeachSettings = z.infer<typeof TeachSettingsSchema>;

export const TeachAccuracyPointSchema = z.object({ month: z.string(), matched: z.number().int(), total: z.number().int(), samples: z.number().int() });
export type TeachAccuracyPoint = z.infer<typeof TeachAccuracyPointSchema>;

export const TeachOverviewSchema = z.object({
  settings: TeachSettingsSchema,
  samples: z.array(TeachSampleSchema),
  lessons: z.array(LessonSchema),
  accuracy: z.array(TeachAccuracyPointSchema),
});
export type TeachOverview = z.infer<typeof TeachOverviewSchema>;

/** Bài học đã duyệt, đã lọc theo ngữ cảnh của một hồ sơ – module declaration áp vào tờ khai nháp và dòng hàng. */
export type DraftLessonValue = { lessonId: string; value: string; hits: number; autoFill: boolean; conflicts: string[]; declarationNo: string | null };
export type DraftLineLesson = DraftLessonValue & { key: string; line: LessonLineValue };
export type DraftLessons = {
  fields: Record<string, DraftLessonValue>;
  /** Câu cố định theo chỉ tiêu (CT_TG, GHI_CHU). */
  clauses: Record<string, DraftLessonValue[]>;
  lines: DraftLineLesson[];
};

const foldKey = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
/** Khóa mặt hàng của bài học dòng hàng: mã hàng (Part No) nếu có, không thì mô tả chuẩn hóa (60 ký tự đầu). */
export function lessonLineKey(partNo: string | null | undefined, description: string | null | undefined): string | null {
  if (partNo && foldKey(partNo)) return `P:${foldKey(partNo).replace(/ /g, "")}`;
  const d = description ? foldKey(description).slice(0, 60).trim() : "";
  return d ? `D:${d}` : null;
}
