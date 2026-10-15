// Logic thuần của hộp "Trả lời AI" (câu hỏi của HSCodePro, tài liệu §6): mỗi câu con cần lựa chọn hoặc "Trả lời khác".
import type { HsAnswerInput, HsPendingQuestion } from "@kb/contracts";

export type AnswerState = Record<string, { selected: string[]; custom: string }>;

export const emptyAnswerState = (q: HsPendingQuestion): AnswerState => Object.fromEntries(q.questions.map((x) => [x.id, { selected: [], custom: "" }]));

export const isAnswerComplete = (q: HsPendingQuestion, s: AnswerState) =>
  q.questions.every((x) => (s[x.id]?.selected.length ?? 0) > 0 || (s[x.id]?.custom.trim() ?? "") !== "");

export const buildAnswers = (q: HsPendingQuestion, s: AnswerState): HsAnswerInput => ({
  questionId: q.id,
  answers: q.questions.map((x) => ({ id: x.id, selected: s[x.id]?.selected ?? [], custom: s[x.id]?.custom.trim() || null })),
});
