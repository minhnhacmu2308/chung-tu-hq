import { describe, expect, it } from "vitest";
import { applyCorrections, rawPathOf, supplierOf } from "../review-learning.js";

const row = (shipmentPath: string, originalValue: string, value: string, status = "USER_CONFIRMED") => ({ key: shipmentPath, label: shipmentPath, value, originalValue, status, shipmentPath });

describe("review-learning", () => {
  it("rawPathOf: trường OCR → chỗ trong dữ liệu model theo loại chứng từ", () => {
    expect(rawPathOf("INVOICE", "/invoice/no")).toBe("invoiceNo");
    expect(rawPathOf("BILL_OF_LADING", "/parties/seller/name")).toBe("shipper.name");
    expect(rawPathOf("INVOICE", "/parties/buyer/taxCode")).toBe("buyer.taxCode");
    expect(rawPathOf("INVOICE", "/items/2/hsOnInvoice")).toBe("items.2.hsCodeOnInvoice");
    expect(rawPathOf("INVOICE", "/items/0/quantity")).toBe("items.0.quantity");
    expect(rawPathOf("INVOICE", "/transport/billNo")).toBeNull();
  });

  it("applyCorrections: chỉ giá trị người dùng sửa; giữ kiểu số; tạo object bên khi model không đọc được; không đổi dữ liệu gốc", () => {
    const data = { invoiceNo: "INV-1", totalAmount: 100, seller: null, items: [{ quantity: 2, description: "Bolt" }] };
    const { data: out, corrections } = applyCorrections("INVOICE", data, [
      row("/invoice/no", "INV-1", "INV-01"),
      row("/invoice/totalAmount", "100", "120.5"),
      row("/parties/seller/name", "", "ACME CO., LTD"),
      row("/items/0/quantity", "2", "3"),
      row("/items/5/quantity", "1", "9"),
      row("/invoice/date", "2026-01-01", "2026-01-02", "SINGLE_SOURCE"),
      row("/invoice/poNo", "PO1", "PO1"),
    ]);
    expect(out).toEqual({ invoiceNo: "INV-01", totalAmount: 120.5, seller: { name: "ACME CO., LTD" }, items: [{ quantity: 3, description: "Bolt" }] });
    expect(corrections.map((c) => c.rawPath)).toEqual(["invoiceNo", "totalAmount", "seller.name", "items.0.quantity"]);
    expect(data.invoiceNo).toBe("INV-1");
  });

  it("supplierOf: bên bán theo loại chứng từ, không có thì shipper/exporter", () => {
    expect(supplierOf("INVOICE", { seller: { name: " ACME " } })).toBe("ACME");
    expect(supplierOf("BILL_OF_LADING", { shipper: { name: "ZETA" } })).toBe("ZETA");
    expect(supplierOf("PACKING_LIST", { seller: { name: "PL SELLER" } })).toBe("PL SELLER");
    expect(supplierOf("INVOICE", { seller: null })).toBeNull();
  });
});
