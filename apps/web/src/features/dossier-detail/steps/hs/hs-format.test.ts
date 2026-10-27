import { describe, expect, it } from "vitest";
import { formatRates, formatTax, hsBusy, hsTone, normalizeHsInput, trimRate } from "./hs-format";

const cand = (over: Partial<Parameters<typeof formatTax>[0] & object> = {}) => ({ code: "8483.40.90", description: "", confidence: 0.83, whyNot: null, importRate: "5", basis: "MFN" as const, agreement: null, vatRate: "10", ...over });

describe("hs-format", () => {
  it("formatTax: MFN, FTA kèm hiệp định, thiếu thuế", () => {
    expect(formatTax(cand())).toBe("5% · 10%");
    expect(formatTax(cand({ importRate: "0", basis: "FTA", agreement: "ACFTA" }))).toBe("0% (ACFTA) · 10%");
    expect(formatTax(cand({ vatRate: null }))).toBe("5% · —");
    expect(formatTax(cand({ importRate: null }))).toBe("—");
    expect(formatTax(null)).toBe("—");
  });
  it("hsTone: tin cậy < 60% hoặc có cảnh báo → warning", () => {
    expect(hsTone(0.83, [])).toBe("neutral");
    expect(hsTone(0.59, [])).toBe("warning");
    expect(hsTone(0.9, ["Kiểm tra lại"])).toBe("warning");
  });
  it("hsBusy: đang chờ / đang phân loại / đang gửi trả lời", () => {
    expect(["queued", "processing", "answering"].every((s) => hsBusy(s as never))).toBe(true);
    expect(hsBusy("need_info")).toBe(false);
  });
  it("normalizeHsInput: 8 số (có/không dấu chấm) → xxxx.xx.xx; sai → null", () => {
    expect(normalizeHsInput("84834090")).toBe("8483.40.90");
    expect(normalizeHsInput(" 8483.40.90 ")).toBe("8483.40.90");
    expect(normalizeHsInput("8483.40")).toBeNull();
  });
  it("formatRates (mã đã xác nhận): thiếu thuế suất → —", () => {
    expect(formatRates("5", "10")).toBe("5% · 10%");
    expect(formatRates(undefined, "10")).toBe("— · 10%");
    expect(formatRates(undefined, undefined)).toBe("—");
  });
  it("thuế suất bỏ số 0 thừa của DB: 0.000000 → 0, 10.000000 → 10, 7.50 → 7.5", () => {
    expect(trimRate("0.000000")).toBe("0");
    expect(trimRate("10.000000")).toBe("10");
    expect(trimRate("7.50")).toBe("7.5");
    expect(trimRate("10")).toBe("10");
    expect(formatRates("0.000000", "10.000000")).toBe("0% · 10%");
    expect(formatTax(cand({ importRate: "0.000000", basis: "FTA", agreement: "ACFTA", vatRate: "10.000000" }))).toBe("0% (ACFTA) · 10%");
  });
});
