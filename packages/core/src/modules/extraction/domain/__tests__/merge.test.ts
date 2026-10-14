import { describe, expect, it } from "vitest";
import { fieldStatusFromCandidates, isSuspect } from "../field-status.js";
import { mergeExtractions, type FileExtraction } from "../merge.js";
import { projectFields } from "../project-fields.js";

const invoice: FileExtraction = {
  documentId: "doc_inv", kind: "INVOICE", pages: 2,
  data: {
    invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
    seller: { name: "HANSOL PRECISION CO., LTD.", address: "Changwon, Korea", taxCode: null, country: "KR" },
    buyer: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: "Hai Phong", taxCode: "031678901", country: "VN" },
    incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T", poNo: "AP-2609-114",
    items: [
      { lineNo: 1, description: "Vòng bi cầu 6205-2RS", hsCodeOnInvoice: "8482.10.1000", quantity: 2000, unit: "PCS", unitPrice: 1.85, amount: 3700, origin: "KR" },
      { lineNo: 2, description: "Ổ bi đũa côn 30210", hsCodeOnInvoice: null, quantity: 400, unit: "PCS", unitPrice: 6.75, amount: 2700, origin: "KR" },
    ],
    grossWeightKg: 3860.5, packages: 48, uncertainties: ["paymentTerms"],
  },
  regions: { invoiceNo: { page: 1, x: 10, y: 12, w: 30, h: 3 } },
};
const packing: FileExtraction = {
  documentId: "doc_pl", kind: "PACKING_LIST", pages: 1,
  data: { invoiceNo: "HSP-2610-0457", date: "2026-10-02", packages: 48, packageUnit: "PALLET", grossWeightKg: 3860.5, netWeightKg: 3600, volumeCbm: 12.4, marks: "N/M", items: [], uncertainties: [] },
};
const bl: FileExtraction = {
  documentId: "doc_bl", kind: "BILL_OF_LADING", pages: 1,
  data: {
    billNo: "HPSEL2610078", masterBillNo: null, date: "2026-10-05",
    shipper: { name: "HANSOL PRECISION CO., LTD.", address: null, taxCode: null, country: "KR" },
    consignee: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: null, taxCode: null, country: "VN" },
    notifyParty: { name: null, address: null, taxCode: null, country: null },
    vessel: "SITC HAIPHONG", voyage: "2641S", portOfLoading: "BUSAN, KOREA", portOfDischarge: "HO CHI MINH, VIETNAM", placeOfDelivery: "HAI PHONG, VIETNAM",
    containers: [{ no: "CMAU1234452", sealNo: "S1", size: "40HC" }], packages: 48, packageUnit: "PALLETS", grossWeightKg: 3842, freightTerm: "COLLECT", uncertainties: [],
  },
};

describe("fieldStatusFromCandidates", () => {
  it("≥2 nguồn khớp → CROSS_CHECKED; 1 nguồn → SINGLE_SOURCE; khác nhau → CONFLICT kèm note; unsure → MODEL_UNSURE; sai định dạng → INVALID_FORMAT", () => {
    expect(fieldStatusFromCandidates([{ kind: "INVOICE", normalized: "A", raw: "A", unsure: false }, { kind: "PACKING_LIST", normalized: "A", raw: "A", unsure: false }], true).status).toBe("CROSS_CHECKED");
    expect(fieldStatusFromCandidates([{ kind: "INVOICE", normalized: "A", raw: "A", unsure: false }], true).status).toBe("SINGLE_SOURCE");
    const c = fieldStatusFromCandidates([{ kind: "PACKING_LIST", normalized: "3860.50", raw: "3.860,50", unsure: false }, { kind: "BILL_OF_LADING", normalized: "3842", raw: "3842", unsure: false }], true);
    expect(c.status).toBe("CONFLICT");
    expect(c.note).toContain("B/L");
    expect(fieldStatusFromCandidates([{ kind: "INVOICE", normalized: "A", raw: "A", unsure: true }], true).status).toBe("MODEL_UNSURE");
    expect(fieldStatusFromCandidates([{ kind: "INVOICE", normalized: "031678901", raw: "031678901", unsure: false }], false).status).toBe("INVALID_FORMAT");
  });
  it("isSuspect theo ngưỡng: STRICT tính cả SINGLE_SOURCE", () => {
    expect(isSuspect("SINGLE_SOURCE", "BALANCED")).toBe(false);
    expect(isSuspect("SINGLE_SOURCE", "STRICT")).toBe(true);
    expect(isSuspect("MODEL_UNSURE", "RELAXED")).toBe(false);
    expect(isSuspect("CONFLICT", "RELAXED")).toBe(true);
  });
});

describe("mergeExtractions", () => {
  const s = mergeExtractions([invoice, packing, bl], { version: 1, taxCodeValid: (t) => /^\d{10}(\d{3})?$/.test(t) });
  it("số invoice khớp 2 nguồn → CROSS_CHECKED với 2 sources", () => {
    expect(s.invoice.no.value).toBe("HSP-2610-0457");
    expect(s.invoice.no.status).toBe("CROSS_CHECKED");
    expect(s.invoice.no.sources.map((x) => x.kind).sort()).toEqual(["INVOICE", "PACKING_LIST"]);
    expect(s.invoice.no.sources.find((x) => x.kind === "INVOICE")?.region).toEqual({ page: 1, x: 10, y: 12, w: 30, h: 3 });
  });
  it("trọng lượng PL 3860.50 vs B/L 3842 → CONFLICT, giá trị ưu tiên Packing List", () => {
    expect(s.transport.grossWeightKg.status).toBe("CONFLICT");
    expect(s.transport.grossWeightKg.value).toBe("3860.5");
  });
  it("tiền tệ/incoterm/tổng từ invoice; MST người mua 9 số → INVALID_FORMAT; paymentTerms unsure → MODEL_UNSURE", () => {
    expect(s.invoice.totalAmount.value).toBe("20850");
    expect(s.invoice.incoterm.value).toBe("FCA");
    expect(s.parties.buyer.taxCode.status).toBe("INVALID_FORMAT");
    expect(s.invoice.paymentTerms.status).toBe("MODEL_UNSURE");
  });
  it("vận tải từ B/L: số vận đơn, cảng, điểm giao cuối, container; loại kiện PALLETS → PL", () => {
    expect(s.transport.billNo.value).toBe("HPSEL2610078");
    expect(s.transport.portOfDischarge.value).toBe("HO CHI MINH, VIETNAM");
    expect(s.transport.finalDestination.value).toBe("HAI PHONG, VIETNAM");
    expect(s.transport.containers).toEqual([{ no: "CMAU1234452", sealNo: "S1", size: "40HC" }]);
    expect(s.transport.packageUnit.value).toBe("PL");
    expect(s.transport.mode.value).toBe("SEA");
  });
  it("dòng hàng từ invoice với số lượng/đơn giá chuỗi thập phân, đơn vị PCE, xuất xứ KR", () => {
    expect(s.items).toHaveLength(2);
    expect(s.items[0]).toMatchObject({ lineNo: 1, quantity: { value: "2000" }, unit: { value: "PCE" }, unitPrice: { value: "1.85" }, amount: { value: "3700" }, origin: { value: "KR" }, hsOnInvoice: { value: "8482.10.1000" } });
  });
  it("người bán khớp invoice và B/L (shipper) → CROSS_CHECKED; nước KR", () => {
    expect(s.parties.seller.name.status).toBe("CROSS_CHECKED");
    expect(s.parties.seller.country.value).toBe("KR");
  });
  it("documents liệt kê 3 chứng từ; chỉ invoice → không có vận tải (null, SINGLE_SOURCE không nguồn)", () => {
    expect(s.documents.map((d) => d.kind)).toEqual(["INVOICE", "PACKING_LIST", "BILL_OF_LADING"]);
    const only = mergeExtractions([invoice], { version: 2, taxCodeValid: () => true });
    expect(only.transport.billNo.value).toBeNull();
    expect(only.transport.billNo.sources).toEqual([]);
  });
});

describe("projectFields", () => {
  const s = mergeExtractions([invoice, packing, bl], { version: 1, taxCodeValid: (t) => /^\d{10}(\d{3})?$/.test(t) });
  const fields = projectFields(s);
  it("mỗi chứng từ có trường riêng với key ổn định, nhóm đúng, value là giá trị đã chuẩn hóa của chính chứng từ đó", () => {
    const inv = fields.filter((f) => f.documentId === "doc_inv");
    expect(inv.find((f) => f.key === "invoice_no")).toMatchObject({ group: "GENERAL", label: "Số hóa đơn", value: "HSP-2610-0457", status: "CROSS_CHECKED" });
    expect(inv.find((f) => f.key === "buyer_tax_code")).toMatchObject({ group: "PARTIES", status: "INVALID_FORMAT" });
    expect(inv.find((f) => f.key === "item.1.quantity")).toMatchObject({ group: "ITEMS", value: "2000" });
    const blf = fields.filter((f) => f.documentId === "doc_bl");
    expect(blf.find((f) => f.key === "gross_weight")).toMatchObject({ value: "3842", status: "CONFLICT" });
    expect(fields.filter((f) => f.documentId === "doc_pl").find((f) => f.key === "gross_weight")?.value).toBe("3860.5");
  });
  it("trường có region từ model được giữ; shipmentPath trỏ đúng", () => {
    const f = fields.find((x) => x.documentId === "doc_inv" && x.key === "invoice_no");
    expect(f?.region).toEqual({ page: 1, x: 10, y: 12, w: 30, h: 3 });
    expect(f?.shipmentPath).toBe("/invoice/no");
  });
});
