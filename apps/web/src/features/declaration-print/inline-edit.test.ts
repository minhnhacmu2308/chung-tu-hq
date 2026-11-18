import { describe, expect, it } from "vitest";
import { itemFieldCode, type DeclarationField } from "@kb/contracts";
import { canEditInline, inlineEdits, inlineInputOf, inlineStartText, parseInline, parseInlineDate, parseInlineNumber } from "./inline-edit";

const f = (code: string, value: string): DeclarationField => ({ code, value, label: code, source: "USER" }) as DeclarationField;

describe("parseInlineDate – ngày gõ / dán → YYYY-MM-DD", () => {
  it.each([
    ["05/11/2026", "2026-11-05"],
    ["5/1/2026", "2026-01-05"],
    ["05-11-2026", "2026-11-05"],
    ["05.11.2026", "2026-11-05"],
    ["2026-11-05", "2026-11-05"],
    [" 29/02/2028 ", "2028-02-29"],
    ["", ""],
  ])("%s → %s", (text, value) => expect(parseInlineDate(text)).toEqual({ ok: true, value }));

  it.each(["31/02/2026", "29/02/2026", "13/13/2026", "2026/11/05", "hôm nay", "05/11/26"])("%s → không hợp lệ", (text) =>
    expect(parseInlineDate(text)).toEqual({ ok: false, reason: "DATE" }));
});

describe("parseInlineNumber – số gõ / dán (kiểu bản in Việt Nam, kiểu Anh, số thường)", () => {
  it.each([
    ["20.850", "20850"],
    ["1.234.567,89", "1234567.89"],
    ["1,234.5", "1234.5"],
    ["2111.04", "2111.04"],
    ["3,85", "3.85"],
    ["1 500", "1500"],
    ["007", "7"],
    ["-12,5", "-12.5"],
    ["", ""],
  ])("%s → %s", (text, value) => expect(parseInlineNumber(text)).toEqual({ ok: true, value }));

  it.each(["12a", "1..2", "1,2,3.4.5", "abc"])("%s → không hợp lệ", (text) => expect(parseInlineNumber(text)).toEqual({ ok: false, reason: "NUMBER" }));
});

describe("parseInline theo kiểu ô", () => {
  it("mã viết hoa, bỏ khoảng trắng hai đầu; chữ giữ nguyên chữ hoa/thường", () => {
    expect(parseInline("code", " krpus ")).toEqual({ ok: true, value: "KRPUS" });
    expect(parseInline("text", "  Hóa đơn số 1 ")).toEqual({ ok: true, value: "Hóa đơn số 1" });
  });
  it("F2: ngày đang lưu hiện dạng dd/mm/yyyy để sửa", () => {
    expect(inlineStartText("date", "2026-10-14")).toBe("14/10/2026");
    expect(inlineStartText("text", " ABC ")).toBe("ABC");
  });
});

describe("inlineInputOf – ô nào nhập tại chỗ được", () => {
  it("ô người khai đơn giản: mã có danh mục, chữ, ngày", () => {
    expect(inlineInputOf("IDA", "TK_ENC")).toBe("code");
    expect(inlineInputOf("IDA", "TK_REF")).toBe("text");
    // Ghi chú (1.68) nhiều dòng → panel.
    expect(inlineInputOf("IDA", "TK_NT2")).toBeNull();
    expect(inlineInputOf("IDA", "TK_IVD")).toBe("date");
    expect(inlineInputOf("EDA", "TK_ENC")).toBe("code");
  });
  it("ô phải qua panel: mã HS, thuế và thu khác dồn ô, PTVC, địa điểm xếp / dỡ, vận đơn, ô Hải quan trả về, ô phần mềm tự tính", () => {
    for (const key of ["HAG_CMD", "HAG_TX1", "HAG_TR2", "TK_MTC", "VD_DST", "VD_PSN", "VD_BL1", "TK_ICN", "TK_A86", "TK_FIC"]) expect(inlineInputOf("IDA", key)).toBeNull();
  });
});

describe("canEditInline – cùng quy tắc khóa với panel", () => {
  const ctx = { fields: [f("MA_LH", "A11")], mode: "FULL" as const, lineMode: "FULL" as const, original: { TK_ICB: "A11" }, values: { TK_ICB: "A11" }, locale: "vi" as const };
  it("chưa khai: ô người khai nhập được; dòng hàng: ô INPUT được, ô chứng từ không", () => {
    expect(canEditInline("IDA", "TK_ENC", undefined, ctx)).toBe(true);
    expect(canEditInline("IDA", "HAG_ORS", 0, ctx)).toBe(true);
    expect(canEditInline("IDA", "HAG_CMD", 0, ctx)).toBe(false);
  });
  it("LOCKED: không ô nào; dòng hàng theo chế độ của tờ", () => {
    expect(canEditInline("IDA", "TK_ENC", undefined, { ...ctx, mode: "LOCKED" })).toBe(false);
    expect(canEditInline("IDA", "HAG_ORS", 0, { ...ctx, lineMode: "LOCKED" })).toBe(false);
    expect(canEditInline("IDA", "TK_ENC", undefined, { ...ctx, lineMode: "LOCKED" })).toBe(true);
  });
  it("ô tính từ chứng từ (loại hình) không nhập tại chỗ", () => {
    expect(canEditInline("IDA", "TK_ICB", undefined, ctx)).toBe(false);
  });
});

describe("inlineEdits – ô chưa lưu → chỉ tiêu cần lưu", () => {
  const items = [{ id: "li_1" }, { id: "li_2" }];
  const itemRows = [{ HAG_ORS: "KR" }, { HAG_ORS: "KR" }];
  const ctx = { fields: [f("MA_LH", "A11")], mode: "FULL" as const, original: { TK_ICB: "A11" }, items, itemRows };
  it("ô chung (ô bổ sung) lưu theo mã ô; ô dòng hàng lưu HANG.<id>.<ô>", () => {
    const edits = inlineEdits("IDA", [{ key: "TK_ENC", value: "D" }, { key: "HAG_ORS", line: 1, value: "JP" }], ctx);
    expect(edits).toEqual([{ code: "TK_ENC", value: "D" }, { code: itemFieldCode("li_2", "HAG_ORS"), value: "JP" }]);
  });
  it("giá trị như đang lưu → không sinh chỉ tiêu", () => {
    expect(inlineEdits("IDA", [{ key: "HAG_ORS", line: 0, value: "KR" }], ctx)).toEqual([]);
  });
  it("chỉ tiêu app nhiều ô: ghép lại như panel (1.27 số lượng + đơn vị → SO_KIEN)", () => {
    const edits = inlineEdits("IDA", [{ key: "VD_NO", value: "48" }], { ...ctx, original: { TK_ICB: "A11", VD_NO: "40", VD_NOT: "PK" } });
    expect(edits).toHaveLength(1);
    expect(edits[0]!.code).toBe("SO_KIEN");
    expect(edits[0]!.value).toContain("48");
  });
});
