import { describe, expect, it } from "vitest";
import { REASON_CODES } from "../reason-codes.js";
import { itemCodeKey, itemNameKey } from "./code-key.js";
import {
  CATALOG_IMPORT_MAX_ROWS_PER_REQUEST, detectItemColumns, ITEM_IMPORT_MAX_LENGTH, ImportRowsInputSchema, importRowsTooLarge, itemImportTooLong, validateItemRows,
} from "./excel.js";
import { buildItemMatchIndex, matchItemCandidate } from "./match.js";
import { CatalogModeSchema, CodeSetKindSchema, DecideQueueInputSchema, UnitConversionSchema } from "./schemas.js";
import { convertItemQty } from "./units.js";

describe("codeKey / nameKey", () => {
  it("bỏ khoảng trắng và - . / _, viết hoa", () => {
    expect(itemCodeKey(" vt-0012 ")).toBe("VT0012");
    expect(itemCodeKey("VT 0012")).toBe("VT0012");
    expect(itemCodeKey("vt.00/12_x")).toBe("VT0012X");
  });
  it("nameKey chuẩn hóa như tên danh mục cũ", () => {
    expect(itemNameKey("  Dây   ĐIỆN  ")).toBe("dây điện");
  });
});

describe("schemas", () => {
  it("enum chế độ và loại bộ mã", () => {
    expect(CatalogModeSchema.options).toEqual(["SHARED", "PER_DEPARTMENT"]);
    expect(CodeSetKindSchema.options).toContain("SHARED");
  });
  it("hệ số quy đổi là chuỗi Decimal > 0", () => {
    expect(UnitConversionSchema.safeParse({ unit: "CUON", factor: "100" }).success).toBe(true);
    expect(UnitConversionSchema.safeParse({ unit: "CUON", factor: "0" }).success).toBe(false);
    expect(UnitConversionSchema.safeParse({ unit: "CUON", factor: "-1" }).success).toBe(false);
    expect(UnitConversionSchema.safeParse({ unit: "CUON", factor: 100 }).success).toBe(false);
  });
  it("DecideQueueInput", () => {
    expect(DecideQueueInputSchema.safeParse({ action: "CONFIRM" }).success).toBe(true);
    expect(DecideQueueInputSchema.safeParse({ action: "X" }).success).toBe(false);
  });
});

const item = (id: string, name: string, hs: string | null, baseUnit: string | null = "MTR", conv: string[] = []) => ({
  id,
  nameKey: itemNameKey(name),
  hsCode: hs,
  baseUnit,
  conversionUnits: conv,
});
const alias = (codeSetId: string, code: string, itemId: string) => ({ codeSetId, codeKey: itemCodeKey(code), itemId });
const row = (code: string, name: string, hs?: string, unit?: string) => ({ codeKey: itemCodeKey(code), nameKey: itemNameKey(name), hs, unit });

describe("matchItemCandidate", () => {
  const index = buildItemMatchIndex(
    [alias("ACC", "VT-1", "i1"), alias("WH", "VT-2", "i2")],
    [
      item("i1", "Dây điện 2 lõi", "85444929"),
      item("i2", "Ống thép mạ kẽm", "73063010"),
      item("i3", "Bu lông inox M8", "73181510"),
      item("i4", "Bu lông inox M8 dài", "73181590"),
      item("i5", "Không HS gì đó", null),
      item("i6", "Keo dán sắt", "35069900", "KGM"),
    ],
  );
  it("ALIAS_SAME_SET -> SURE", () => {
    const r = matchItemCandidate(row("vt 1", "bất kỳ"), index, "ACC");
    expect(r).toMatchObject({ level: "SURE", itemId: "i1", reason: "ALIAS_SAME_SET" });
  });
  it("HS8_NAME -> SURE", () => {
    const r = matchItemCandidate(row("NEW", "Ống thép mạ kẽm", "7306.30.10"), index, "ACC");
    expect(r).toMatchObject({ level: "SURE", itemId: "i2", reason: "HS8_NAME" });
  });
  it("CODE_OTHER_SET_HS4 -> SURE (cùng HS 4 số)", () => {
    const r = matchItemCandidate(row("VT-2", "tên khác hẳn", "73069999"), index, "ACC");
    expect(r).toMatchObject({ level: "SURE", itemId: "i2", reason: "CODE_OTHER_SET_HS4" });
  });
  it("CODE_OTHER_SET_HS4 -> SURE khi cả hai thiếu HS và tên trùng", () => {
    const idx = buildItemMatchIndex([alias("WH", "K9", "i5")], [item("i5", "Không HS gì đó", null)]);
    expect(matchItemCandidate(row("K9", "Không HS gì đó"), idx, "ACC")).toMatchObject({ level: "SURE", itemId: "i5" });
    expect(matchItemCandidate(row("K9", "Tên khác"), idx, "ACC").level).not.toBe("SURE");
  });
  it("mã ở bộ khác nhưng HS khác nhóm -> không SURE", () => {
    const r = matchItemCandidate(row("VT-2", "tên khác hẳn", "99999999"), index, "ACC");
    expect(r.level).toBe("NONE");
  });
  it("NAME_SIMILAR_CHAPTER -> MAYBE", () => {
    const r = matchItemCandidate(row("Z1", "Dây điện 2 lõi mềm", "85440000"), index, "ACC");
    expect(r).toMatchObject({ level: "MAYBE", itemId: "i1", reason: "NAME_SIMILAR_CHAPTER" });
  });
  it("NAME_SIMILAR_CHAPTER khi dòng thiếu HS", () => {
    expect(matchItemCandidate(row("Z1", "Dây điện 2 lõi mềm"), index, "ACC").level).toBe("MAYBE");
  });
  it("tên giống nhưng khác chương -> NONE", () => {
    expect(matchItemCandidate(row("Z1", "Dây điện 2 lõi mềm", "39000000"), index, "ACC").level).toBe("NONE");
  });
  it("HS8_NAME_DIFF -> MAYBE", () => {
    const r = matchItemCandidate(row("Z2", "Cái gì đó xa lạ", "73063010"), index, "ACC");
    expect(r).toMatchObject({ level: "MAYBE", itemId: "i2", reason: "HS8_NAME_DIFF" });
  });
  it("không ứng viên -> NONE", () => {
    const r = matchItemCandidate(row("Z3", "Hoàn toàn khác", "11111111"), index, "ACC");
    expect(r.level).toBe("NONE");
    expect(r.itemId).toBeUndefined();
    expect(r.candidates).toEqual([]);
  });
  it("SURE hạ MAYBE khi ĐVT khác đơn vị gốc và thiếu quy đổi (UNIT_NO_FACTOR)", () => {
    const r = matchItemCandidate(row("vt-1", "x", undefined, "CUON"), index, "ACC");
    expect(r).toMatchObject({ level: "MAYBE", itemId: "i1", reason: "UNIT_NO_FACTOR" });
  });
  it("giữ SURE khi ĐVT = gốc hoặc đã có quy đổi", () => {
    expect(matchItemCandidate(row("vt-1", "x", undefined, "mtr"), index, "ACC").level).toBe("SURE");
    const idx = buildItemMatchIndex([alias("ACC", "VT-1", "i1")], [item("i1", "Dây", "85444929", "MTR", ["CUON"])]);
    expect(matchItemCandidate(row("vt-1", "x", undefined, "CUON"), idx, "ACC").level).toBe("SURE");
  });
  it("nhiều mặt hàng cùng SURE -> MAYBE (AMBIGUOUS)", () => {
    const idx = buildItemMatchIndex([], [item("a", "Ống thép", "73063010"), item("b", "Ống thép", "73063010")]);
    const r = matchItemCandidate(row("N", "Ống thép", "73063010"), idx, "ACC");
    expect(r).toMatchObject({ level: "MAYBE", reason: "AMBIGUOUS" });
    expect(r.candidates.length).toBe(2);
    const idx2 = buildItemMatchIndex([alias("WH", "K", "a"), alias("AC2", "K", "b")], [item("a", "A", "73063010"), item("b", "B", "73063099")]);
    expect(matchItemCandidate(row("K", "x", "73063000"), idx2, "ACC")).toMatchObject({ level: "MAYBE", reason: "AMBIGUOUS" });
  });
  it("ĐVT so không phân biệt hoa thường/khoảng trắng", () => {
    const idx = buildItemMatchIndex([alias("ACC", "VT-1", "i1")], [item("i1", "Dây", "85444929", "MTR", ["CUON"])]);
    expect(matchItemCandidate(row("vt-1", "x", undefined, " cuon "), idx, "ACC").level).toBe("SURE");
    expect(matchItemCandidate(row("vt-1", "x", undefined, "mtr"), idx, "ACC").level).toBe("SURE");
  });
  it("tối đa 5 ứng viên", () => {
    const items = Array.from({ length: 9 }, (_, n) => item(`n${n}`, `Bu lông thép loại ${n}`, "73181510"));
    const idx = buildItemMatchIndex([], items);
    const r = matchItemCandidate(row("Q", "Bu lông thép loại", "73181599"), idx, "ACC");
    expect(r.candidates.length).toBe(5);
    expect(r.level).toBe("MAYBE");
  });
});

describe("convertItemQty", () => {
  const conv = { base: "MTR", factors: { CUON: "100" } };
  it("quy đổi bằng Decimal", () => {
    expect(convertItemQty("120", "CUON", "MTR", conv)).toEqual({ qty: "12000", factor: "100" });
  });
  it("hệ số lô thắng mặc định", () => {
    expect(convertItemQty("120", "CUON", "MTR", conv, "98.5")).toEqual({ qty: "11820", factor: "98.5" });
  });
  it("thiếu hệ số -> null", () => {
    expect(convertItemQty("1", "BOX", "MTR", conv)).toBeNull();
  });
  it("cùng đơn vị -> hệ số 1; sang đơn vị không phải gốc", () => {
    expect(convertItemQty("5", "MTR", "MTR", conv)).toEqual({ qty: "5", factor: "1" });
    expect(convertItemQty("200", "MTR", "CUON", conv)).toEqual({ qty: "2", factor: "0.01" });
  });
  it("không sai số số thực", () => {
    expect(convertItemQty("0.3", "CUON", "MTR", { base: "MTR", factors: { CUON: "0.1" } })).toEqual({ qty: "0.03", factor: "0.1" });
  });
  it("mã ĐVT không phân biệt hoa thường/khoảng trắng", () => {
    expect(convertItemQty("120", "cuon ", "mtr", conv)).toEqual({ qty: "12000", factor: "100" });
    expect(convertItemQty("1", "CUON", "MTR", { base: "mtr", factors: { cuon: "100" } })).toEqual({ qty: "100", factor: "100" });
  });
  it("số lượng sai -> null", () => {
    expect(convertItemQty("abc", "CUON", "MTR", conv)).toBeNull();
  });
});

describe("detectItemColumns / validateItemRows", () => {
  it("nhận cột theo tên thường gặp", () => {
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "ĐVT"])).toEqual({ code: 0, name: 1, unit: 2 });
    expect(detectItemColumns(["Item code", "Mã HS", "Quy đổi", "Đơn vị tính", "Tên vật tư"])).toEqual({ code: 0, hs: 1, factor: 2, unit: 3, name: 4 });
  });
  it("cột không nhận ra -> không có khóa", () => {
    expect(detectItemColumns(["Ghi chú"])).toEqual({});
  });
  it("báo thiếu mã/tên, trùng mã, HS sai", () => {
    const rows = [
      { code: "VT-1", name: "A", unit: "MTR", hs: "85444929" },
      { code: "vt 1", name: "B" },
      { code: "", name: "C" },
      { code: "VT-3", name: "" },
      { code: "VT-4", name: "D", hs: "12" },
      { code: "VT-5", name: "E", hs: "7306.30.10", unit: "Cuộn" },
    ];
    const r = validateItemRows(rows);
    expect(r.ok.map((x) => x.code)).toEqual(["VT-1", "VT-5"]);
    expect(r.errors).toEqual([
      { row: 2, field: "code", code: "DUPLICATE_IN_FILE" },
      { row: 3, field: "code", code: "MISSING" },
      { row: 4, field: "name", code: "MISSING" },
      { row: 5, field: "hs", code: "INVALID_FORMAT" },
    ]);
    expect(r.ok[1]).toMatchObject({ code: "VT-5", hs: "73063010" });
  });
  it("dòng lỗi vẫn giữ mã để phát hiện trùng ở dòng sau", () => {
    const r = validateItemRows([{ code: "A-1", name: "" }, { code: "a 1", name: "B" }]);
    expect(r.errors).toEqual([{ row: 1, field: "name", code: "MISSING" }, { row: 2, field: "code", code: "DUPLICATE_IN_FILE" }]);
    expect(r.ok).toEqual([]);
  });
  it("HS phải có số chữ số chẵn (4/6/8/10): 7 chữ số (ô số Excel mất số 0 đầu) -> INVALID_FORMAT", () => {
    const r = validateItemRows([{ code: "A", name: "a", hs: "8471301" }, { code: "B", name: "b", hs: "847130" }, { code: "C", name: "c", hs: "0847130100" }]);
    expect(r.errors).toEqual([{ row: 1, field: "hs", code: "INVALID_FORMAT" }]);
    expect(r.ok.map((x) => x.hs)).toEqual(["847130", "0847130100"]);
  });
  it("trường dài quá giới hạn -> TOO_LONG (không cắt bớt), các kiểm khác của trường đó bỏ qua", () => {
    const long = (n: number) => "X".repeat(n);
    const rows = [
      { code: long(ITEM_IMPORT_MAX_LENGTH.code + 1), name: "a" },
      { code: "B", name: long(ITEM_IMPORT_MAX_LENGTH.name + 1), hs: long(ITEM_IMPORT_MAX_LENGTH.hs + 1) },
      { code: "C", name: "c", unit: long(ITEM_IMPORT_MAX_LENGTH.unit + 1), factor: "1".repeat(ITEM_IMPORT_MAX_LENGTH.factor + 1) },
      { code: "D", name: long(ITEM_IMPORT_MAX_LENGTH.name) },
    ];
    expect(itemImportTooLong(rows[2]!)).toEqual(["unit", "factor"]);
    const r = validateItemRows(rows);
    expect(r.errors).toEqual([
      { row: 1, field: "code", code: "TOO_LONG" },
      { row: 2, field: "name", code: "TOO_LONG" },
      { row: 2, field: "hs", code: "TOO_LONG" },
      { row: 3, field: "unit", code: "TOO_LONG" },
      { row: 3, field: "factor", code: "TOO_LONG" },
    ]);
    expect(r.ok.map((x) => x.code)).toEqual(["D"]);
  });
  it("ĐVT ngoài danh mục -> UNKNOWN_UNIT khi có danh mục", () => {
    const r = validateItemRows([{ code: "A", name: "a", unit: "ZZZ" }], { knownUnits: new Set(["MTR"]) });
    expect(r.errors).toEqual([{ row: 1, field: "unit", code: "UNKNOWN_UNIT" }]);
  });
});

describe("reason codes", () => {
  it("có mã lý do danh mục", () => {
    for (const c of ["CATALOG_CODE_TAKEN", "CATALOG_UNIT_FACTOR_REQUIRED", "CATALOG_QUEUE_ITEM_DONE", "CATALOG_MERGE_INVALID", "CATALOG_NOT_CODE_SET_OWNER", "CATALOG_MODE_CONFLICT", "CATALOG_IMPORT_TOO_LARGE"])
      expect(REASON_CODES).toContain(c);
  });
});

describe("giới hạn số dòng mỗi lần nhập", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `C${i}`, name: `N${i}` }));
  it("tối đa 5.000 dòng mỗi yêu cầu; vượt → importRowsTooLarge, schema từ chối", () => {
    expect(CATALOG_IMPORT_MAX_ROWS_PER_REQUEST).toBe(5_000);
    const ok = { codeSetId: "s", fileName: "f.xlsx", columnMap: {}, rows: rows(5_000) };
    expect(importRowsTooLarge(ok)).toBe(false);
    expect(ImportRowsInputSchema.safeParse(ok).success).toBe(true);
    const big = { ...ok, rows: rows(5_001) };
    expect(importRowsTooLarge(big)).toBe(true);
    expect(ImportRowsInputSchema.safeParse(big).success).toBe(false);
    expect(importRowsTooLarge(null)).toBe(false);
    expect(importRowsTooLarge({ rows: "x" })).toBe(false);
  });
});
