import { describe, expect, it } from "vitest";
import { InvoiceExtractionSchema } from "../extraction/index.js";
import { CreateSkillInputSchema } from "../api/skill.js";
import { catalogSkillFields, customFieldsOf, nextSkillCode, resolveSkillFieldKey, withCustomFields } from "./index.js";

const field = (key: string, type: "string" | "decimal" | "date" | "code" | "party" | "items" = "string", extract = true) => ({ key, label: key, type, required: false, aliases: [`${key} label`], extract, display: true });

describe("resolveSkillFieldKey", () => {
  it("key danh mục (camelCase) hoặc snake_case/tên cũ quy về trường chuẩn", () => {
    expect(resolveSkillFieldKey("INVOICE", "invoiceNo")).toEqual({ key: "invoiceNo", standard: true });
    expect(resolveSkillFieldKey("INVOICE", "invoice_no")).toEqual({ key: "invoiceNo", standard: true });
    expect(resolveSkillFieldKey("BILL_OF_LADING", "bl_no")).toEqual({ key: "billNo", standard: true });
    expect(resolveSkillFieldKey("AIR_WAYBILL", "airport_departure")).toEqual({ key: "airportOfDeparture", standard: true });
    expect(resolveSkillFieldKey("ARRIVAL_NOTICE", "warehouse")).toEqual({ key: "warehouseName", standard: true });
  });
  it("key không có trong danh mục → trường bổ sung riêng, giữ nguyên key", () => {
    expect(resolveSkillFieldKey("INVOICE", "bank_info")).toEqual({ key: "bank_info", standard: false });
    expect(resolveSkillFieldKey("INVOICE", "lcNo")).toEqual({ key: "lcNo", standard: false });
  });
});

describe("customFieldsOf + withCustomFields", () => {
  it("chỉ lấy trường bổ sung đang bật đọc; kiểu decimal→number, date→date, còn lại text", () => {
    const defs = customFieldsOf("INVOICE", [field("invoiceNo"), field("lc_no"), field("lc_amount", "decimal"), field("lc_date", "date"), field("bank_info", "party", false)]);
    expect(defs.map((d) => [d.key, d.type])).toEqual([["lc_no", "text"], ["lc_amount", "number"], ["lc_date", "date"]]);
  });
  it("schema có thêm object custom đúng kiểu; không có trường bổ sung thì giữ nguyên schema", () => {
    const defs = customFieldsOf("INVOICE", [field("lc_no"), field("lc_amount", "decimal")]);
    const s = withCustomFields(InvoiceExtractionSchema, defs);
    const shape = (s as unknown as { shape: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).shape;
    expect(shape["custom"]!.safeParse({ lc_no: "LC-1", lc_amount: 12.5 }).success).toBe(true);
    expect(shape["custom"]!.safeParse({ lc_no: "LC-1", lc_amount: "x" }).success).toBe(false);
    expect(shape["custom"]!.safeParse({ lc_no: null, lc_amount: null }).success).toBe(true);
    expect(withCustomFields(InvoiceExtractionSchema, [])).toBe(InvoiceExtractionSchema);
  });
});

describe("tạo skill mới", () => {
  it("catalogSkillFields: trường chuẩn + danh sách lặp, đổi kiểu danh mục sang kiểu trường skill, đều là trường chuẩn", () => {
    const fields = catalogSkillFields("INVOICE");
    expect(fields[0]).toEqual({ key: "invoiceNo", label: "Số hóa đơn", type: "code", required: false, aliases: ["Inv. No", "Invoice No", "Invoice Number", "PI No", "Proforma Invoice No"], extract: true, display: true });
    expect(fields.find((f) => f.key === "totalAmount")?.type).toBe("decimal");
    expect(fields.find((f) => f.key === "paymentTerms")?.type).toBe("string");
    expect(fields.at(-1)).toMatchObject({ key: "items", type: "items" });
    expect(fields.every((f) => resolveSkillFieldKey("INVOICE", f.key).standard)).toBe(true);
    expect(catalogSkillFields("OTHER").map((f) => f.key)).toEqual(["title", "summary"]);
  });
  it("nextSkillCode: số nhỏ nhất chưa dùng, từ 2", () => {
    expect(nextSkillCode("INVOICE", ["SK-INV-GEN"])).toBe("SK-INV-2");
    expect(nextSkillCode("INVOICE", ["SK-INV-2", "SK-INV-4"])).toBe("SK-INV-3");
    expect(nextSkillCode("CERT_OF_ORIGIN", [])).toBe("SK-CO-2");
  });
  it("CreateSkillInputSchema: chuẩn hóa mặc định; nhà cung cấp theo loại; mã SK-…; parse lại bản đã chuẩn hóa ra chính nó", () => {
    const out = CreateSkillInputSchema.parse({ name: "  Invoice mới ", kind: "DOCUMENT", docKind: "INVOICE", code: "sk-inv-x" });
    expect(out).toEqual({ name: "Invoice mới", kind: "DOCUMENT", docKind: "INVOICE", supplier: null, language: "Đa ngôn ngữ", code: "SK-INV-X", copyFromSkillId: null });
    expect(CreateSkillInputSchema.parse(out)).toEqual(out);
    expect(CreateSkillInputSchema.safeParse({ name: "Inv", kind: "SUPPLIER", docKind: "INVOICE" }).success).toBe(false);
    expect(CreateSkillInputSchema.safeParse({ name: "Inv", kind: "DOCUMENT", docKind: "INVOICE", supplier: "HANSOL" }).success).toBe(false);
    expect(CreateSkillInputSchema.safeParse({ name: "Inv", kind: "DOCUMENT", docKind: "INVOICE", code: "INV-1" }).success).toBe(false);
    expect(CreateSkillInputSchema.safeParse({ name: "Inv", kind: "DOCUMENT", docKind: "INVOICE", code: "SK--X" }).success).toBe(false);
  });
});
