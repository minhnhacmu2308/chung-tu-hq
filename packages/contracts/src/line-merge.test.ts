import { describe, expect, it } from "vitest";
import { identicalLineGroups, lineMergeKey, mergedDescription } from "./line-merge.js";

const l = (lineNo: number, description: string | null, unitPrice: string | null, origin = "ID", unit = "KGM", hs: string | null = null) => ({ lineNo, description, unit, unitPrice, origin, hs });

describe("line-merge", () => {
  it("nhóm dòng cùng tên (không phân biệt hoa thường, khoảng trắng), ĐVT, đơn giá (1.50 = 1.5), xuất xứ, HS; khác một thứ → không gộp", () => {
    expect(identicalLineGroups([
      l(1, "Frozen fish", "2.50"), l(2, "Squid", "3"), l(3, " FROZEN   fish ", "2.5"), l(4, "Squid", "3", "VN"), l(5, "Squid", "3.00"),
      l(6, "Shrimp", "4", "ID", "KGM", "0306.17.00"), l(7, "Shrimp", "4", "ID", "KGM", "03061700"), l(8, "Shrimp", "4", "ID", "KGM", "0306.16"),
    ])).toEqual([[1, 3], [2, 5], [6, 7]]);
  });
  it("cùng tên hàng gốc, khác size / số carton → cùng nhóm; tên gốc khác → không", () => {
    const d = (size: string, ctn: number) => `FROZEN OCTOPUS WHOLE LONG ARM, SIZE ${size}, PACKING: 5X4KG NET WEIGHT, LOT NO: SLS-01/26, ${ctn} CARTONS`;
    expect(identicalLineGroups([l(1, d("50/100", 10), "3.85"), l(2, d("100/200", 101), "3.85"), l(3, "FROZEN SQUID, SIZE 50/100", "3.85"), l(4, d("500/UP", 200), "3.85")])).toEqual([[1, 2, 4]]);
    expect(mergedDescription([d("50/100", 10), d("100/200", 101), d("500/UP", 200)])).toBe("FROZEN OCTOPUS WHOLE LONG ARM, PACKING: 5X4KG NET WEIGHT, LOT NO: SLS-01/26");
    expect(mergedDescription(["Frozen fish", " FROZEN   fish "])).toBe("Frozen fish");
    // Dấu phẩy thập phân không phải chỗ tách tên: BOLT M8X1,25 ≠ BOLT M8X1,5.
    expect(identicalLineGroups([l(1, "BOLT M8X1,25", "1"), l(2, "BOLT M8X1,5", "1")])).toEqual([]);
  });
  it("thiếu tên hàng hoặc đơn giá → không gộp", () => {
    expect(lineMergeKey(l(1, "", "1"))).toBeNull();
    expect(lineMergeKey(l(1, "Fish", null))).toBeNull();
    expect(identicalLineGroups([l(1, "Fish", null), l(2, "Fish", null)])).toEqual([]);
  });
});
