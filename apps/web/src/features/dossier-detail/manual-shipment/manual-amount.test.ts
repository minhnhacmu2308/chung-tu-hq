import { describe, expect, it } from "vitest";
import { lineAmount, manualTotal } from "./manual-amount";

describe("thành tiền nhập tay (khớp backend)", () => {
  it("làm tròn half-up 2 số lẻ, không lỗi số thực, không tràn số", () => {
    expect(lineAmount("1000", "1.255")).toBe("1255.00");
    expect(lineAmount("3", "0.1")).toBe("0.30");
    expect(lineAmount("1", "0.005")).toBe("0.01");
    expect(lineAmount("123456789", "98765.4321")).toBe("12193263111263.53");
    expect(lineAmount("abc", "1")).toBeNull();
    expect(manualTotal([{ quantity: "1000", unitPrice: "1.255" }, { quantity: "3", unitPrice: "0.1" }])).toBe("1255.30");
  });
});
