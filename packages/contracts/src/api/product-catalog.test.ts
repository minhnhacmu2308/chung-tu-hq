import { describe, expect, it } from "vitest";
import { codeFromProductName, normalizeProductName, ProductCatalogInputSchema, productKey } from "./product-catalog.js";

describe("danh mục hàng hóa – khóa mặt hàng", () => {
  it("chuẩn hóa tên: chữ thường, gộp khoảng trắng, bỏ 'Hàng mới 100%' và dấu câu thừa ở cuối", () => {
    expect(normalizeProductName("  Nước hoa  YSL Libre EDP 90ml, 145612. Hàng mới 100%")).toBe("nước hoa ysl libre edp 90ml, 145612");
    expect(normalizeProductName("Túi nhựa LAG nhỏ, hàng mới 100%.")).toBe("túi nhựa lag nhỏ");
    expect(normalizeProductName("Rượu JACK DANIELS 1L")).toBe(normalizeProductName("rượu jack daniels 1l"));
  });
  it("khóa: theo mã hàng (không phân biệt hoa thường) nếu có, không thì theo tên chuẩn hóa", () => {
    expect(productKey(" ab12 ", "x")).toBe("code:AB12");
    expect(productKey(null, "Rượu Jack Daniels 1L. Hàng mới 100%")).toBe("name:rượu jack daniels 1l");
    expect(productKey("", "A")).toBe("name:a");
  });
  it("mã hàng lẫn cuối tên: chỉ nhận dãy số ngay trước 'Hàng mới 100%'", () => {
    expect(codeFromProductName("Nước hoa hiệu YSL (YSL Libre Wf EDP 90ml), 145612. Hàng mới 100%")).toBe("145612");
    expect(codeFromProductName("Johnnie Walker 50ml, nồng độ cồn 40%. 100870. Hàng mới 100%")).toBe("100870");
    expect(codeFromProductName("Bộ nước hoa Ck WF Mini Set 2 X 10 Ml, 163859. Mới 100%")).toBe("163859");
    expect(codeFromProductName("Túi nhựa LBL001, kích thước 44cm x 62cm, hàng mới 100%")).toBeNull();
  });
  it("form: HS nhận dạng có dấu chấm, thuế suất có %, xuất xứ chữ thường; sai định dạng bị từ chối", () => {
    const extra = { envTaxRate: "", exciseRate: "", safeguardRate: "", antiDiscriminationRate: "", description: "", unit2: "", unitPrice: "", currency: "", partner: "" };
    const extraNull = Object.fromEntries(Object.keys(extra).map((k) => [k, null]));
    expect(ProductCatalogInputSchema.parse({ code: "", name: " A ", hsCode: "3303.00.00", unit: "", origin: "fr", tariffSchedule: "", importDutyRate: "18%", vatRate: "7,5", note: "", ...extra }))
      .toEqual({ code: null, name: "A", hsCode: "33030000", unit: null, origin: "FR", tariffSchedule: null, importDutyRate: "18", vatRate: "7.5", note: null, ...extraNull });
    const base = { code: "", name: "A", hsCode: "33030000", unit: "", origin: "", tariffSchedule: "", importDutyRate: "", vatRate: "", note: "", ...extra };
    expect(ProductCatalogInputSchema.parse({ ...base, unitPrice: " 1 234,5 ", currency: "usd", exciseRate: "65%" })).toMatchObject({ unitPrice: "1234.5", currency: "USD", exciseRate: "65" });
    expect(ProductCatalogInputSchema.safeParse({ ...base, currency: "US" }).success).toBe(false);
    expect(ProductCatalogInputSchema.safeParse({ ...base, unitPrice: "abc" }).success).toBe(false);
    expect(ProductCatalogInputSchema.safeParse({ ...base, hsCode: "3303" }).success).toBe(false);
    expect(ProductCatalogInputSchema.safeParse({ ...base, origin: "FRA" }).success).toBe(false);
    expect(ProductCatalogInputSchema.safeParse({ ...base, importDutyRate: "abc" }).success).toBe(false);
    expect(ProductCatalogInputSchema.safeParse({ ...base, name: " " }).success).toBe(false);
  });
});
