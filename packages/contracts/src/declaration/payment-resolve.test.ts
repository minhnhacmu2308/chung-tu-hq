import { describe, expect, it } from "vitest";
import { parsePaymentChoice, paymentChoiceValue, paymentNeedsChoice, reconcilePayment, resolvePayment } from "./payment-resolve.js";

describe("payment-resolve", () => {
  it("mã chuẩn người khai chọn (kể cả mã không có chữ nhận diện như GV, BIENMAU) → đúng mã, không nghi ngờ", () => {
    expect(resolvePayment("GV")).toEqual({ code: "GV", name: "Góp vốn" });
    expect(resolvePayment("BIENMAU")?.code).toBe("BIENMAU");
    expect(resolvePayment("KC – Bitcoin")).toEqual({ code: "KC", name: "Khác (bao gồm cả TT)" });
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
  it("reconcilePayment: AI chọn mã, regex kiểm chéo; lệch hoặc chỉ một bên có → cần xem", () => {
    expect(reconcilePayment("T/T 30 days", "KC", null)).toMatchObject({ code: "KC" });
    expect(reconcilePayment("T/T 30 days", "KC", null)?.suspect).toBeUndefined();
    expect(reconcilePayment("Irrevocable documentary credit at sight", "LC", null)).toMatchObject({
      code: "LC", suspect: true, note: "Chứng từ ghi “Irrevocable documentary credit at sight”: hệ thống không nhận ra mã, AI nhận là LC – chọn mã đúng",
    });
    // Một tên hiển thị cho cùng mã dù mã đến từ regex, người khai chọn hay AI / số L/C.
    expect(reconcilePayment(null, null, "S700542640040")?.name).toBe(resolvePayment("L/C at sight")?.name);
    expect(resolvePayment("LC")?.name).toBe(resolvePayment("L/C at sight")?.name);
    expect(reconcilePayment(null, null, "S700542640040")).toMatchObject({ code: "LC", suspect: true });
    expect(reconcilePayment("L/C at sight", "TTR", null)).toMatchObject({ code: "LC", suspect: true, note: "Chứng từ ghi “L/C at sight”: hệ thống đọc ra LC, AI nhận là TTR – chọn mã đúng" });
    expect(reconcilePayment("LC", "TTR", null)).toEqual(expect.objectContaining({ code: "LC" }));
    expect(reconcilePayment("LC", "TTR", null)?.suspect).toBeUndefined();
    expect(reconcilePayment(null, null, null)).toBeNull();
    // Số L/C là tín hiệu LC: T/T mà có số L/C → cần xem, giữ mã regex.
    expect(reconcilePayment("T/T 30 days", null, "S700542640040")).toMatchObject({ code: "KC", suspect: true });
    expect(paymentNeedsChoice("L/C at sight", "TTR")).toBe(true);
    expect(paymentNeedsChoice(null, null, "S700542640040")).toBe(true);
  });
});
