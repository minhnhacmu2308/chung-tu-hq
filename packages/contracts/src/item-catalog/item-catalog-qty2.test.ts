// Bổ sung 2026-11-14 (spec catalog-so-luong-2): ĐVT số lượng 2 + tỷ lệ của mặt hàng → Số lượng (2) trên tờ khai.
import { describe, expect, it } from "vitest";
import { itemDefaults } from "../declaration-layout/item-fields.js";
import { itemFormValues } from "../declaration-layout/required.js";
import { sentSnapshotOf } from "../sent-sheets.js";
import { detectItemColumns, ITEM_IMPORT_ITEM_FIELDS, validateItemRows } from "./excel.js";
import { CatalogItemFieldsSchema, UpdateItemInputSchema } from "./schemas.js";
import { itemQty2Factor, itemQuantity2, rebaseQty2Factor } from "./units.js";

const conv = { base: "PCE", factors: { CTN: "24", BOX: "12" } };

describe("itemQuantity2 – Số lượng (2) của dòng", () => {
  it("ĐVT dòng = gốc: SL × tỷ lệ, factor = tỷ lệ", () => {
    expect(itemQuantity2({ qty: "100", unit: "PCE" }, conv, { unit: "KGM", factor: "0.25" })).toEqual({ qty: "25", unit: "KGM", factor: "0.25" });
  });
  it("quy đổi danh mục: dòng CTN, 1 CTN = 24 PCE, 1 PCE = 0.25 KGM → 6 KGM / CTN", () => {
    expect(itemQuantity2({ qty: "10", unit: "CTN" }, conv, { unit: "KGM", factor: "0.25" })).toEqual({ qty: "60", unit: "KGM", factor: "6" });
  });
  it("hệ số theo lô thắng quy đổi danh mục", () => {
    expect(itemQuantity2({ qty: "10", unit: "CTN", lotFactor: "20" }, conv, { unit: "KGM", factor: "0.25" })).toEqual({ qty: "50", unit: "KGM", factor: "5" });
  });
  it("ĐVT dòng = gốc thì bỏ qua hệ số lô (như convertItemQty)", () => {
    expect(itemQuantity2({ qty: "4", unit: "pce", lotFactor: "9" }, conv, { unit: "KGM", factor: "0.25" })?.qty).toBe("1");
  });
  it("ĐVT 2 = ĐVT gốc → tỷ lệ 1 (không cần nhập)", () => {
    expect(itemQuantity2({ qty: "2", unit: "CTN" }, conv, { unit: "PCE", factor: null })).toEqual({ qty: "48", unit: "PCE", factor: "24" });
  });
  it("ĐVT 2 = ĐVT dòng → giữ nguyên lượng", () => {
    expect(itemQuantity2({ qty: "3.456", unit: "KGM" }, conv, { unit: "KGM", factor: "0.25" })).toEqual({ qty: "3.46", unit: "KGM", factor: "1" });
  });
  it("làm tròn 2 số lẻ ROUND_HALF_UP", () => {
    expect(itemQuantity2({ qty: "1", unit: "PCE" }, conv, { unit: "KGM", factor: "0.125" })?.qty).toBe("0.13");
    expect(itemQuantity2({ qty: "3", unit: "PCE" }, conv, { unit: "KGM", factor: "0.3333" })?.qty).toBe("1");
    expect(itemQuantity2({ qty: "1", unit: "PCE" }, conv, { unit: "KGM", factor: "0.004" })?.qty).toBe("0");
  });
  it("không quy được về gốc / thiếu tỷ lệ / không có ĐVT 2 / số sai → null", () => {
    expect(itemQuantity2({ qty: "1", unit: "SET" }, conv, { unit: "KGM", factor: "0.25" })).toBeNull();
    expect(itemQuantity2({ qty: "1", unit: "PCE" }, conv, { unit: "KGM", factor: null })).toBeNull();
    expect(itemQuantity2({ qty: "1", unit: "PCE" }, null, { unit: "KGM", factor: "0.25" })).toBeNull();
    expect(itemQuantity2({ qty: "1", unit: "PCE" }, conv, null)).toBeNull();
    expect(itemQuantity2({ qty: "abc", unit: "PCE" }, conv, { unit: "KGM", factor: "0.25" })).toBeNull();
  });
  it("itemQty2Factor: ĐVT 2 = gốc → 1; khác gốc thiếu tỷ lệ → null; tỷ lệ 0 → null", () => {
    expect(itemQty2Factor({ unit: "pce", factor: null }, "PCE")).toBe("1");
    expect(itemQty2Factor({ unit: "KGM", factor: "0.250000000" }, "PCE")).toBe("0.25");
    expect(itemQty2Factor({ unit: "KGM", factor: null }, "PCE")).toBeNull();
    expect(itemQty2Factor({ unit: "KGM", factor: "0" }, "PCE")).toBeNull();
  });
});

describe("rebaseQty2Factor – đổi gốc", () => {
  it("tỷ lệ mới = cũ × f (1 gốc mới = f gốc cũ), 9 số lẻ", () => {
    // gốc PCE → CTN (1 CTN = 24 PCE): 1 PCE = 0.25 KGM → 1 CTN = 6 KGM.
    expect(rebaseQty2Factor({ unit: "KGM", factor: "0.25" }, "PCE", "CTN", "24")).toBe("6");
    expect(rebaseQty2Factor({ unit: "KGM", factor: "1" }, "PCE", "DZN", "0.0000000003")).toBeNull(); // tròn về 0 → không ghi
    expect(rebaseQty2Factor({ unit: "KGM", factor: "0.1234567891" }, "PCE", "CTN", "1")).toBe("0.123456789");
  });
  it("ĐVT 2 = gốc mới → 1; ĐVT 2 = gốc cũ (tỷ lệ trống) → f", () => {
    expect(rebaseQty2Factor({ unit: "CTN", factor: "0.0416" }, "PCE", "CTN", "24")).toBe("1");
    expect(rebaseQty2Factor({ unit: "PCE", factor: null }, "PCE", "CTN", "24")).toBe("24");
  });
  it("không có ĐVT 2 / thiếu tỷ lệ → null", () => {
    expect(rebaseQty2Factor(null, "PCE", "CTN", "24")).toBeNull();
    expect(rebaseQty2Factor({ unit: "KGM", factor: null }, "PCE", "CTN", "24")).toBeNull();
  });
});

describe("nhập file – ĐVT số lượng 2 + tỷ lệ", () => {
  it("là trường thông tin mặt hàng (chỉ bộ nguồn gốc)", () => {
    expect(ITEM_IMPORT_ITEM_FIELDS).toEqual(expect.arrayContaining(["qty2Unit", "qty2Factor"]));
  });
  it("tự đoán cột theo tên", () => {
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "ĐVT", "ĐVT số lượng 2", "Tỷ lệ SL2"])).toEqual({ code: 0, name: 1, unit: 2, qty2Unit: 3, qty2Factor: 4 });
    expect(detectItemColumns(["Code", "Name", "Unit", "Second unit", "Qty2 factor"])).toEqual({ code: 0, name: 1, unit: 2, qty2Unit: 3, qty2Factor: 4 });
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "ĐVT 2", "Tỷ lệ số lượng 2"])).toEqual({ code: 0, name: 1, qty2Unit: 2, qty2Factor: 3 });
    expect(detectItemColumns(["Mã hàng", "Tên hàng", "ĐVT SL2", "unit 2"])).toMatchObject({ qty2Unit: 2 });
  });
  it("kiểm ô: tỷ lệ > 0, bắt buộc khi ĐVT 2 khác ĐVT dòng, ĐVT 2 = ĐVT dòng → tỷ lệ 1, ĐVT lạ", () => {
    const rows = [
      { code: "A", name: "a", unit: "PCE", qty2Unit: "kgm", qty2Factor: "0,25" },
      { code: "B", name: "b", unit: "PCE", qty2Unit: "pce" },
      { code: "C", name: "c", unit: "PCE", qty2Unit: "KGM" },
      { code: "D", name: "d", unit: "PCE", qty2Unit: "KGM", qty2Factor: "0" },
      { code: "E", name: "e", qty2Factor: "2" },
      { code: "F", name: "f", unit: "PCE", qty2Unit: "ZZZ", qty2Factor: "1" },
    ];
    const r = validateItemRows(rows, { knownUnits: new Set(["PCE", "KGM"]) });
    expect(r.errors).toEqual([
      { row: 3, field: "qty2Factor", code: "MISSING" },
      { row: 4, field: "qty2Factor", code: "INVALID_FORMAT" },
      { row: 5, field: "qty2Unit", code: "MISSING" },
      { row: 6, field: "qty2Unit", code: "UNKNOWN_UNIT" },
    ]);
    expect(r.ok).toEqual([
      { code: "A", name: "a", unit: "PCE", fields: { qty2Unit: "KGM", qty2Factor: "0.25" } },
      { code: "B", name: "b", unit: "PCE", fields: { qty2Unit: "PCE", qty2Factor: "1" } },
    ]);
  });
  it("schema: tỷ lệ > 0; sửa mặt hàng nhận ĐVT 2 viết hoa hoặc null", () => {
    expect(CatalogItemFieldsSchema.safeParse({ qty2Unit: "KGM", qty2Factor: "0.25" }).success).toBe(true);
    expect(CatalogItemFieldsSchema.safeParse({ qty2Factor: "0" }).success).toBe(false);
    expect(UpdateItemInputSchema.parse({ qty2Unit: " kgm ", qty2Factor: "0.25" })).toEqual({ qty2Unit: "KGM", qty2Factor: "0.25" });
    expect(UpdateItemInputSchema.parse({ qty2Unit: null, qty2Factor: null })).toEqual({ qty2Unit: null, qty2Factor: null });
    expect(UpdateItemInputSchema.safeParse({ qty2Factor: "-1" }).success).toBe(false);
  });
});

describe("tờ khai – HAG_QN2/QT2 từ quantity2", () => {
  it("itemDefaults: có quantity2 → SL2/ĐVT2 theo danh mục; không có → SL1 / ĐVT dòng", () => {
    const it0 = { lineNo: 1, quantity: "100", unit: "PCE" };
    expect(itemDefaults("IDA", { ...it0, quantity2: { qty: "25", unit: "KGM" } }, { currency: "USD" })).toMatchObject({ HAG_QN2: "25", HAG_QT2: "KGM", HAG_TSC: "PCE" });
    expect(itemDefaults("EDA", { ...it0, quantity2: { qty: "25", unit: "KGM" } }, { currency: "USD" })).toMatchObject({ HAG_QN2: "25", HAG_QT2: "KGM" });
    expect(itemDefaults("IDA", it0, { currency: "USD" })).toMatchObject({ HAG_QN2: "100", HAG_QT2: "PCE" });
  });
  it("itemFormValues: ô người khai đã nhập vẫn thắng", () => {
    const item = { id: "li1", description: "x", quantity: "100", unit: "PCE", unitPrice: "1", amount: "100", origin: "CN", quantity2: { qty: "25", unit: "KGM" } };
    expect(itemFormValues("IDA", [item], { currency: "USD" })[0]).toMatchObject({ HAG_QN2: "25", HAG_QT2: "KGM", HAG_QN1: "100" });
    expect(itemFormValues("IDA", [item], { currency: "USD", fields: [{ code: "HANG.li1.HAG_QN2", value: "30" }] })[0]).toMatchObject({ HAG_QN2: "30", HAG_QT2: "KGM" });
  });
  it("ảnh chụp đã gửi: có quantity2 thì so (đổi sau khi gửi bị bắt); không có thì không thêm khóa (ảnh chụp cũ vẫn khớp)", () => {
    const base = { fields: {}, adjustments: [], containers: [], currency: "USD" };
    const none = sentSnapshotOf({ ...base, items: [{ id: "li1", lineNo: 1, quantity: "1" }] });
    expect(none.lines).not.toContain("quantity2");
    const a = sentSnapshotOf({ ...base, items: [{ id: "li1", lineNo: 1, quantity: "1", quantity2: { qty: "2", unit: "KGM" } }] });
    const b = sentSnapshotOf({ ...base, items: [{ id: "li1", lineNo: 1, quantity: "1", quantity2: { qty: "2.5", unit: "KGM" } }] });
    expect(a.lines).toContain("quantity2");
    expect(a).not.toEqual(none);
    expect(b.lines).not.toEqual(a.lines);
  });
});
