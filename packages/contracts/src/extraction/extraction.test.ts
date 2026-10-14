import { describe, expect, it } from "vitest";
import { ClassifyResultSchema, EXTRACTION_SCHEMA_VERSION, extractionSchemaFor, InvoiceExtractionSchema } from "./index.js";

const invoice = {
  invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
  seller: { name: "HANSOL PRECISION CO., LTD.", address: "Changwon, Korea", taxCode: null, country: "KR" },
  buyer: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: "Hai Phong", taxCode: "0316789012", country: "VN" },
  incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T 30 days", poNo: "AP-2609-114",
  items: [{ lineNo: 1, description: "Vòng bi cầu 6205-2RS", hsCodeOnInvoice: "8482.10.1000", quantity: 2000, unit: "PCE", unitPrice: 1.85, amount: 3700, origin: "KR" }],
  grossWeightKg: 3860.5, packages: 48, uncertainties: ["vessel"],
};

describe("contract extraction", () => {
  it("InvoiceExtractionSchema chấp nhận mẫu và từ chối quantity là chuỗi", () => {
    expect(InvoiceExtractionSchema.parse(invoice).items[0]?.quantity).toBe(2000);
    expect(InvoiceExtractionSchema.safeParse({ ...invoice, items: [{ ...invoice.items[0], quantity: "2000" }] }).success).toBe(false);
  });
  it("mọi trường bắt buộc nhưng nullable: thiếu key → lỗi, null → ok", () => {
    const { poNo: _omit, ...missing } = invoice;
    expect(InvoiceExtractionSchema.safeParse(missing).success).toBe(false);
    expect(InvoiceExtractionSchema.safeParse({ ...invoice, poNo: null }).success).toBe(true);
  });
  it("extractionSchemaFor trả schema cho từng loại chứng từ; OTHER → schema tối thiểu", () => {
    for (const k of ["INVOICE", "PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL", "CERT_OF_ORIGIN", "SALES_CONTRACT", "ARRIVAL_NOTICE", "FREIGHT_INVOICE", "OTHER"] as const) {
      expect(extractionSchemaFor(k)).toBeDefined();
    }
    expect(EXTRACTION_SCHEMA_VERSION).toBe(1);
  });
  it("ClassifyResultSchema từ chối page 0 và kind lạ", () => {
    expect(ClassifyResultSchema.safeParse({ documents: [{ kind: "INVOICE", pages: [0], isDuplicateCopy: false, supplierHint: null }] }).success).toBe(false);
    expect(ClassifyResultSchema.safeParse({ documents: [{ kind: "FOO", pages: [1], isDuplicateCopy: false, supplierHint: null }] }).success).toBe(false);
    expect(ClassifyResultSchema.parse({ documents: [{ kind: "INVOICE", pages: [1, 2], isDuplicateCopy: false, supplierHint: "HANSOL" }] }).documents).toHaveLength(1);
  });
});
