import { describe, expect, it } from "vitest";
import { BRANCH_MAX_LINES, branchCount, branchRanges } from "./branches.js";

const seq = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("branchRanges", () => {
  it("BRANCH_MAX_LINES = 50", () => expect(BRANCH_MAX_LINES).toBe(50));

  it("không có dòng → 1 nhánh rỗng", () => {
    expect(branchRanges([])).toEqual([{ no: 1, of: 1, lineFrom: 0, lineTo: 0, index: [0, 0] }]);
  });

  it("50 dòng → 1 nhánh", () => {
    expect(branchRanges(seq(50))).toEqual([{ no: 1, of: 1, lineFrom: 1, lineTo: 50, index: [0, 50] }]);
  });

  it("51 dòng → 2 nhánh", () => {
    expect(branchRanges(seq(51))).toEqual([
      { no: 1, of: 2, lineFrom: 1, lineTo: 50, index: [0, 50] },
      { no: 2, of: 2, lineFrom: 51, lineTo: 51, index: [50, 51] },
    ]);
  });

  it("120 dòng → 3 nhánh, nhánh 3 là 101–120", () => {
    const r = branchRanges(seq(120));
    expect(r).toHaveLength(3);
    expect(r.every((b) => b.of === 3)).toBe(true);
    expect(r[2]).toMatchObject({ no: 3, lineFrom: 101, lineTo: 120, index: [100, 120] });
  });

  it("lineNo không liên tục → lineFrom/lineTo lấy từ lineNo thật", () => {
    const nos = [1, 2, 5, ...Array.from({ length: 48 }, (_, i) => 10 + i)]; // 51 dòng
    const r = branchRanges(nos);
    expect(r[0]).toMatchObject({ lineFrom: 1, lineTo: nos[49], index: [0, 50] });
    expect(r[1]).toMatchObject({ lineFrom: nos[50], lineTo: nos[50], index: [50, 51] });
  });

  it("sắp lineNo tăng dần, không đổi mảng gốc", () => {
    const nos = [3, 1, 2];
    expect(branchRanges(nos)[0]).toMatchObject({ lineFrom: 1, lineTo: 3 });
    expect(nos).toEqual([3, 1, 2]);
  });
});

describe("branchCount", () => {
  it("0 → 1; 50 → 1; 51 → 2; 101 → 3", () => {
    expect(branchCount(0)).toBe(1);
    expect(branchCount(50)).toBe(1);
    expect(branchCount(51)).toBe(2);
    expect(branchCount(101)).toBe(3);
  });
});
