// Chia dòng container của bản kê KVGS thành từng trang giấy A4 (spec KVGS §4: ~8 dòng/trang).
import { describe, expect, it } from "vitest";
import { KVGS_PAGE_LIMITS, paginateContainers, paginateWithNotes } from "./paginate";

const rows = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe("paginateContainers", () => {
  it("12 dòng → [8, 4]", () => {
    expect(paginateContainers(rows(12)).map((p) => p.length)).toEqual([8, 4]);
  });

  it("giữ thứ tự, không mất dòng", () => {
    expect(paginateContainers(rows(17)).flat()).toEqual(rows(17));
    expect(paginateContainers(rows(16)).map((p) => p.length)).toEqual([8, 8]);
  });

  it("trang đầu ít dòng hơn (phần đầu trang chiếm chỗ)", () => {
    expect(paginateContainers(rows(12), 8, 5).map((p) => p.length)).toEqual([5, 7]);
    expect(paginateContainers(rows(3), 8, 5).map((p) => p.length)).toEqual([3]);
  });

  it("không có dòng → vẫn một trang (bảng trống)", () => {
    expect(paginateContainers([])).toEqual([[]]);
  });
});

describe("paginateWithNotes – chừa chỗ cho Ghi chú ở trang cuối", () => {
  const split = (n: number) => paginateWithNotes(rows(n)).map((p) => `${p.rows.length}${p.notes ? "+notes" : ""}`);

  it("dùng giới hạn mặc định (một chỗ để chỉnh)", () => {
    expect(KVGS_PAGE_LIMITS).toEqual({ first: 5, middle: 8, firstWithNotes: 3, lastWithNotes: 6 });
  });

  it.each([
    [0, ["0+notes"]],
    [1, ["1+notes"]],
    [3, ["3+notes"]],
    [4, ["4", "0+notes"]],
    [5, ["5", "0+notes"]],
    [11, ["5", "6+notes"]],
    [12, ["5", "7", "0+notes"]],
    [13, ["5", "8", "0+notes"]],
    [21, ["5", "8", "8", "0+notes"]],
  ])("%i container → %j", (n, expected) => {
    expect(split(n)).toEqual(expected);
  });

  it("ghi chú đúng một lần, ở trang cuối; không mất dòng", () => {
    for (const n of [1, 4, 5, 12, 13, 21, 29]) {
      const pages = paginateWithNotes(rows(n));
      expect(pages.filter((p) => p.notes)).toHaveLength(1);
      expect(pages[pages.length - 1]!.notes).toBe(true);
      expect(pages.flatMap((p) => p.rows)).toEqual(rows(n));
    }
  });

  it("nhận giới hạn khác (chỉnh sau khi xem trước bản in)", () => {
    expect(paginateWithNotes(rows(6), { first: 6, middle: 10, firstWithNotes: 6, lastWithNotes: 9 }).map((p) => p.rows.length)).toEqual([6]);
  });
});
