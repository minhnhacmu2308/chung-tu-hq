import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words.js";

describe("amountInWords", () => {
  it.each([
    ["1250.50", "USD", "SAY: US DOLLARS ONE THOUSAND TWO HUNDRED FIFTY AND CENTS FIFTY ONLY"],
    ["0", "USD", "SAY: US DOLLARS ZERO ONLY"],
    ["0.05", "USD", "SAY: US DOLLARS ZERO AND CENTS FIVE ONLY"],
    ["1000000.01", "EUR", "SAY: EUROS ONE MILLION AND CENTS ONE ONLY"],
    ["1234567890.5", "USD", "SAY: US DOLLARS ONE BILLION TWO HUNDRED THIRTY FOUR MILLION FIVE HUNDRED SIXTY SEVEN THOUSAND EIGHT HUNDRED NINETY AND CENTS FIFTY ONLY"],
    ["1500", "JPY", "SAY: JAPANESE YEN ONE THOUSAND FIVE HUNDRED ONLY"],
    ["10.5", "GBP", "SAY: POUNDS STERLING TEN AND PENCE FIFTY ONLY"],
    ["7", "XYZ", "SAY: XYZ SEVEN ONLY"],
    ["100", "usd", "SAY: US DOLLARS ONE HUNDRED ONLY"],
    ["11.00", "USD", "SAY: US DOLLARS ELEVEN ONLY"],
  ])("%s %s", (amount, cur, expected) => {
    expect(amountInWords(amount, cur)).toBe(expected);
  });
  it("số rất lớn không mất chính xác", () => {
    expect(amountInWords("999999999999.99", "USD")).toBe(
      "SAY: US DOLLARS NINE HUNDRED NINETY NINE BILLION NINE HUNDRED NINETY NINE MILLION NINE HUNDRED NINETY NINE THOUSAND NINE HUNDRED NINETY NINE AND CENTS NINETY NINE ONLY",
    );
  });
  it("I2: tiền không có đơn vị lẻ (JPY) mà tổng có lẻ → không lỗi, ghi phần lẻ dạng /100", () => {
    expect(amountInWords("7.04", "JPY")).toBe("SAY: JAPANESE YEN SEVEN AND 04/100 ONLY");
    expect(amountInWords("1500.5", "VND")).toBe("SAY: VIETNAMESE DONG ONE THOUSAND FIVE HUNDRED AND 50/100 ONLY");
  });
  it("âm, không phải số, quá 2 số lẻ → lỗi", () => {
    for (const bad of ["-1", "abc", "1.005"]) expect(() => amountInWords(bad, "USD")).toThrow();
  });
});
