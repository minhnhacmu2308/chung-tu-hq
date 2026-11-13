import type { ResolveManyResult } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { catalogMatches } from "./catalog-match";

const cand = (id: string, name: string, hsCode: string | null, score: number, timesDeclared = 1) => ({ itemId: id, score, reason: "NAME_SIMILAR_CHAPTER", item: { id, itemNo: `MH-${id}`, name, hsCode, timesDeclared } });
const result = (candidates: ResolveManyResult["candidates"], sure: string | null = null): ResolveManyResult =>
  ({ itemId: sure, level: sure ? "SURE" : candidates.length ? "MAYBE" : "NONE", reason: "X", codeSetId: null, candidates });

const LIGHT = "Recessed fix down light LED 7W, 350mA, 25 DEG., DC18V input, white color, excluded driver";

describe("catalogMatches", () => {
  it("trùng tên (bỏ hoa thường, khoảng trắng thừa) là khớp đúng, xếp đầu, kèm mã HS dạng 9405.11.99", () => {
    const r = result([cand("b", "Recessed fix down light LED 10W", "94054290", 0.9), cand("a", LIGHT, "94051199", 0.85, 12)]);
    const m = catalogMatches("recessed fix down light LED 7W, 350mA,  25 DEG., DC18V input, WHITE color, excluded driver", r);
    expect(m[0]).toMatchObject({ exact: true, code: "9405.11.99", product: { timesDeclared: 12 } });
    expect(m[1]).toMatchObject({ exact: false, code: "9405.42.90" });
  });

  it("mặt hàng tra chắc chắn (SURE) là khớp đúng dù tên khác", () => {
    expect(catalogMatches("Đèn âm trần 7W", result([cand("a", LIGHT, "94051199", 1)], "a"))[0]).toMatchObject({ exact: true });
  });

  it("bỏ mặt hàng chưa có mã HS 8 số; không có kết quả → rỗng; giới hạn số gợi ý", () => {
    expect(catalogMatches("x", result([cand("a", "x", "9405", 1), cand("b", "y", null, 0.9)]))).toEqual([]);
    expect(catalogMatches("x", undefined)).toEqual([]);
    expect(catalogMatches("x", result([cand("a", "a", "94051199", 0.9), cand("b", "b", "94051199", 0.8)]), { limit: 1 })).toHaveLength(1);
  });
});
