import { describe, expect, it } from "vitest";
import { buildAnswers, emptyAnswerState, isAnswerComplete } from "./hs-answer";

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
});
