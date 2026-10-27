import { describe, expect, it } from "vitest";
import { withCustomFields } from "../catalog/index.js";
import { ClassifyResultSchema, EXTRACTION_SCHEMA_VERSION, extractionSchemaFor, fillMissingNullable, InvoiceExtractionSchema } from "./index.js";

const invoice = {
  invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
  seller: { name: "HANSOL PRECISION CO., LTD.", address: "Changwon, Korea", taxCode: null, country: "KR" },
  buyer: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: "Hai Phong", taxCode: "0316789012", country: "VN" },
  incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T 30 days", poNo: "AP-2609-114",
  items: [{ lineNo: 1, description: "Vòng bi cầu 6205-2RS", hsCodeOnInvoice: "8482.10.1000", quantity: 2000, unit: "PCE", unitPrice: 1.85, amount: 3700, origin: "KR" }],
  grossWeightKg: 3860.5, packages: 48, uncertainties: ["vessel"],
};
/** Hóa đơn đủ trường v2 (structured output luôn trả đủ key). */
const invoiceV2 = { ...invoice, incotermPlace: null, originStatement: null, items: invoice.items.map((i) => ({ ...i, partNo: null })) };

describe("contract extraction", () => {
  it("InvoiceExtractionSchema chấp nhận mẫu và từ chối quantity là chuỗi", () => {
    expect(InvoiceExtractionSchema.parse(invoiceV2).items[0]?.quantity).toBe(2000);
    expect(InvoiceExtractionSchema.safeParse({ ...invoiceV2, items: [{ ...invoiceV2.items[0], quantity: "2000" }] }).success).toBe(false);
  });
  it("mọi trường bắt buộc nhưng nullable: thiếu key → lỗi, null → ok", () => {
    const { poNo: _omit, ...missing } = invoiceV2;
    expect(InvoiceExtractionSchema.safeParse(missing).success).toBe(false);
    expect(InvoiceExtractionSchema.safeParse({ ...invoiceV2, poNo: null }).success).toBe(true);
  });
  it("extractionSchemaFor trả schema cho từng loại chứng từ; OTHER → schema tối thiểu", () => {
    for (const k of ["INVOICE", "PACKING_LIST", "BILL_OF_LADING", "AIR_WAYBILL", "CERT_OF_ORIGIN", "SALES_CONTRACT", "ARRIVAL_NOTICE", "FREIGHT_INVOICE", "OTHER"] as const) {
      expect(extractionSchemaFor(k)).toBeDefined();
    }
  });
  it("ClassifyResultSchema từ chối page 0 và kind lạ", () => {
    expect(ClassifyResultSchema.safeParse({ documents: [{ kind: "INVOICE", pages: [0], isDuplicateCopy: false, supplierHint: null }] }).success).toBe(false);
    expect(ClassifyResultSchema.safeParse({ documents: [{ kind: "FOO", pages: [1], isDuplicateCopy: false, supplierHint: null }] }).success).toBe(false);
    expect(ClassifyResultSchema.parse({ documents: [{ kind: "INVOICE", pages: [1, 2], isDuplicateCopy: false, supplierHint: "HANSOL" }] }).documents).toHaveLength(1);
  });
});

describe("schema v2 (chuẩn trường chứng từ)", () => {
  const keys = (kind: Parameters<typeof extractionSchemaFor>[0]) => Object.keys((extractionSchemaFor(kind) as unknown as { shape: Record<string, unknown> }).shape);
  it("Arrival Notice có MB/L, kho, số kiện, trọng lượng, chuyến bay, ghi chú", () => {
    for (const k of ["masterBillNo", "transportMode", "flightNo", "portOfLoading", "packages", "packageUnit", "grossWeightKg", "warehouseCode", "warehouseName", "note"]) expect(keys("ARRIVAL_NOTICE")).toContain(k);
  });
  it("C/O có ô 3 (tuyến), ô 9 (số lượng/trọng lượng), ô 12 (chữ ký + dấu)", () => {
    for (const k of ["departureDate", "transportName", "portOfLoading", "portOfDischarge", "packagesDescription", "quantityOrWeight", "certified"]) expect(keys("CERT_OF_ORIGIN")).toContain(k);
  });
  it("Invoice có nơi điều kiện giao hàng, Made in, Part No theo dòng; B/L, AWB có nơi phát hành; hóa đơn cước có số vận đơn", () => {
    expect(keys("INVOICE")).toEqual(expect.arrayContaining(["incotermPlace", "originStatement"]));
    expect(Object.keys(InvoiceExtractionSchema.shape.items.element.shape)).toContain("partNo");
    expect(keys("BILL_OF_LADING")).toEqual(expect.arrayContaining(["placeOfIssue", "dateOfIssue"]));
    expect(keys("AIR_WAYBILL")).toEqual(expect.arrayContaining(["flightDate", "placeOfIssue"]));
    expect(keys("FREIGHT_INVOICE")).toContain("billRef");
    expect(EXTRACTION_SCHEMA_VERSION).toBe(3);
  });
  it("trường mới là bắt buộc + nullable: thiếu key → lỗi (structured output ổn định), null → hợp lệ", () => {
    const v2 = { ...invoice, incotermPlace: null, originStatement: null, items: invoice.items.map((i) => ({ ...i, partNo: null })) };
    expect(InvoiceExtractionSchema.safeParse(v2).success).toBe(true);
    expect(InvoiceExtractionSchema.safeParse(invoice).success).toBe(false);
  });
});

describe("fillMissingNullable", () => {
  it("điền null cho key nullable bị thiếu (cả trong dòng hàng) → dữ liệu v1 parse được bằng schema v2", () => {
    const filled = fillMissingNullable(InvoiceExtractionSchema, invoice);
    expect(filled).toMatchObject({ incotermPlace: null, originStatement: null, items: [{ partNo: null }] });
    expect(InvoiceExtractionSchema.safeParse(filled).success).toBe(true);
  });
  it("không đụng key không nullable và không ghi đè giá trị có sẵn", () => {
    const { items: _i, ...noItems } = invoiceV2;
    const filled = fillMissingNullable(InvoiceExtractionSchema, { ...noItems, incotermPlace: "SHENZHEN" }) as Record<string, unknown>;
    expect(filled["items"]).toBeUndefined();
    expect(filled["incotermPlace"]).toBe("SHENZHEN");
  });
  it("thiếu cả object trường bổ sung (custom) → điền object toàn null để parse được", () => {
    const schema = withCustomFields(InvoiceExtractionSchema, [{ key: "lc_no", label: "Số L/C", aliases: [], type: "text" }]);
    const filled = fillMissingNullable(schema, invoiceV2) as Record<string, unknown>;
    expect(filled["custom"]).toEqual({ lc_no: null });
    expect(schema.safeParse(filled).success).toBe(true);
  });
  it("giá trị không phải object → trả nguyên", () => {
    expect(fillMissingNullable(InvoiceExtractionSchema, "x")).toBe("x");
  });
});
