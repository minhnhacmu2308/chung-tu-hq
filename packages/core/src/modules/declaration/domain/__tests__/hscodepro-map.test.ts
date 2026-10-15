import type { HsResult } from "@kb/contracts";
import { describe, expect, it } from "vitest";
import { candidatesFromResult, chunk, coFormFor, formatHs, ratesFromCandidate, toHsRequestItems, type HsLineInput } from "../hscodepro-map.js";

const line = (over: Partial<HsLineInput> = {}): HsLineInput => ({ lineNo: 1, description: "Vít me bi SFU1605, dài 600 mm", quantity: "100", unit: "PCE", amount: "2840.50", origin: "TW", invoiceHsCode: "8483.40", ...over });
const TAX = (rate: number, basis: "MFN" | "FTA" = "MFN", agreement: string | null = null) => ({ import: { rate, basis, agreement }, vat: { rate: 10, note: null }, source_date: "2026-10-15" });
const RESULT: HsResult = {
  hs_code: "84834090", hs_description: "Loại khác", confidence: 83, reasoning: "Vít me bi …", legal_basis: ["Quy tắc 1"], warnings: [], tax: TAX(5),
  alternatives: [{ hs_code: "84669390", hs_description: "Loại khác", confidence: 12, why_not: "Chỉ đúng khi là bộ phận chuyên dùng", tax: TAX(0) }],
};

describe("hscodepro-map", () => {
  it("formatHs: 8 số → xxxx.xx.xx; đã có dấu chấm giữ nguyên", () => {
    expect(formatHs("84834090")).toBe("8483.40.90");
    expect(formatHs("8483.40.90")).toBe("8483.40.90");
  });
  it("coFormFor: chuẩn hóa mẫu C/O về bảng co_form; ngoài bảng → null", () => {
    expect(coFormFor("FORM E")).toBe("E");
    expect(coFormFor("form AK")).toBe("AK");
    expect(coFormFor("e")).toBe("E");
    expect(coFormFor("EVFTA")).toBe("EUR.1");
    expect(coFormFor("RCEP")).toBeNull();
    expect(coFormFor(null)).toBeNull();
  });
  it("toHsRequestItems: xuất xứ dự phòng, bỏ dòng thiếu xuất xứ/mô tả ngắn, cắt 1000 ký tự, value_usd chỉ khi USD", () => {
    const r = toHsRequestItems([
      line(),
      line({ lineNo: 2, origin: "", description: "Deep groove ball bearing" }),
      line({ lineNo: 3, description: "ab" }),
      line({ lineNo: 4, description: "x".repeat(1500), origin: "cn" }),
    ], { invoiceCurrency: "USD", fallbackOrigin: "CN", coForm: "FORM E" });
    expect(r.items[0]).toEqual({ line_no: 1, description: "Vít me bi SFU1605, dài 600 mm", origin_country: "TW", quantity: 100, unit: "PCE", value_usd: 2840.5, invoice_hs: "8483.40", co_form: "E" });
    expect(r.items[1]).toMatchObject({ line_no: 2, origin_country: "CN" });
    expect(r.items[2]!.description).toHaveLength(1000);
    expect(r.items[2]!.origin_country).toBe("CN");
    expect(r.skipped).toEqual([{ lineNo: 3, code: "SHORT_DESCRIPTION", message: expect.stringContaining("Mô tả") }]);
    const noFallback = toHsRequestItems([line({ origin: "" })], { invoiceCurrency: "EUR", fallbackOrigin: null, coForm: null });
    expect(noFallback.items).toEqual([]);
    expect(noFallback.skipped[0]).toMatchObject({ lineNo: 1, code: "NO_ORIGIN" });
    const eur = toHsRequestItems([line()], { invoiceCurrency: "EUR", fallbackOrigin: null, coForm: null });
    expect(eur.items[0]).not.toHaveProperty("value_usd");
    expect(eur.items[0]!.co_form).toBeNull();
  });
  it("candidatesFromResult: gợi ý chính rồi mã thay thế; tin cậy 0–1; thuế dạng chuỗi", () => {
    expect(candidatesFromResult(RESULT)).toEqual([
      { code: "8483.40.90", description: "Loại khác", confidence: 0.83, whyNot: null, importRate: "5", basis: "MFN", agreement: null, vatRate: "10" },
      { code: "8466.93.90", description: "Loại khác", confidence: 0.12, whyNot: "Chỉ đúng khi là bộ phận chuyên dùng", importRate: "0", basis: "MFN", agreement: null, vatRate: "10" },
    ]);
    expect(candidatesFromResult({ ...RESULT, tax: null, alternatives: [] })[0]).toMatchObject({ importRate: null, basis: null, vatRate: null });
  });
  it("ratesFromCandidate: XK và loại hình miễn thuế giữ quy tắc phía mình; FTA ghi hiệp định; không có thuế → null + ghi chú", () => {
    const [c] = candidatesFromResult({ ...RESULT, tax: TAX(0, "FTA", "ACFTA") });
    expect(ratesFromCandidate(c!, { direction: "XK", typeCode: "B11" })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFromCandidate(c!, { direction: "NK", typeCode: "E31" })).toMatchObject({ importDutyRate: "0", vatRate: "0" });
    expect(ratesFromCandidate(c!, { direction: "NK", typeCode: "A11" })).toMatchObject({ importDutyRate: "0", vatRate: "10", policyNote: expect.stringContaining("ACFTA") });
    expect(ratesFromCandidate(null, { direction: "NK", typeCode: "A11" })).toMatchObject({ importDutyRate: null, vatRate: null, policyNote: expect.stringContaining("Chưa có thuế suất") });
  });
  it("ratesFromCandidate: có thuế NK nhưng thiếu VAT → ghi chú cảnh báo VAT (không âm thầm thành 0%)", () => {
    const [c] = candidatesFromResult({ ...RESULT, tax: { ...TAX(5), vat: { rate: null, note: null } } });
    expect(ratesFromCandidate(c!, { direction: "NK", typeCode: "A11" })).toMatchObject({ importDutyRate: "5", vatRate: null, policyNote: expect.stringContaining("VAT") });
  });
  it("chunk: chia lô 50", () => {
    expect(chunk(Array.from({ length: 120 }, (_, i) => i), 50).map((c) => c.length)).toEqual([50, 50, 20]);
  });
});
