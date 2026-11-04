import type { CodeListEntry } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { codeName, codeScope, lookupMode, scopedEntries } from "./code-scope";

const e = (code: string, name: string, parent?: string, inactive?: boolean): CodeListEntry => ({ code, name, ...(parent ? { parent } : {}), ...(inactive ? { inactive } : {}) });

describe("codeScope – phạm vi lọc danh mục theo tờ khai", () => {
  it("bộ phận xử lý: theo cơ quan Hải quan đang khai, bắt buộc lọc", () => {
    expect(codeScope("A014", "TK_CHB", "IDA", { TK_CH: "06B1" }, "vi")).toMatchObject({ parents: ["06B1"], optional: false });
    expect(codeScope("A014", "TK_CHB", "IDA", {}, "vi")).toBeNull();
  });
  it("địa điểm lưu kho: theo cơ quan Hải quan gồm cả mã chi cục cũ, bỏ lọc được", () => {
    const s = codeScope("A202", "VD_ST", "IDA", { TK_CH: "06B1" }, "vi")!;
    expect(s.parents).toEqual(expect.arrayContaining(["06B1", "02B1"]));
    expect(s.optional).toBe(true);
  });
  it("mã loại hình: nhập khẩu chỉ mã NK, xuất khẩu chỉ mã XK", () => {
    expect(codeScope("TYPE_CODE", "TK_ICB", "IDA", {}, "vi")).toMatchObject({ parents: ["NK"], optional: false });
    expect(codeScope("TYPE_CODE", "TK_ECB", "EDA", {}, "vi")).toMatchObject({ parents: ["XK"], optional: false });
  });
  it("địa điểm xếp / dỡ (A016): nhập – dỡ Việt Nam theo PTVC, xếp nước ngoài; xuất – xếp Việt Nam theo PTVC, nhận cuối nước ngoài; PTVC 9 không tra", () => {
    const list = [
      { code: "VNCLI", name: "CANG CAT LAI", parent: "VN", modes: ["1", "2", "3", "6"] },
      { code: "VNLSN", name: "CUA KHAU LANG SON", parent: "VN", modes: ["4", "5"] },
      { code: "VNOLD", name: "MA CU", parent: "VN" },
      { code: "SGSIN", name: "SINGAPORE", parent: "SG" },
    ];
    const pick = (key: string, kind: "IDA" | "EDA", mode: string) => scopedEntries(list, codeScope("A016", key, kind, { TK_MTC: mode }, "vi"), { all: false, inactive: false }).map((x) => x.code);
    expect(pick("VD_DST", "IDA", "2")).toEqual(["VNCLI"]);
    expect(pick("VD_DST", "IDA", "4")).toEqual(["VNLSN"]);
    expect(pick("VD_DST", "IDA", "")).toEqual(["VNCLI", "VNLSN"]);
    expect(pick("VD_PSC", "IDA", "2")).toEqual(["SGSIN"]);
    expect(pick("TK_PSC", "EDA", "5")).toEqual(["VNLSN"]);
    expect(pick("TK_DSC", "EDA", "1")).toEqual(["SGSIN"]);
    expect(codeScope("A016", "VD_DST", "IDA", { TK_MTC: "4" }, "vi")).toMatchObject({ optional: false, label: expect.stringContaining("4") });
    expect(codeScope("A016", "VD_DST", "IDA", { TK_MTC: "9" }, "vi")).toBeNull();
    expect(codeName(list, "VNLSN", codeScope("A016", "VD_DST", "IDA", { TK_MTC: "4" }, "vi"))).toBe("CUA KHAU LANG SON");
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
