import { describe, expect, it } from "vitest";
import { identicalLineGroups, lineMergeKey } from "./line-merge.js";

const l = (lineNo: number, description: string | null, unitPrice: string | null, origin = "ID", unit = "KGM", hs: string | null = null) => ({ lineNo, description, unit, unitPrice, origin, hs });

describe("line-merge", () => {
  it("nhóm dòng cùng tên (không phân biệt hoa thường, khoảng trắng), ĐVT, đơn giá (1.50 = 1.5), xuất xứ, HS; khác một thứ → không gộp", () => {
    expect(identicalLineGroups([
      l(1, "Frozen fish", "2.50"), l(2, "Squid", "3"), l(3, " FROZEN   fish ", "2.5"), l(4, "Squid", "3", "VN"), l(5, "Squid", "3.00"),
      l(6, "Shrimp", "4", "ID", "KGM", "0306.17.00"), l(7, "Shrimp", "4", "ID", "KGM", "03061700"), l(8, "Shrimp", "4", "ID", "KGM", "0306.16"),
    ])).toEqual([[1, 3], [2, 5], [6, 7]]);
  });
  it("thiếu tên hàng hoặc đơn giá → không gộp", () => {
    expect(lineMergeKey(l(1, "", "1"))).toBeNull();
    expect(lineMergeKey(l(1, "Fish", null))).toBeNull();
    expect(identicalLineGroups([l(1, "Fish", null), l(2, "Fish", null)])).toEqual([]);
  });
});
