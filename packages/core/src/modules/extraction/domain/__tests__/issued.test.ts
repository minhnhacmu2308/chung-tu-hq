// ADR 0013 mục 3 – hóa đơn thương mại: bản nội dung, ghép số vào Shipment; lô nhiều invoice khi gộp chứng từ.
import { DEFAULT_INVOICE_LAYOUT, emptyShipment, ManualShipmentSchema } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { applyIssued, buildSnapshot } from "../issued.js";
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
