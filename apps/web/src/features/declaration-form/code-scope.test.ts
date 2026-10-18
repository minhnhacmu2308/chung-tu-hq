import type { CodeListEntry } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { codeName, codeScope, lookupMode, scopedEntries } from "./code-scope";

const e = (code: string, name: string, parent?: string, inactive?: boolean): CodeListEntry => ({ code, name, ...(parent ? { parent } : {}), ...(inactive ? { inactive } : {}) });

describe("codeScope – phạm vi lọc danh mục theo tờ khai", () => {
  it("bộ phận xử lý: theo cơ quan Hải quan đang khai, bắt buộc lọc", () => {
    expect(codeScope("A014", "TK_CHB", "IDA", { TK_CH: "06B1" })).toMatchObject({ parents: ["06B1"], optional: false });
    expect(codeScope("A014", "TK_CHB", "IDA", {})).toBeNull();
  });
  it("địa điểm lưu kho: theo cơ quan Hải quan gồm cả mã chi cục cũ, bỏ lọc được", () => {
    const s = codeScope("A202", "VD_ST", "IDA", { TK_CH: "06B1" })!;
    expect(s.parents).toEqual(expect.arrayContaining(["06B1", "02B1"]));
    expect(s.optional).toBe(true);
  });
  it("mã loại hình: nhập khẩu chỉ mã NK, xuất khẩu chỉ mã XK", () => {
    expect(codeScope("TYPE_CODE", "TK_ICB", "IDA", {})).toMatchObject({ parents: ["NK"], optional: false });
    expect(codeScope("TYPE_CODE", "TK_ECB", "EDA", {})).toMatchObject({ parents: ["XK"], optional: false });
  });
  it("địa điểm dỡ hàng (nhập) / xếp hàng (xuất): ưu tiên địa điểm Việt Nam; cảng nước ngoài không lọc", () => {
    expect(codeScope("A016", "VD_DST", "IDA", {})).toMatchObject({ parents: ["VN"], optional: true });
    expect(codeScope("A016", "TK_PSC", "EDA", {})).toMatchObject({ parents: ["VN"], optional: true });
    expect(codeScope("A016", "VD_PSC", "IDA", {})).toBeNull();
  });
});

describe("scopedEntries / lookupMode", () => {
  const list = [e("00", "Kho TCS", "06B1"), e("01", "Kho SCSC", "06B1"), e("01", "Đội 1", "01B1"), e("09", "Cũ", "06B1", true)];
  const scope = { parents: ["06B1"], label: "thuộc 06B1", optional: false };
  it("lọc theo mã cha, ẩn mã ngưng dùng trừ khi chọn hiện; phạm vi không có mục nào → trả cả danh mục", () => {
    expect(scopedEntries(list, scope, { all: false, inactive: false }).map((x) => x.name)).toEqual(["Kho TCS", "Kho SCSC"]);
    expect(scopedEntries(list, scope, { all: false, inactive: true })).toHaveLength(3);
    expect(scopedEntries(list, { ...scope, parents: ["99X9"] }, { all: false, inactive: false })).toHaveLength(3);
    expect(scopedEntries(list, scope, { all: true, inactive: false })).toHaveLength(3);
  });
  it("danh sách ngắn trong phạm vi bắt buộc → thả xuống; dài hoặc phạm vi bỏ được → popup", () => {
    expect(lookupMode(Array.from({ length: 40 }, (_, i) => e(String(i), "x")), null)).toBe("dropdown");
    expect(lookupMode(Array.from({ length: 41 }, (_, i) => e(String(i), "x")), null)).toBe("dialog");
    expect(lookupMode([e("A", "x")], { ...scope, optional: true })).toBe("dialog");
  });
  it("codeName: tên theo mã cha trong phạm vi (mã 01 ở nhiều chi cục), không có thì mục đầu tiên còn hiệu lực", () => {
    expect(codeName(list, "01", scope)).toBe("Kho SCSC");
    expect(codeName(list, "01", { ...scope, parents: ["01B1"] })).toBe("Đội 1");
    expect(codeName(list, "01", null)).toBe("Kho SCSC");
    expect(codeName(list, "ZZ", null)).toBeUndefined();
  });
});
