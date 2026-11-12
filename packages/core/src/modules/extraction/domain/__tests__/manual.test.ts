import { emptyShipment, ManualShipmentSchema, type ManualShipmentInput } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { applyManual, lineAmount, manualChanges, manualTotal } from "../manual.js";

const m = (i: ManualShipmentInput) => ManualShipmentSchema.parse(i);
const BASE = m({
  buyer: { name: "NORDIC TOOLING GROUP AB", country: "se" },
  invoice: { incoterm: "fob", currency: "usd", date: "2026-11-05" },
  transport: { grossWeightKg: "1250.5", containers: [{ no: "onyu1234567" }] },
  items: [
    { description: "Drill bit 10mm", quantity: "1000", unit: "pce", unitPrice: "1.255" },
    { description: "Drill bit 12mm", quantity: "3", unit: "PCE", unitPrice: "0.1", origin: "vn", hsOnInvoice: "82075000" },
  ],
});

describe("contract ManualShipmentSchema", () => {
  it("ô rỗng → null; số lượng 0, đơn giá âm, thiếu tên hàng → lỗi", () => {
    expect(m({ buyer: { name: "" } }).buyer.name).toBeNull();
    const bad = ManualShipmentSchema.safeParse({ items: [{ description: "", quantity: "0", unit: "PCE", unitPrice: "-1" }] });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues.map((x) => x.path.join("."))).toEqual(["items.0.description", "items.0.quantity", "items.0.unitPrice"]);
    expect(ManualShipmentSchema.safeParse({ items: [{ description: "X", quantity: "0.001", unit: "KGM", unitPrice: "0" }] }).success).toBe(true);
  });
});

describe("thành tiền (Decimal, làm tròn 2 số lẻ)", () => {
  it("1000 × 1.255 = 1255.00; 3 × 0.1 = 0.30 (không lỗi số thực); tổng = Σ dòng đã làm tròn", () => {
    expect(lineAmount("1000", "1.255")).toBe("1255.00");
    expect(lineAmount("3", "0.1")).toBe("0.30");
    expect(lineAmount("1", "0.005")).toBe("0.01");
    expect(manualTotal(BASE)).toBe("1255.30");
  });
});

describe("applyManual", () => {
  it("hồ sơ chưa có chứng từ: điền thông tin chung + dòng hàng, trạng thái USER_CONFIRMED, mã viết hoa", () => {
    const s = applyManual(emptyShipment(), BASE);
    expect(s.parties.buyer.name).toMatchObject({ value: "NORDIC TOOLING GROUP AB", status: "USER_CONFIRMED", sources: [] });
    expect(s.parties.buyer.country.value).toBe("SE");
    expect(s.invoice.incoterm.value).toBe("FOB");
    expect(s.invoice.currency.value).toBe("USD");
    expect(s.invoice.totalAmount.value).toBe("1255.30");
    expect(s.invoice.no.value).toBeNull();
    expect(s.transport.containers).toEqual([{ no: "ONYU1234567", sealNo: null, size: null }]);
    expect(s.items.map((it) => [it.lineNo, it.unit.value, it.amount.value, it.origin.value])).toEqual([[1, "PCE", "1255.00", null], [2, "PCE", "0.30", "VN"]]);
  });

  it("chứng từ đến sau khác số nhập tay → giữ số nhập tay, CONFLICT + ghi chú; trùng → USER_CONFIRMED", () => {
    const s = emptyShipment();
    s.transport.grossWeightKg = { value: "1300", sources: [{ documentId: "d1", kind: "BILL_OF_LADING", page: 1, raw: "1,300 KGS", normalized: "1300" }], status: "SINGLE_SOURCE" };
    s.invoice.date = { value: "2026-11-05", sources: [{ documentId: "d2", kind: "INVOICE", page: 1, raw: "05/11/2026", normalized: "2026-11-05" }], status: "SINGLE_SOURCE" };
    applyManual(s, BASE);
    expect(s.transport.grossWeightKg).toMatchObject({ value: "1250.5", status: "CONFLICT", note: expect.stringMatching(/BILL_OF_LADING.*1300/) });
    expect(s.invoice.date).toMatchObject({ value: "2026-11-05", status: "USER_CONFIRMED" });
  });

  it("ô để trống / không nhập dòng hàng → không xóa dữ liệu chứng từ", () => {
    const s = emptyShipment();
    s.transport.vessel = { value: "SITC HAIPHONG", sources: [], status: "SINGLE_SOURCE" };
    s.items = applyManual(emptyShipment(), BASE).items;
    applyManual(s, m({ buyer: { name: "X" } }));
    expect(s.transport.vessel.value).toBe("SITC HAIPHONG");
    expect(s.items).toHaveLength(2);
    expect(applyManual(emptyShipment(), null).parties.buyer.name.value).toBeNull();
  });
});

describe("manualChanges (field_audit)", () => {
  it("lần đầu: mọi ô có giá trị; lần sau: chỉ ô đổi, dòng hàng thêm/bớt", () => {
    const first = manualChanges(null, BASE);
    expect(first).toContainEqual({ key: "/parties/buyer/name", oldValue: "", newValue: "NORDIC TOOLING GROUP AB" });
    expect(first).toContainEqual({ key: "/items/2/hsOnInvoice", oldValue: "", newValue: "82075000" });
    expect(first.some((c) => c.key === "/invoice/poNo")).toBe(false);
    const next = m({ ...BASE, buyer: { ...BASE.buyer, name: "NORDIC AB" }, items: [BASE.items[0]!] });
    const diff = manualChanges(BASE, next);
    expect(diff).toContainEqual({ key: "/parties/buyer/name", oldValue: "NORDIC TOOLING GROUP AB", newValue: "NORDIC AB" });
    expect(diff).toContainEqual({ key: "/items/2/description", oldValue: "Drill bit 12mm", newValue: "" });
    expect(diff.some((c) => c.key.startsWith("/items/1/"))).toBe(false);
    expect(manualChanges(BASE, BASE)).toEqual([]);
  });
});
