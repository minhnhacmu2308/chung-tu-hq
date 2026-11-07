import { describe, expect, it } from "vitest";
import { createPaymentGateway } from "./index.js";

const keys = { PAYOS_CLIENT_ID: "c", PAYOS_API_KEY: "k", PAYOS_CHECKSUM_KEY: "s", PAYOS_API_URL: "https://api-merchant.payos.vn" };

describe("createPaymentGateway – fail-closed", () => {
  it("payos → PayOS thật; fake → giả lập; none → không có cổng (không bao giờ tự rơi về giả lập)", () => {
    expect(createPaymentGateway({ ...keys, PAYMENT_PROVIDER: "payos" })?.mode).toBe("payos");
    expect(createPaymentGateway({ ...keys, PAYMENT_PROVIDER: "fake" })?.mode).toBe("fake");
    expect(createPaymentGateway({ ...keys, PAYMENT_PROVIDER: "none" })).toBeUndefined();
  });
  it("payos thiếu khóa → ném lỗi (không âm thầm dùng giả lập)", () => {
    expect(() => createPaymentGateway({ PAYMENT_PROVIDER: "payos", PAYOS_CLIENT_ID: "c", PAYOS_API_URL: keys.PAYOS_API_URL })).toThrow(/thiếu PAYOS_/);
  });
});
