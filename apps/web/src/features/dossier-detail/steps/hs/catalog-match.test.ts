import type { ProductCatalogItem } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { matchCatalog } from "./catalog-match";

const product = (name: string, hsCode: string, timesDeclared = 1): ProductCatalogItem =>
  ({ id: name, code: null, name, hsCode, timesDeclared } as unknown as ProductCatalogItem);

const CATALOG = [
  product("Recessed fix down light LED 7W, 350mA, 25 DEG., DC18V input, white color, excluded driver", "94051199", 12),
  product("Đèn LED downlight âm trần 7W", "94051199", 3),
  product("Honeycomb louver", "94059990", 2),
  product("Recessed fix down light LED 10W", "94054290", 1),
  product("Mặt hàng chưa có mã đủ 8 số", "9405"),
];

describe("matchCatalog", () => {
  it("khớp đúng tên (bỏ hoa thường, khoảng trắng thừa) xếp đầu, kèm mã HS dạng 9405.11.99", () => {
    const m = matchCatalog("recessed fix down light LED 7W, 350mA,  25 DEG., DC18V input, WHITE color, excluded driver", CATALOG);
    expect(m[0]).toMatchObject({ exact: true, code: "9405.11.99" });
    expect(m[0]!.product.timesDeclared).toBe(12);
  });

  it("gần giống (đủ tỉ lệ từ chung) → gợi ý, không phải khớp đúng; khác xa → không gợi ý", () => {
    const m = matchCatalog("Honeycomb louver + PC sheet", CATALOG);
    expect(m.map((x) => x.product.name)).toContain("Honeycomb louver");
    expect(m.every((x) => !x.exact)).toBe(true);
    expect(matchCatalog("Ổ bi cầu 6205-2RS", CATALOG)).toEqual([]);
    // Mô tả đèn dài có chữ "honeycomb louver" không khớp nhầm mặt hàng "Honeycomb louver".
    expect(matchCatalog("Recessed fix down light LED 10W, 250mA, 20 DEG., DC40V input, white color, excluded driver, w/honeycomb louver", CATALOG).map((x) => x.product.name)).not.toContain("Honeycomb louver");
  });

  it("bỏ mặt hàng chưa có mã HS 8 số; giới hạn số gợi ý", () => {
    expect(matchCatalog("Mặt hàng chưa có mã đủ 8 số", CATALOG)).toEqual([]);
    expect(matchCatalog("Recessed fix down light LED", CATALOG, { limit: 1 })).toHaveLength(1);
  });
});
