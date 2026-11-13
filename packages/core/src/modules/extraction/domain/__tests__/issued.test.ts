// ADR 0013 mục 3 – hóa đơn thương mại: bản nội dung, ghép số vào Shipment; lô nhiều invoice khi gộp chứng từ.
import { DEFAULT_INVOICE_LAYOUT, emptyShipment, ManualShipmentSchema } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { applyIssued, buildSnapshot, printLine } from "../issued.js";
import { applyManual } from "../manual.js";
import { mergeExtractions, type FileExtraction } from "../merge.js";

const SELLER = { name: "CONG TY AN PHAT", taxCode: "0316789012" };
const X = { layout: DEFAULT_INVOICE_LAYOUT, declarationNo: "306123456780", marks: "NTG" };
const manual = () =>
  applyManual(
    emptyShipment(),
    ManualShipmentSchema.parse({
      buyer: { name: "NORDIC TOOLING GROUP AB", country: "se" },
      invoice: { incoterm: "FOB", currency: "USD" },
      transport: { packages: "12", packageUnit: "PK", grossWeightKg: "860.5" },
      items: [
        { description: "Drill bit 10mm", quantity: "1000", unit: "PCE", unitPrice: "1.255", hsOnInvoice: "82075000" },
        { description: "Drill bit 12mm", quantity: "3", unit: "PCE", unitPrice: "0.335" },
      ],
    }),
  );

describe("buildSnapshot", () => {
  it("đủ dữ liệu → bản nội dung: tổng = Σ thành tiền dòng làm tròn 2 số lẻ; ngày invoice = ngày phát hành khi lô hàng chưa có", () => {
    const r = buildSnapshot(manual(), SELLER, "2026-11-10", X);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.invoice).toMatchObject({ date: "2026-11-10", currency: "USD", incoterm: "FOB", totalAmount: "1256.01" });
    expect(r.snapshot.items.map((i) => i.amount)).toEqual(["1255.00", "1.01"]);
    expect(r.snapshot.items[0]).toMatchObject({ lineNo: 1, hsCode: "82075000", unit: "PCE" });
    expect(r.snapshot.buyer).toMatchObject({ name: "NORDIC TOOLING GROUP AB", country: "SE" });
    expect(r.snapshot.transport).toMatchObject({ packages: "12", packageUnit: "PK", grossWeightKg: "860.5" });
    expect(r.snapshot.seller).toEqual(SELLER);
    expect(r.snapshot).toMatchObject({ declarationNo: "306123456780", marks: "NTG", layout: DEFAULT_INVOICE_LAYOUT, signatory: null, extra: { lcNo: null } });
  });

  it("thiếu dữ liệu → liệt kê lý do, không phát hành bừa", () => {
    expect(buildSnapshot(emptyShipment(), SELLER, "2026-11-10", X)).toEqual({ ok: false, blockers: ["NO_ITEMS", "NO_CURRENCY", "NO_BUYER"] });
    const s = manual();
    s.items[1]!.unitPrice.value = null;
    s.items[1]!.amount.value = null;
    expect(buildSnapshot(s, SELLER, "2026-11-10", X)).toEqual({ ok: false, blockers: ["ITEM_INCOMPLETE"] });
  });

});

describe("applyIssued", () => {
  it("điền số + ngày invoice vào Shipment, đánh dấu đã phát hành", () => {
    const s = applyIssued(manual(), { no: "INV2611-001", date: "2026-11-10" });
    expect(s.invoice.no).toMatchObject({ value: "INV2611-001", status: "USER_CONFIRMED" });
    expect(s.invoice.date.value).toBe("2026-11-10");
    expect(s.issuedInvoice).toEqual({ no: "INV2611-001", date: "2026-11-10" });
  });

  it("invoice tải lên ghi số khác → CONFLICT kèm ghi chú; null → chưa phát hành", () => {
    const s = manual();
    s.invoice.no = { value: "OLD-1", sources: [{ documentId: "doc_inv", kind: "INVOICE", page: 1, raw: "OLD-1", normalized: "OLD-1" }], status: "SINGLE_SOURCE" };
    applyIssued(s, { no: "INV2611-001", date: "2026-11-10" });
    expect(s.invoice.no.status).toBe("CONFLICT");
    expect(s.invoice.no.note).toContain("OLD-1");
    expect(applyIssued(manual(), null).issuedInvoice).toBeNull();
  });
});

describe("gộp chứng từ – lô nhiều invoice", () => {
  const inv = (id: string, no: string, total: number, items: { d: string; q: number; p: number; a: number }[]): FileExtraction => ({
    documentId: id, kind: "INVOICE", pages: 1,
    data: { invoiceNo: no, invoiceDate: "2026-11-01", currency: "USD", totalAmount: total, items: items.map((x, i) => ({ lineNo: i + 1, description: x.d, quantity: x.q, unit: "PCE", unitPrice: x.p, amount: x.a })), uncertainties: [] },
  });

  it("dòng hàng nối từ mọi invoice theo thứ tự, đánh số lại liên tục; tổng = Σ tổng các invoice", () => {
    const s = mergeExtractions([inv("doc_1", "A-1", 300, [{ d: "X", q: 1, p: 100, a: 100 }, { d: "Y", q: 2, p: 100, a: 200 }]), inv("doc_2", "A-2", 50.5, [{ d: "Z", q: 1, p: 50.5, a: 50.5 }])], { version: 1 });
    expect(s.items.map((i) => [i.lineNo, i.description.value])).toEqual([[1, "X"], [2, "Y"], [3, "Z"]]);
    expect(s.items[2]!.description.sources[0]!.documentId).toBe("doc_2");
    expect(s.invoice.totalAmount).toMatchObject({ value: "350.5", status: "SINGLE_SOURCE", note: "Tổng 2 hóa đơn" });
  });

  it("một invoice: giữ số dòng trên chứng từ, tổng như cũ", () => {
    const s = mergeExtractions([inv("doc_1", "A-1", 300, [{ d: "X", q: 1, p: 300, a: 300 }])], { version: 1 });
    expect(s.items).toHaveLength(1);
    expect(s.invoice.totalAmount.value).toBe("300");
    expect(s.invoice.totalAmount.note).toBeUndefined();
  });
});

describe("buildSnapshot – in mã hàng theo bộ mã (ADR 0015, Review Focus 4)", () => {
  const withItems = (items: Record<string, unknown>[]) =>
    applyManual(emptyShipment(), ManualShipmentSchema.parse({ buyer: { name: "NORDIC TOOLING GROUP AB" }, invoice: { currency: "USD" }, items }));
  const line = (o: Record<string, unknown> = {}) => ({ description: "Cable", quantity: "1000", unit: "M", unitPrice: "1.25", partNo: "OCR-1", catalogItemId: "cat_1", ...o });
  const CAT = {
    cat_1: { itemNo: "MH-000001", baseUnit: "M", conversion: { base: "M", factors: { ROLL: "100" } }, code: { code: "VT-0012", unit: "ROLL" } },
  };

  it("in theo bộ Kế toán: mã kế toán + lượng/ĐVT/đơn giá quy đổi sang ĐVT của mã, thành tiền không đổi; ảnh chụp lưu đủ 4 trường", () => {
    const r = buildSnapshot(withItems([line()]), SELLER, "2026-11-10", { ...X, print: CAT });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.snapshot.items[0]).toMatchObject({
      catalogItemId: "cat_1", printedCode: "VT-0012", printedUnit: "ROLL", printedQuantity: "10", printedUnitPrice: "125",
      quantity: "1000", unit: "M", amount: "1250.00",
    });
    expect(r.warnings).toEqual([]);
  });

  it("mặt hàng chưa có mã trong bộ → in mã nối (không để trống), giữ lượng/ĐVT gốc", () => {
    const r = buildSnapshot(withItems([line()]), SELLER, "2026-11-10", { ...X, print: { cat_1: { ...CAT.cat_1, code: null } } });
    if (!r.ok) throw new Error("not ok");
    expect(r.snapshot.items[0]).toMatchObject({ printedCode: "MH-000001", printedUnit: "M", printedQuantity: "1000", printedUnitPrice: null });
  });

  it("ĐVT của mã khác ĐVT gốc mà thiếu hệ số → giữ lượng/ĐVT gốc (không nhân 1) + cảnh báo theo dòng", () => {
    const r = buildSnapshot(withItems([line({ unit: "M" })]), SELLER, "2026-11-10", {
      ...X, print: { cat_1: { ...CAT.cat_1, conversion: { base: "M", factors: {} } } },
    });
    if (!r.ok) throw new Error("not ok");
    expect(r.snapshot.items[0]).toMatchObject({ printedCode: "VT-0012", printedUnit: "M", printedQuantity: "1000", printedUnitPrice: null });
    expect(r.warnings).toEqual([{ lineNo: 1, code: "UNIT_FACTOR_MISSING" }]);
  });

  it("dòng không gắn danh mục (hoặc danh mục không có thông tin) → như cũ: Part No đọc từ chứng từ, lượng/ĐVT gốc", () => {
    const r = buildSnapshot(withItems([line({ catalogItemId: null }), line({ catalogItemId: "cat_gone" })]), SELLER, "2026-11-10", { ...X, print: CAT });
    if (!r.ok) throw new Error("not ok");
    for (const it of r.snapshot.items) expect(it).toMatchObject({ printedCode: "OCR-1", printedUnit: "M", printedQuantity: "1000", printedUnitPrice: null });
    expect(r.snapshot.items[0]!.catalogItemId).toBeNull();
    expect(r.warnings).toEqual([]);
  });

  it("không truyền print (không nối danh mục) → như cũ", () => {
    const r = buildSnapshot(withItems([line()]), SELLER, "2026-11-10", X);
    if (!r.ok) throw new Error("not ok");
    expect(r.snapshot.items[0]).toMatchObject({ printedCode: "OCR-1", printedUnit: "M", printedQuantity: "1000" });
  });
});

describe("printLine – đơn giá theo ĐVT in (không cắt sai số 0)", () => {
  const price = (unitPrice: string, factors: Record<string, string>) =>
    printLine(
      { partNo: null, quantity: "300", unit: "M", unitPrice, catalogItemId: "c" },
      { itemNo: "MH-1", baseUnit: "M", conversion: { base: "M", factors }, code: { code: "X", unit: "BOX" } },
    ).line.printedUnitPrice;
  it.each([
    ["125", "100", "1.25"],
    ["125", "1", "125"],
    ["125", "10", "12.5"],
    ["1", "8", "0.125"],
    ["1", "3", "0.333333"],
    ["1", "0.5", "2"],
    ["1.25", "0.01", "125"],
  ])("unitPrice %s chia hệ số %s → %s", (unitPrice, factor, expected) => {
    // 1 BOX = 1/factor M  (qty in BOX = qty_M * from/to → factor = 1 / boxFactor)
    expect(price(unitPrice, { BOX: String(1 / Number(factor)) })).toBe(expected);
  });
});
