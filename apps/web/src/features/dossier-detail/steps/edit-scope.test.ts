// editScopeOf: lô một tờ giống hệt declarationEditMode cũ; đang tải → chỉ đọc; sentChangeWarnings gom mã chỉ tiêu chung.
import { declarationEditMode, type CustomsStage } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { branch, submissionOf } from "@/test/branch-submission";
import { editScopeOf, LOCKED_SCOPE, sentChangeWarnings } from "./edit-scope";

describe("editScopeOf", () => {
  it("đang tải → chỉ đọc", () => {
    expect(editScopeOf("DRAFT", undefined, true)).toBe(LOCKED_SCOPE);
  });
  it("không có giai đoạn truyền (0 tờ) → như chưa khai", () => {
    expect(editScopeOf("DRAFT", undefined, false)).toMatchObject({ common: "FULL", lines: { 1: "FULL" } });
    expect(editScopeOf("DRAFT", { ...submissionOf([branch(1, 1, "NOT_SENT")]), branches: [] }, false).common).toBe("FULL");
  });
  it.each(["NOT_SENT", "RECALLED", "AMEND_RECALLED", "PRE_DECLARED", "DECLARED", "CLEARED", "REJECTED"] as CustomsStage[])("lô một tờ, giai đoạn %s: common = declarationEditMode cũ", (stage) => {
    for (const status of ["DRAFT", "APPROVED", "SUBMITTED"] as const) {
      const sc = editScopeOf(status, submissionOf([branch(1, 1, stage)]), false);
      expect(sc.common).toBe(declarationEditMode(status, stage));
      expect(sc.lines[1]).toBe(sc.common);
    }
  });
  it("lô nhiều tờ chỉ gọi về tờ 2 → chung khóa, lockedSheets 1,3", () => {
    const sc = editScopeOf("DRAFT", submissionOf([branch(1, 3, "PRE_DECLARED"), branch(2, 3, "RECALLED"), branch(3, 3, "PRE_DECLARED")]), false);
    expect(sc).toMatchObject({ common: "LOCKED", lockedSheets: [1, 3], addRemoveLines: false });
  });
});

describe("sentChangeWarnings", () => {
  it("TK_TP tách riêng, mã khác gom", () => {
    const s = submissionOf([branch(1, 2, "PRE_DECLARED", { sentChanges: { common: ["TK_TP", "TK_CN"], lines: false } }), branch(2, 2, "PRE_DECLARED", { sentChanges: { common: ["TK_CN"], lines: true } })]);
    expect(sentChangeWarnings(s)).toEqual({ totalValue: true, otherCommon: ["TK_CN"] });
    expect(sentChangeWarnings(undefined)).toEqual({ totalValue: false, otherCommon: [] });
  });
});
