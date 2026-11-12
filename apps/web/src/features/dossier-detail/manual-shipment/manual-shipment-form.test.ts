import { describe, expect, it } from "vitest";
import { emptyItem, formFromData, itemFromProduct, normalizeNumber, toInput } from "./manual-shipment-form";

const base = () => formFromData(null, { currency: "USD", incoterm: "FOB" });

describe("form nhập tay lô hàng", () => {
  it("form trống: tiền tệ / điều kiện giao hàng lấy theo hồ sơ, một dòng hàng trống", () => {
    expect(base()).toMatchObject({ currency: "USD", incoterm: "FOB", items: [emptyItem()] });
  });

  it("số: dấu chấm thập phân, dấu phẩy phân cách nghìn (như khối Chi phí)", () => {
    expect(normalizeNumber("1,250.5")).toBe("1250.5");
    expect(normalizeNumber(" 3 ")).toBe("3");
    expect(normalizeNumber("1.000")).toBe("1.000");
  });

  it("hợp lệ: bỏ dòng trống, mã viết hoa, container tách theo dấu phẩy/khoảng trắng, HS chỉ giữ chữ số", () => {
    const f = { ...base(), buyerName: "NORDIC AB", buyerCountry: "se", containers: "onyu1234567, tcnu7654321", items: [
      { ...emptyItem(), description: "Drill bit", quantity: "1,000", unit: "PCE", unitPrice: "1.25", hsOnInvoice: "8207.50.00", origin: "vn" },
      emptyItem(),
    ] };
    const r = toInput(f);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.buyer?.country).toBe("SE");
    expect(r.value.transport?.containers).toEqual([{ no: "ONYU1234567" }, { no: "TCNU7654321" }]);
    expect(r.value.items).toEqual([expect.objectContaining({ quantity: "1000", unitPrice: "1.25", hsOnInvoice: "82075000", origin: "VN" })]);
  });

  it("lỗi theo ô, chỉ số dòng theo form (kể cả khi có dòng trống phía trước)", () => {
    const f = { ...base(), grossWeightKg: "abc", invoiceDate: "05/11/2026", items: [emptyItem(), { ...emptyItem(), description: "X", quantity: "0", unit: "", unitPrice: "-1" }] };
    const r = toInput(f);
    expect(r).toEqual({ ok: false, errors: { grossWeightKg: "number", invoiceDate: "date", "items.1.quantity": "positive", "items.1.unit": "required", "items.1.unitPrice": "nonNegative" } });
  });

  it("chọn từ danh mục hàng hóa: điền tên/mã/HS/đơn vị/xuất xứ, giữ số lượng và đơn giá", () => {
    const row = { ...emptyItem(), quantity: "10", unitPrice: "2" };
    const p = { id: "prd_1", code: "DB-10", name: "Drill bit 10mm", hsCode: "82075000", unit: "PCE", origin: "VN" } as Parameters<typeof itemFromProduct>[1];
    expect(itemFromProduct(row, p)).toEqual({ description: "Drill bit 10mm", partNo: "DB-10", hsOnInvoice: "82075000", unit: "PCE", origin: "VN", quantity: "10", unitPrice: "2", catalogItemId: "prd_1" });
  });
});
