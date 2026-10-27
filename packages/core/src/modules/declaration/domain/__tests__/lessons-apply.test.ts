import { describe, expect, it } from "vitest";
import type { DraftLessons, DraftLineLesson } from "@kb/contracts";
import { applyLessons, harmonizeRates, learnedDescription, learnedLinePlan, lineLessonFor } from "../lessons-apply.js";
import type { EvaluatedValue } from "../mapping/evaluate.js";

const v = (value: string | null, extra: Partial<EvaluatedValue> = {}): EvaluatedValue => ({ value, source: "DOSSIER", provenance: { rule: "X", via: "default" }, ...extra });
const lesson = (value: string, hits: number, autoFill = hits >= 3) => ({ lessonId: "les_1", value, hits, autoFill, conflicts: [], declarationNo: "106794645160" });
const line: DraftLineLesson = {
  ...lesson("9405.11.99", 3), key: "P:2118564ACOT96",
  line: { hsCode: "9405.11.99", description: "Đèn down light âm trần, màu trắng", importRate: "0", importTaxSchedule: "B30", vatRate: "10", vatExemptCode: null },
};
const L: DraftLessons = {
  fields: { KHO: lesson("02DSEA0 – KHO FEDEX", 4), PT_TT: lesson("TTR", 1) },
  clauses: { CT_TG: [lesson("Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN", 3)] },
  lines: [line],
};

describe("áp bài học vào chỉ tiêu tờ khai", () => {
  it("ô trống → bài học (nguồn LESSON); đủ 3 lần không đánh dấu, ít hơn đánh dấu cần kiểm", () => {
    expect(applyLessons("KHO", v(null), L)).toMatchObject({ value: "02DSEA0 – KHO FEDEX", source: "LESSON", provenance: { via: "lesson", sourceId: "les_1" }, note: expect.stringMatching(/4 tờ khai.*106794645160/) });
    expect(applyLessons("KHO", v(null), L).suspect).toBeUndefined();
    expect(applyLessons("PT_TT", v(null), L)).toMatchObject({ value: "TTR", suspect: true, note: expect.stringMatching(/kiểm lại/) });
  });
  it("mặc định chung của doanh nghiệp thua bài học; chứng từ thắng bài học (lệch bài học chắc chắn → đánh dấu); cố định / sửa tay giữ nguyên", () => {
    expect(applyLessons("KHO", v("02CIRCI – CHUNG", { provenance: { rule: "KHO", via: "profile" } }), L).value).toBe("02DSEA0 – KHO FEDEX");
    const fromDoc = applyLessons("KHO", v("02B1A04 – KHO SCSC", { source: "ARRIVAL_NOTICE" }), L);
    expect(fromDoc).toMatchObject({ value: "02B1A04 – KHO SCSC", suspect: true, note: expect.stringMatching(/4 tờ khai trước khai “02DSEA0/) });
    expect(applyLessons("KHO", v("02DSEA0 – X", { source: "ARRIVAL_NOTICE" }), L).suspect).toBeUndefined();
    expect(applyLessons("KHO", v("ABC", { provenance: { rule: "KHO", via: "fixed" } }), L).value).toBe("ABC");
    expect(applyLessons("KHO", v("", { source: "USER" }), L).value).toBe("");
  });
  it("câu cố định nối sau ngày vận đơn của chi tiết khai trị giá, không lặp câu đã có", () => {
    expect(applyLessons("CT_TG", v("04122024#&"), L).value).toBe("04122024#&Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN");
    expect(applyLessons("CT_TG", v("04122024#&PHƯƠNG THỨC THANH TOÁN TT"), L).value).toBe("04122024#&PHƯƠNG THỨC THANH TOÁN TT; Hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN");
    const twice = applyLessons("CT_TG", v("04122024#&hàng nhập nằm ngoài phạm vi áp dụng QCVN 19:2019/BKHCN"), L);
    expect(twice.note).toBeUndefined();
    expect(applyLessons("KHO", v(null), undefined).value).toBeNull();
  });
});

describe("bài học mặt hàng", () => {
  const idle = { hsConfirmed: null, hsSuggested: null, hsStatus: "idle", hsDetail: null };
  it("tìm theo mã hàng, không có thì theo mô tả invoice", () => {
    expect(lineLessonFor(L, { partNo: "2118.564-ACOT-96", description: "x" })?.value).toBe("9405.11.99");
    expect(lineLessonFor(L, { partNo: null, description: "khác" })).toBeNull();
  });
  it("đủ số lần: mã + thuế suất học được, không gửi lại HSCodePro (learned), mô tả tiếng Việt; vẫn chờ người khai xác nhận", () => {
    const p = learnedLinePlan(idle, line);
    expect(p?.patch).toMatchObject({ hsSuggested: "9405.11.99", hsStatus: "completed", hsDetail: { learned: { lessonId: "les_1", hits: 3 } } });
    expect(p?.patch).not.toHaveProperty("hsConfirmed");
    expect(p?.suggestion).toMatchObject({ code: "9405.11.99", rates: { importRate: "0", vatRate: "10" } });
    expect(learnedDescription(line)).toBe("Đèn down light âm trần, màu trắng");
    expect(learnedLinePlan({ ...idle, hsConfirmed: "9405.11.99" }, line)).toBeNull();
  });
  it("ít lần: chỉ gợi ý mã, vẫn gửi HSCodePro; HSCodePro ra mã khác bài học chắc chắn → cảnh báo", () => {
    const few = { ...line, hits: 1, autoFill: false };
    expect(learnedLinePlan(idle, few)).toMatchObject({ patch: { hsSuggested: "9405.11.99", hsConfidence: 0.5 }, suggestion: null });
    expect(learnedDescription(few)).toBeNull();
    const done = { ...idle, hsStatus: "completed", hsSuggested: "9405.99.50", hsDetail: { reasoning: "r", legalBasis: [], warnings: [] } };
    expect(learnedLinePlan(done, line)?.patch.hsDetail?.warnings[0]).toMatch(/khai mã 9405.11.99 – HSCodePro gợi ý 9405.99.50/);
  });
  it("thuế suất khi xác nhận: theo bài học (HSCodePro trả 30% MFN như dòng 7 lô 770471184612) → 0%", () => {
    const r = harmonizeRates("9405.11.99", { importDutyRate: "30", vatRate: null, policyNote: null }, line, [], "CN", true);
    expect(r).toMatchObject({ importDutyRate: "0", vatRate: "10", policyNote: expect.stringMatching(/HSCodePro\/biểu thuế trả NK 30/) });
  });
  it("không có bài học: dòng cùng mã, cùng xuất xứ đã có thuế suất → dùng chung (trống, hoặc cao hơn khi có C/O)", () => {
    const sib = [{ lineNo: 1, hsConfirmed: "9405.11.99", origin: "CN", importDutyRate: "0", vatRate: "10" }];
    expect(harmonizeRates("9405.11.99", { importDutyRate: null, vatRate: null, policyNote: null }, null, sib, "CN", true)).toMatchObject({ importDutyRate: "0", vatRate: "10", policyNote: expect.stringMatching(/dòng 1.*không trả thuế suất/) });
    expect(harmonizeRates("9405.11.99", { importDutyRate: "30", vatRate: "10", policyNote: null }, null, sib, "CN", true).importDutyRate).toBe("0");
    expect(harmonizeRates("9405.11.99", { importDutyRate: "30", vatRate: "10", policyNote: null }, null, sib, "CN", false).importDutyRate).toBe("30");
    expect(harmonizeRates("9405.11.99", { importDutyRate: "30", vatRate: "10", policyNote: null }, null, sib, "KR", true).importDutyRate).toBe("30");
  });
});
