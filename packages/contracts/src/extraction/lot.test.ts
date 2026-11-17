import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { DocKindSchema } from "../common.js";
import { extractionSchemaFor, fillMissingNullable, fromAiOutput, LOT_KEYS, lotSchemaFor, toAiOutputSchema } from "./index.js";

/** Hóa đơn đủ trường (structured output luôn trả đủ key), chưa có `lot`. */
const invoiceFixture = {
  invoiceNo: "HSP-2610-0457", invoiceDate: "2026-10-02",
  seller: { name: "HANSOL PRECISION CO., LTD.", address: "Changwon, Korea", taxCode: null, country: "KR" },
  buyer: { name: "AN PHAT INDUSTRIAL EQUIPMENT CO., LTD", address: "Hai Phong", taxCode: "0316789012", country: "VN" },
  incoterm: "FCA", currency: "USD", totalAmount: 20850, paymentTerms: "T/T 30 days", poNo: "AP-2609-114",
  items: [{ lineNo: 1, description: "Vòng bi cầu 6205-2RS", hsCodeOnInvoice: "8482.10.1000", quantity: 2000, unit: "PCE", unitPrice: 1.85, amount: 3700, origin: "KR", partNo: null }],
  grossWeightKg: 3860.5, packages: 48, incotermPlace: null, originStatement: null, paymentMethodCode: null, uncertainties: [],
  lotContainers: [],
};
type Shape = Record<string, z.ZodType>;
const shapeOf = (s: z.ZodType) => (s as z.ZodObject).shape as Shape;

describe("khối lot", () => {
  it("gửi AI: lot là mảng {key,value} với key thuộc enum của loại", () => {
    const ai = toAiOutputSchema(extractionSchemaFor("INVOICE")) as z.ZodObject;
    const el = (ai.shape.lot as z.ZodArray<z.ZodObject>).element;
    expect((el.shape.key as z.ZodEnum).options).toContain("portOfLoading");
    expect((el.shape.key as z.ZodEnum).options).not.toContain("invoiceNo");
  });
  it("nhận từ AI: mảng → object, ô không có = null, key trùng lấy giá trị đầu, key lạ bỏ", () => {
    const out = fromAiOutput(extractionSchemaFor("INVOICE"), { ...invoiceFixture, lot: [
      { key: "portOfLoading", value: "BA RIA - VUNG TAU (CM-TV), VIETNAM" }, { key: "portOfLoading", value: "X" }, { key: "bogus", value: "Y" }, { key: "lcNo", value: "" } ] }) as any;
    expect(out.lot.portOfLoading).toBe("BA RIA - VUNG TAU (CM-TV), VIETNAM");
    expect(out.lot.lcNo).toBeNull();
    expect(out.lot.vessel).toBeNull();
    expect("bogus" in out.lot).toBe(false);
    expect(extractionSchemaFor("INVOICE").safeParse(out).success).toBe(true);
  });
  it("kết quả cũ v3 (không có lot, lotContainers, paymentMethodCode) vẫn parse sau fillMissingNullable", () => {
    const { lotContainers: _c, paymentMethodCode: _p, ...v3 } = invoiceFixture;
    const filled = fillMissingNullable(extractionSchemaFor("INVOICE"), v3) as any;
    expect(filled.lotContainers).toEqual([]);
    expect(extractionSchemaFor("INVOICE").safeParse(filled).success).toBe(true);
  });
  it.each(DocKindSchema.options)("%s: có lot; lotContainers trừ B/L (giữ containers riêng)", (kind) => {
    const shape = shapeOf(extractionSchemaFor(kind));
    expect(Object.keys(shapeOf(shape.lot!))).toEqual(Object.keys(shapeOf(lotSchemaFor(kind))));
    expect("lotContainers" in shape).toBe(kind !== "BILL_OF_LADING");
  });
  it("key bỏ theo nghĩa: FREIGHT_INVOICE giữ lot.invoiceNo; B/L bỏ cảng/tàu; OTHER giữ đủ", () => {
    expect(Object.keys(shapeOf(lotSchemaFor("FREIGHT_INVOICE")))).toContain("invoiceNo");
    expect(Object.keys(shapeOf(lotSchemaFor("BILL_OF_LADING")))).not.toContain("portOfLoading");
    expect(Object.keys(shapeOf(lotSchemaFor("OTHER")))).toEqual([...LOT_KEYS]);
  });
  it("paymentMethodCode: chỉ nhận mã TK_IVP hoặc null", () => {
    const s = shapeOf(extractionSchemaFor("INVOICE")).paymentMethodCode!;
    expect(s.safeParse("LC").success).toBe(true);
    expect(s.safeParse(null).success).toBe(true);
    expect(s.safeParse("TT").success).toBe(false);
  });
});
