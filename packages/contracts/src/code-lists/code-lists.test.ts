import { describe, expect, it } from "vitest";
import { CODE_TABLES } from "../declaration/code-tables.js";
import { layoutFields, LAYOUT_EDA, LAYOUT_IDA } from "../declaration-layout/index.js";
import { CODE_LIST_IDS, CODE_LIST_META, codeListFor, loadCodeList, officeCodeAliases } from "./index.js";
import manifest from "./manifest.json" with { type: "json" };

describe("danh mục VNACCS (02_DANHMUC_VNACCS → code-lists)", () => {
  it("khai báo đủ và khớp manifest sinh ra", () => {
    expect([...CODE_LIST_IDS].sort()).toEqual(manifest.lists.map((l) => l.id).sort());
    for (const l of manifest.lists) expect(CODE_LIST_META[l.id as (typeof CODE_LIST_IDS)[number]].count).toBe(l.count);
  });

  it.each([...CODE_LIST_IDS])("%s: mỗi mục có mã và tên; không trùng mã trong cùng mã cha", async (id) => {
    const list = await loadCodeList(id);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.code.trim() && e.name.trim())).toBe(true);
    const keys = list.map((e) => `${e.parent ?? ""}|${e.code}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("mọi ô có bảng mã trên tờ khai đều tra được: danh mục VNACCS hoặc bảng mã đang dùng", () => {
    const tables = new Set([LAYOUT_IDA, LAYOUT_EDA].flatMap((l) => layoutFields(l)).flatMap((f) => (f.codeTable ? [f.codeTable] : [])));
    const missing = [...tables].filter((t) => !codeListFor(t) && !CODE_TABLES[t]);
    expect(missing).toEqual([]);
  });

  it("có các mã của tờ khai mẫu (ảnh phần mềm): cơ quan HQ, bộ phận xử lý theo chi cục, đơn vị, tiền, loại hình, miễn giảm", async () => {
    const has = async (id: (typeof CODE_LIST_IDS)[number], code: string, parent?: string) => (await loadCodeList(id)).some((e) => e.code === code && (!parent || e.parent === parent));
    expect(await has("A038", "06B1")).toBe(true);
    expect(await has("A014", "01", "06B1")).toBe(true);
    expect(await has("A014", "05", "06B1")).toBe(true);
    for (const [id, code] of [["UNIT", "KGM"], ["UNIT", "UNA"], ["CURRENCY", "USD"], ["PACKAGE_KIND", "PK"], ["A520", "XN180"], ["OTHER_TAX", "TB020"], ["COUNTRY", "GB"], ["A016", "SGSIN"], ["PAYMENT", "TTR"], ["TAX_TABLE", "B01"]] as const) expect(await has(id, code)).toBe(true);
    expect((await loadCodeList("TYPE_CODE")).find((e) => e.code === "A44")?.parent).toBe("NK");
    expect((await loadCodeList("TYPE_CODE")).find((e) => e.code === "B13")?.parent).toBe("XK");
  });

  it("địa điểm lưu kho (danh mục 04/2025) còn mã chi cục cũ: lọc theo cơ quan HQ mới qua bảng ánh xạ cũ → mới", async () => {
    expect(CODE_LIST_META.A202.usesOldOfficeCodes).toBe(true);
    expect(officeCodeAliases("06B1")).toEqual(expect.arrayContaining(["06B1", "02B1"]));
    expect((await loadCodeList("A202")).find((e) => e.code === "02B1A04")?.name).toBe("KHO SCSC");
  });

  it("ô tờ khai → danh mục: ngân hàng, mã thu khác, mức thuế tuyệt đối; bảng chưa có trong danh mục → không gán", () => {
    expect(codeListFor("BANK")).toBe("BANK");
    expect(codeListFor("OTHER_TAX")).toBe("OTHER_TAX");
    expect(codeListFor("A501")).toBe("UNIT");
    expect(codeListFor("BP_REASON")).toBeUndefined();
  });

  it("ô ngân hàng (trả thuế thay, bảo lãnh), mã áp dụng thuế suất thu khác, mã áp dụng mức thuế tuyệt đối có bảng mã", () => {
    for (const layout of [LAYOUT_IDA, LAYOUT_EDA]) {
      const f = (k: string) => layoutFields(layout).find((x) => x.key === k);
      expect(f("TK_BRC")).toMatchObject({ input: "code", codeTable: "BANK" });
      expect(f("TK_SBC")).toMatchObject({ input: "code", codeTable: "BANK" });
    }
    const item = (k: string) => LAYOUT_IDA.item.declarant.flatMap((b) => b.items).flatMap((it) => (it.kind === "field" ? [it] : it.fields)).find((x) => x.key === k);
    expect(item("HAG_TX{n}")).toMatchObject({ input: "code", codeTable: "OTHER_TAX" });
    expect(item("HAG_SPD")).toMatchObject({ input: "code", codeTable: "ABS_TAX" });
  });
});
