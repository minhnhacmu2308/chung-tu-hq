// Áp bài học (mục Dạy khai báo) vào tờ khai nháp – thuần. Thứ tự: chứng từ của lô > bài học > mặc định chung.
// Bài học gặp đủ số lần (autoFill) → điền không đánh dấu; ít hơn → điền sẵn nhưng đánh dấu cần kiểm. Ghi đè cố định của doanh nghiệp không bị đổi.
import { LESSON_AUTO_FILL_AFTER, lessonLineKey, type DraftLessons, type DraftLessonValue, type DraftLineLesson } from "@kb/contracts";
import type { EvaluatedValue } from "./mapping/evaluate.js";

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toUpperCase();
const words = (s: string) => fold(s).replace(/[^A-Z0-9]+/g, " ").trim();
const codePart = (s: string) => words(s.split(/\s+[–-]\s+/)[0] ?? "").split(" ")[0] ?? "";

const learnedNote = (l: DraftLessonValue) =>
  `Học từ ${l.hits} tờ khai đã thông quan${l.declarationNo ? ` (gần nhất TK ${l.declarationNo})` : ""}${l.autoFill ? "" : " – chưa đủ số lần, kiểm lại"}${l.conflicts.length ? `; từng khai khác: ${l.conflicts.join(", ")}` : ""}`;

/** Chỉ tiêu chung (kho, cảng, phương thức thanh toán…): trống / chỉ có mặc định chung → lấy bài học; chứng từ ghi khác bài học chắc chắn → giữ chứng từ, đánh dấu. */
export function applyFieldLesson(code: string, v: EvaluatedValue, lessons: DraftLessons | undefined): EvaluatedValue {
  const l = lessons?.fields[code];
  if (!l || v.provenance.via === "fixed" || v.source === "USER") return v;
  const weak = !v.value || v.provenance.via === "profile" || v.source === "DEFAULT";
  if (weak) {
    return { value: l.value, source: "LESSON", note: learnedNote(l), ...(l.autoFill ? {} : { suspect: true }), provenance: { rule: code, via: "lesson", sourceId: l.lessonId } };
  }
  if (l.autoFill && codePart(v.value!) !== codePart(l.value)) {
    return { ...v, suspect: true, note: [v.note, `${l.hits} tờ khai trước khai “${l.value}” – kiểm lại`].filter(Boolean).join(". ") };
  }
  return v;
}

/** Câu cố định (chi tiết khai trị giá, ghi chú): nối các câu học được còn thiếu vào sau giá trị quy tắc dựng. */
export function applyClauseLessons(code: string, v: EvaluatedValue, lessons: DraftLessons | undefined): EvaluatedValue {
  const cs = lessons?.clauses[code];
  if (!cs?.length || v.provenance.via === "fixed" || v.source === "USER") return v;
  const base = v.value ?? "";
  const have = words(base);
  const add = cs.filter((c) => !have.includes(words(c.value)));
  if (!add.length) return v;
  const joined = add.map((c) => c.value).join("; ");
  const value = !base ? joined : /#&$/.test(base) ? `${base}${joined}` : `${base}; ${joined}`;
  const unsure = add.some((c) => !c.autoFill);
  const note = [v.note, `Câu cố định học từ tờ khai trước: ${add.map((c) => `“${c.value.slice(0, 40)}${c.value.length > 40 ? "…" : ""}” (${c.hits} lần)`).join("; ")}${unsure ? " – kiểm lại" : ""}`].filter(Boolean).join(". ");
  return { ...v, value, note, ...(unsure ? { suspect: true } : {}) };
}

export function applyLessons(code: string, v: EvaluatedValue, lessons: DraftLessons | undefined): EvaluatedValue {
  return applyClauseLessons(code, applyFieldLesson(code, v, lessons), lessons);
}

// ---------------------------------------------------------------- dòng hàng

/** Bài học mặt hàng cho một dòng: theo mã hàng (Part No) trước, không có thì theo mô tả invoice. */
export function lineLessonFor(lessons: DraftLessons | null | undefined, item: { partNo: string | null; description: string | null }): DraftLineLesson | null {
  if (!lessons?.lines.length) return null;
  const keys = [lessonLineKey(item.partNo, null), lessonLineKey(null, item.description)].filter((k): k is string => !!k);
  for (const k of keys) {
    const hit = lessons.lines.find((l) => l.key === k);
    if (hit) return hit;
  }
  return null;
}

type LineState = { hsConfirmed: string | null; hsSuggested: string | null; hsStatus: string; hsDetail: { reasoning: string; legalBasis: string[]; warnings: string[]; learned?: { lessonId: string; hits: number } } | null };
export type LearnedLinePlan = {
  patch: { hsSuggested?: string; hsConfidence?: number; hsStatus?: "completed"; hsQuestion?: null; hsError?: null; hsDetail?: LineState["hsDetail"] };
  /** Ứng viên HS kèm thuế suất học được – thay danh sách gợi ý (chỉ khi bài học đủ số lần). */
  suggestion: { code: string; description: string; rates: { importRate: string | null; basis: null; agreement: null; vatRate: string | null } } | null;
} | null;

const IDLE = new Set(["idle", "failed", "skipped", "cancelled"]);
const hsDigits = (s: string | null) => (s ?? "").replace(/\D/g, "");

/**
 * Bài học mặt hàng → thay đổi trên dòng (chưa xác nhận HS; mã HS vẫn phải người khai bấm xác nhận – bất biến 7):
 * đủ số lần → mã HS + thuế suất học được, coi như đã có kết quả phân loại (không gửi HSCodePro lại); ít hơn → chỉ gợi ý mã, vẫn gửi HSCodePro.
 * Dòng HSCodePro đã phân loại ra mã khác bài học chắc chắn → giữ kết quả HSCodePro, thêm cảnh báo.
 */
export function learnedLinePlan(row: LineState, l: DraftLineLesson | null): LearnedLinePlan {
  if (!l || row.hsConfirmed) return null;
  const why = `Theo ${l.hits} tờ khai đã thông quan trước${l.declarationNo ? ` (gần nhất TK ${l.declarationNo})` : ""}`;
  const fresh = IDLE.has(row.hsStatus) || !!row.hsDetail?.learned;
  if (fresh && l.autoFill) {
    return {
      patch: { hsSuggested: l.value, hsConfidence: 1, hsStatus: "completed", hsQuestion: null, hsError: null, hsDetail: { reasoning: `${why}: mã ${l.value}, mô tả và thuế suất đã khai.`, legalBasis: [], warnings: [], learned: { lessonId: l.lessonId, hits: l.hits } } },
      suggestion: { code: l.value, description: l.line.description ?? "", rates: { importRate: l.line.importRate, basis: null, agreement: null, vatRate: l.line.vatRate } },
    };
  }
  if (fresh) {
    if (row.hsSuggested) return null;
    return { patch: { hsSuggested: l.value, hsConfidence: 0.5, hsDetail: { reasoning: "", legalBasis: [], warnings: [`Gợi ý ${l.value} – ${why.toLowerCase()}, ${l.hits < LESSON_AUTO_FILL_AFTER ? `mới gặp ${l.hits}/${LESSON_AUTO_FILL_AFTER} lần` : "còn mâu thuẫn"} – kiểm lại`] } }, suggestion: null };
  }
  if (l.autoFill && row.hsSuggested && hsDigits(row.hsSuggested) !== hsDigits(l.value)) {
    const warn = `${why} khai mã ${l.value} – HSCodePro gợi ý ${row.hsSuggested}, kiểm lại trước khi xác nhận`;
    const d = row.hsDetail ?? { reasoning: "", legalBasis: [], warnings: [] };
    return d.warnings.includes(warn) ? null : { patch: { hsDetail: { ...d, warnings: [...d.warnings, warn] } }, suggestion: null };
  }
  return null;
}

/** Mô tả khai báo tiếng Việt học được (chỉ khi bài học đủ số lần) – thay mô tả tiếng Anh trên invoice. */
export const learnedDescription = (l: DraftLineLesson | null) => (l?.autoFill && l.line.description ? l.line.description : null);

/**
 * Thuế suất khi xác nhận HS: mã trùng bài học đủ số lần → dùng thuế suất đã khai trước (HSCodePro trả trống/khác thì ghi chú);
 * không có bài học → dòng khác cùng mã, cùng hồ sơ đã có thuế suất (cùng xuất xứ, cùng C/O) mà dòng này trống/cao hơn → dùng chung.
 */
export function harmonizeRates(
  code: string, rates: { importDutyRate: string | null; vatRate: string | null; policyNote: string | null }, l: DraftLineLesson | null,
  siblings: { lineNo: number; hsConfirmed: string | null; origin: string; importDutyRate: string | null; vatRate: string | null }[], origin: string, hasCo: boolean,
): { importDutyRate: string | null; vatRate: string | null; policyNote: string | null } {
  if (l?.autoFill && hsDigits(l.value) === hsDigits(code) && (l.line.importRate !== null || l.line.vatRate !== null)) {
    const imp = l.line.importRate ?? rates.importDutyRate;
    const vat = l.line.vatRate ?? rates.vatRate;
    const changed = imp !== rates.importDutyRate || vat !== rates.vatRate;
    const note = `Thuế suất theo ${l.hits} tờ khai đã thông quan trước${l.declarationNo ? ` (gần nhất TK ${l.declarationNo})` : ""}: NK ${imp ?? "?"}%, GTGT ${vat ?? "?"}%${changed ? ` – HSCodePro/biểu thuế trả NK ${rates.importDutyRate ?? "trống"}, GTGT ${rates.vatRate ?? "trống"}` : ""}`;
    return { importDutyRate: imp, vatRate: vat, policyNote: [note, rates.policyNote].filter(Boolean).join(". ") };
  }
  const same = siblings.filter((s) => s.hsConfirmed && hsDigits(s.hsConfirmed) === hsDigits(code) && s.origin === origin && s.importDutyRate !== null);
  if (!same.length) return rates;
  const best = same.reduce((a, s) => (Number(s.importDutyRate) < Number(a.importDutyRate) ? s : a), same[0]!);
  const lower = rates.importDutyRate === null || (hasCo && Number(best.importDutyRate) < Number(rates.importDutyRate));
  if (!lower) return rates;
  return {
    importDutyRate: best.importDutyRate, vatRate: rates.vatRate ?? best.vatRate,
    policyNote: [`Cùng mã ${code}, cùng xuất xứ với dòng ${best.lineNo} – dùng chung thuế suất NK ${best.importDutyRate}%${rates.importDutyRate !== null ? ` (HSCodePro trả ${rates.importDutyRate}% cho dòng này)` : " (HSCodePro không trả thuế suất cho dòng này)"}`, rates.policyNote].filter(Boolean).join(". "),
  };
}
