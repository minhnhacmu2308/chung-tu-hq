// Logic thuần của hộp "Trả lời AI" (câu hỏi của HSCodePro, tài liệu §6): mỗi câu con cần lựa chọn hoặc "Trả lời khác".
import type { HsAnswerInput, HsPendingQuestion, LineItem } from "@kb/contracts";

export type AnswerState = Record<string, { selected: string[]; custom: string }>;

export const emptyAnswerState = (q: HsPendingQuestion): AnswerState => Object.fromEntries(q.questions.map((x) => [x.id, { selected: [], custom: "" }]));

export const isAnswerComplete = (q: HsPendingQuestion, s: AnswerState) =>
  q.questions.every((x) => (s[x.id]?.selected.length ?? 0) > 0 || (s[x.id]?.custom.trim() ?? "") !== "");

export const buildAnswers = (q: HsPendingQuestion, s: AnswerState): HsAnswerInput => ({
  questionId: q.id,
  answers: q.questions.map((x) => ({ id: x.id, selected: s[x.id]?.selected ?? [], custom: s[x.id]?.custom.trim() || null })),
});

const norm = (v: string | null | undefined) => (v ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/** Dấu nhận biết câu hỏi: cùng tiêu đề, câu hỏi và lựa chọn (không tính mã câu hỏi – mỗi dòng một mã riêng). */
export const questionKey = (q: HsPendingQuestion) =>
  q.questions.map((x) => [norm(x.header), norm(x.question), x.multiSelect ? "m" : "s", ...(x.options ?? []).map((o) => norm(o.label))].join("|")).join("||");

/** Các dòng KHÁC đang chờ trả lời đúng câu hỏi này (hàng giống nhau) – trả lời một lần áp cho tất cả. */
export function sameQuestionItems(item: LineItem, items: readonly LineItem[]): LineItem[] {
  const q = item.hs?.question;
  if (!q) return [];
  const key = questionKey(q);
  return items.filter((o) => o.id !== item.id && !o.hsConfirmed && o.hs?.status === "need_info" && o.hs.question && questionKey(o.hs.question) === key);
}

/** Câu trả lời cho dòng khác cùng câu hỏi: giữ lựa chọn theo thứ tự câu con, đổi sang mã câu hỏi của dòng đó. */
export function answersFor(target: HsPendingQuestion, source: HsPendingQuestion, s: AnswerState): HsAnswerInput {
  const built = buildAnswers(source, s);
  return { questionId: target.id, answers: target.questions.map((x, i) => ({ ...built.answers[i]!, id: x.id })) };
}
