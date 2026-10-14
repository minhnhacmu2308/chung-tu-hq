import { describe, expect, it } from "vitest";
import { dec, sumDec, toDecimalString } from "./decimal.js";

describe("decimal", () => {
  it("cộng tiền không sai số float", () => {
    expect(toDecimalString(dec("0.1").plus(dec("0.2")), 2)).toBe("0.30");
  });
  it("sumDec cộng danh sách chuỗi", () => {
    expect(toDecimalString(sumDec(["1.10", "2.20", "3.30"]), 2)).toBe("6.60");
  });
  it("toDecimalString làm tròn ROUND_HALF_UP", () => {
    expect(toDecimalString(dec("2.345"), 2)).toBe("2.35");
    expect(toDecimalString(dec("2.344"), 2)).toBe("2.34");
  });
  it("dec từ chối chuỗi không hợp lệ", () => {
    expect(() => dec("1,5")).toThrow();
  });
});
