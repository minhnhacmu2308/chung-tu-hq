import { describe, expect, it } from "vitest";
import { parsePaymentChoice, paymentChoiceValue, paymentNeedsChoice, resolvePayment } from "./payment-resolve.js";

describe("payment-resolve", () => {
  it("mã chuẩn người khai chọn (kể cả mã không có chữ nhận diện như GV, BIENMAU) → đúng mã, không nghi ngờ", () => {
    expect(resolvePayment("GV")).toEqual({ code: "GV", name: "Góp vốn" });
    expect(resolvePayment("BIENMAU")?.code).toBe("BIENMAU");
    expect(resolvePayment("KC – Bitcoin")).toEqual({ code: "KC", name: "Khác (bao gồm cả thanh toán bằng hình thức TT)" });
    expect(parsePaymentChoice("KC – T/T 30 days")).toEqual({ code: "KC", detail: "T/T 30 days" });
    expect(parsePaymentChoice("XYZ")).toBeNull();
  });
  it("paymentNeedsChoice: chỉ khi có chữ mà không nhận ra mã; nhận ra (T/T → KC) hoặc trống → không bắt chọn", () => {
    expect(paymentNeedsChoice("Payment by crypto")).toBe(true);
    expect(paymentNeedsChoice("T/T 30 days after B/L date")).toBe(false);
    expect(paymentNeedsChoice("LC")).toBe(false);
    expect(paymentNeedsChoice("")).toBe(false);
    expect(paymentNeedsChoice(null)).toBe(false);
  });
  it("paymentChoiceValue: KC giữ chữ gốc trên chứng từ (chọn lại không lồng); mã khác lưu đúng mã", () => {
    expect(paymentChoiceValue("KC", "Payment by crypto")).toBe("KC – Payment by crypto");
    expect(paymentChoiceValue("KC", "KC – Payment by crypto")).toBe("KC – Payment by crypto");
    expect(paymentChoiceValue("LC", "KC – Payment by crypto")).toBe("LC");
    expect(paymentChoiceValue("KC", "")).toBe("KC");
  });
});
