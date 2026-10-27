import { describe, expect, it } from "vitest";
import type { LineItem } from "@kb/contracts";
import { answersFor, buildAnswers, emptyAnswerState, isAnswerComplete, questionKey, sameQuestionItems } from "./hs-answer";

const Q = { id: "q1", questions: [
  { id: "use", question: "Dùng cho máy nào?", options: [{ label: "CNC" }, { label: "Máy in 3D" }], multiSelect: false },
  { id: "mat", question: "Vật liệu?", options: [{ label: "Thép" }, { label: "Nhôm" }], multiSelect: true },
  { id: "free", question: "Kích thước?" },
] };

describe("hs-answer", () => {
  it("trạng thái rỗng → chưa đủ; mỗi câu có lựa chọn hoặc trả lời khác → đủ", () => {
    let s = emptyAnswerState(Q);
    expect(isAnswerComplete(Q, s)).toBe(false);
    s = { ...s, use: { selected: ["CNC"], custom: "" }, mat: { selected: [], custom: "Inox 304" } };
    expect(isAnswerComplete(Q, s)).toBe(false);
    s = { ...s, free: { selected: [], custom: "  " } };
    expect(isAnswerComplete(Q, s)).toBe(false); // khoảng trắng không tính
    s = { ...s, free: { selected: [], custom: "500 mm" } };
    expect(isAnswerComplete(Q, s)).toBe(true);
  });
  it("buildAnswers: đúng thứ tự câu hỏi, custom rỗng → null, đã trim", () => {
    const s = { use: { selected: ["CNC"], custom: "" }, mat: { selected: ["Thép", "Nhôm"], custom: " phủ kẽm " }, free: { selected: [], custom: "500 mm" } };
    expect(buildAnswers(Q, s)).toEqual({ questionId: "q1", answers: [
      { id: "use", selected: ["CNC"], custom: null },
      { id: "mat", selected: ["Thép", "Nhôm"], custom: "phủ kẽm" },
      { id: "free", selected: [], custom: "500 mm" },
    ] });
  });

  it("hàng giống nhau: dòng khác cùng câu hỏi (khác mã câu hỏi) được gom; khác câu / đã xác nhận / không chờ thì không", () => {
    const Q2 = { ...Q, id: "q2", questions: Q.questions.map((x) => ({ ...x, id: `${x.id}-2`, question: ` ${x.question.toUpperCase()} ` })) };
    const other = { id: "q3", questions: [{ id: "x", question: "Màu gì?" }] };
    const row = (id: string, question: typeof Q | null, extra: Partial<LineItem> = {}) =>
      ({ id, lineNo: 1, hs: { status: question ? "need_info" : "completed", question, error: null, reasoning: null, legalBasis: [], warnings: [], candidates: [] }, ...extra }) as LineItem;
    const a = row("a", Q), b = row("b", Q2), c = row("c", other), d = row("d", Q2, { hsConfirmed: "9405.11.91" }), e = row("e", null);
    expect(questionKey(Q)).toBe(questionKey(Q2));
    expect(sameQuestionItems(a, [a, b, c, d, e]).map((x) => x.id)).toEqual(["b"]);
    expect(sameQuestionItems(e, [a, b])).toEqual([]);
  });

  it("answersFor: giữ lựa chọn, đổi sang mã câu hỏi của dòng kia", () => {
    const Q2 = { ...Q, id: "q2", questions: Q.questions.map((x) => ({ ...x, id: `${x.id}-2` })) };
    const s = { use: { selected: ["CNC"], custom: "" }, mat: { selected: ["Thép"], custom: "" }, free: { selected: [], custom: " 500 mm " } };
    expect(answersFor(Q2, Q, s)).toEqual({ questionId: "q2", answers: [
      { id: "use-2", selected: ["CNC"], custom: null },
      { id: "mat-2", selected: ["Thép"], custom: null },
      { id: "free-2", selected: [], custom: "500 mm" },
    ] });
  });
});
