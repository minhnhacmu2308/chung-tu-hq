import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newOrderCode, paymentRequestSignature, payosDescription, payosSignData, verifyWebhookSignature, webhookSignature } from "../payos.js";

const KEY = "checksum-key-test";
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

describe("chữ ký PayOS", () => {
  it("tạo link: HMAC-SHA256 của amount&cancelUrl&description&orderCode&returnUrl (theo alphabet)", () => {
    const p = { orderCode: 123456789, amount: 250000, description: "KB123456789", returnUrl: "https://app/settings?tab=plan&payment=pay_1", cancelUrl: "https://app/settings?tab=plan&payment=pay_1" };
    expect(paymentRequestSignature(KEY, p)).toBe(
      hmac("amount=250000&cancelUrl=https://app/settings?tab=plan&payment=pay_1&description=KB123456789&orderCode=123456789&returnUrl=https://app/settings?tab=plan&payment=pay_1"),
    );
  });
  it("webhook: key sắp alphabet, null/undefined thành chuỗi rỗng", () => {
    const data = { orderCode: 123, amount: 3000, description: "KB123", accountNumber: "12345678", reference: "TF230204212323", transactionDateTime: "2023-02-04 18:25:00", currency: "VND", paymentLinkId: "124c33293c43417ab7879e14c8d9eb18", code: "00", desc: "Thành công", counterAccountBankId: null, counterAccountName: undefined };
    expect(payosSignData(data)).toBe(
      "accountNumber=12345678&amount=3000&code=00&counterAccountBankId=&counterAccountName=&currency=VND&desc=Thành công&description=KB123&orderCode=123&paymentLinkId=124c33293c43417ab7879e14c8d9eb18&reference=TF230204212323&transactionDateTime=2023-02-04 18:25:00",
    );
    const sig = webhookSignature(KEY, data);
    expect(sig).toBe(hmac(payosSignData(data)));
    expect(verifyWebhookSignature(KEY, data, sig)).toBe(true);
    expect(verifyWebhookSignature(KEY, data, sig.toUpperCase())).toBe(true);
  });
  it("sai chữ ký / sửa dữ liệu / sai khóa / chữ ký rác → false", () => {
    const data = { orderCode: 1, amount: 25000, code: "00" };
    const sig = webhookSignature(KEY, data);
    expect(verifyWebhookSignature(KEY, { ...data, amount: 1 }, sig)).toBe(false);
    expect(verifyWebhookSignature("khac", data, sig)).toBe(false);
    expect(verifyWebhookSignature(KEY, data, "abc")).toBe(false);
    expect(verifyWebhookSignature(KEY, data, "")).toBe(false);
  });
  it("mô tả ≤ 25 ký tự; mã đơn là số nguyên dương ≤ 2^53", () => {
    expect(payosDescription(999_999_999_999_999)).toBe("KB999999999999999");
    expect(payosDescription(999_999_999_999_999).length).toBeLessThanOrEqual(25);
    const c = newOrderCode(Date.UTC(2026, 10, 7), 0.42 * 1000);
    expect(Number.isSafeInteger(c) && c > 0).toBe(true);
    expect(newOrderCode(1e12 * 5, 0)).toBe(1);
  });
});
