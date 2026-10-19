import { describe, expect, it } from "vitest";
import { fieldEditBlock, itemDefaults, itemFieldClass, itemFieldCode, itemFieldIssue, itemFieldMeta, itemInputKeys, itemOverrides, parseItemFieldCode } from "./index.js";

describe("itemFieldClass – ô dòng hàng sửa ở đâu", () => {
  it("số liệu chứng từ → OCR; mã HS, thuế suất NK → luồng HS; mã tiền đơn giá → tự điền; còn lại người khai nhập", () => {
    for (const k of ["HAG_CMN", "HAG_QN1", "HAG_QT1", "HAG_BPR", "HAG_UPR", "HAG_OR"]) expect(itemFieldClass("IDA", k)).toBe("DOC");
    expect(itemFieldClass("EDA", "APP_XUAT_XU")).toBe("DOC");
    expect(itemFieldClass("IDA", "HAG_CMD")).toBe("HS");
    expect(itemFieldClass("IDA", "HAG_TXA")).toBe("HS");
    expect(itemFieldClass("EDA", "HAG_TXA")).toBe("INPUT");
    expect(itemFieldClass("IDA", "HAG_UPC")).toBe("DERIVED");
    for (const k of ["HAG_ORS", "HAG_RE", "HAG_TX5", "HAG_QN2", "HAG_GZC"]) expect(itemFieldClass("IDA", k)).toBe("INPUT");
    expect(itemInputKeys("IDA")).toEqual(expect.arrayContaining(["HAG_ORS", "HAG_RE", "HAG_TX1"]));
    expect(itemInputKeys("IDA")).not.toContain("HAG_CMN");
  });
});

describe("mã lưu ô dòng hàng theo id dòng", () => {
  it("HANG.<id>.<ô> ↔ id + ô; chỉ nhận ô người khai nhập", () => {
    expect(parseItemFieldCode(itemFieldCode("li_01.a", "HAG_ORS"))).toEqual({ itemId: "li_01.a", key: "HAG_ORS" });
    expect(parseItemFieldCode("SO_HD")).toBeNull();
    expect(itemFieldMeta("IDA", "HANG.li_1.HAG_RE")).toMatchObject({ itemId: "li_1", key: "HAG_RE", no: "1.92" });
    expect(itemFieldMeta("IDA", "HANG.li_1.HAG_CMN")).toBeNull();
    expect(itemFieldMeta("IDA", "HANG.li_1.NOPE")).toBeNull();
  });
  it("itemOverrides chỉ lấy ô của đúng dòng", () => {
    const fields = [{ code: "HANG.a.HAG_ORS", value: "B06" }, { code: "HANG.b.HAG_ORS", value: "B01" }, { code: "SO_HD", value: "X" }];
    expect(itemOverrides(fields, "a")).toEqual({ HAG_ORS: "B06" });
  });
  it("sửa đổi bổ sung: ô dòng hàng không thuộc nhóm bị khóa theo Phụ lục II; đã thông quan khóa", () => {
    expect(fieldEditBlock("IDA", "HANG.a.HAG_RE", "AMEND", [])).toBeNull();
    expect(fieldEditBlock("IDA", "HANG.a.HAG_RE", "LOCKED", [])).toMatch(/AMA/);
  });
  it("kiểm tra kiểu / độ dài theo đặc tả FPT", () => {
    expect(itemFieldIssue("IDA", "HAG_QN2", "1,5")).toMatch(/số/);
    expect(itemFieldIssue("IDA", "HAG_QN2", "1.5")).toBeNull();
    expect(itemFieldIssue("IDA", "APP_FOC", "bất kỳ")).toBeNull();
  });
});

describe("itemDefaults – giá trị tự điền khi truyền", () => {
  it("IDA: lượng (2) = lượng (1), mã tiền, mã biểu thuế theo FTA (FTA chưa có mã → bỏ trống), mã GTGT theo thuế suất", () => {
    expect(itemDefaults("IDA", { lineNo: 1, quantity: "10", unit: "", vatRate: "8", policyNote: "Ưu đãi AKFTA" }, { currency: "USD" })).toEqual({ HAG_QN2: "10", HAG_QT2: "PCE", HAG_UPC: "USD", HAG_TSC: "PCE", HAG_ORS: "B06", HAG_TX5: "VB903" });
    expect(itemDefaults("IDA", { lineNo: 1, quantity: "1", unit: "KGM", policyNote: "EVFTA" }, { currency: "EUR" })).not.toHaveProperty("HAG_ORS");
  });
  it("EDA: mã văn bản pháp luật theo dòng từ VBPQ", () => {
    expect(itemDefaults("EDA", { lineNo: 2, quantity: "1", unit: "PCE" }, { currency: "USD", vbpq: "XK; 2: GP", lineNos: [1, 2] })).toMatchObject({ HAG_OL1: "XK", HAG_OL2: "GP" });
  });
});
