import { describe, expect, it } from "vitest";
import { paymentRequestSignature, webhookSignature } from "../domain/payos.js";
import { FakePaymentGateway, PayosGateway, safeRaw } from "./payment-gateways.js";

const CFG = { clientId: "client-id", apiKey: "api-key", checksumKey: "checksum-key" };
type Call = { url: string; init: RequestInit };

/** fetch giả: ghi lời gọi, trả JSON cố định. */
function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fn, calls };
}

describe("PayosGateway", () => {
  const link = { orderCode: 1730000000123, amount: 250000, description: "KB1730000000123", returnUrl: "https://app/settings?tab=plan&payment=pay_1", cancelUrl: "https://app/settings?tab=plan&payment=pay_1", expiredAt: 1794100000 };

  it("tạo link: POST /v2/payment-requests, header x-client-id/x-api-key, body có chữ ký; trả checkoutUrl", async () => {
    const f = fakeFetch(200, { code: "00", desc: "success", data: { checkoutUrl: "https://pay.payos.vn/web/abc", paymentLinkId: "abc", qrCode: "000201", status: "PENDING" } });
    const g = new PayosGateway(CFG, f.fn);
    expect(await g.createLink({ ...link, items: [{ name: "10 lượt", quantity: 10, price: 25000 }] })).toEqual({ checkoutUrl: "https://pay.payos.vn/web/abc", paymentLinkId: "abc" });
    const call = f.calls[0]!;
    expect(call.url).toBe("https://api-merchant.payos.vn/v2/payment-requests");
    expect(call.init.method).toBe("POST");
    expect(call.init.headers).toMatchObject({ "x-client-id": "client-id", "x-api-key": "api-key" });
    const body = JSON.parse(String(call.init.body));
    expect(body).toMatchObject({ orderCode: link.orderCode, amount: 250000, description: link.description, expiredAt: 1794100000, items: [{ quantity: 10 }] });
    expect(body.signature).toBe(paymentRequestSignature("checksum-key", link));
    // Không gửi checksum key đi đâu cả.
    expect(String(call.init.body)).not.toContain("checksum-key");
  });
  it("tạo link lỗi (code ≠ 00 / HTTP lỗi) → ném lỗi, không lộ khóa", async () => {
    await expect(new PayosGateway(CFG, fakeFetch(200, { code: "20", desc: "Đơn đã tồn tại" }).fn).createLink(link)).rejects.toThrow(/mã 20/);
    const e = await new PayosGateway(CFG, fakeFetch(401, { code: "401", desc: "Unauthorized" }).fn).createLink(link).catch((x: Error) => x);
    expect(String(e)).not.toMatch(/api-key|checksum-key/);
  });
  it("tra cứu: GET /v2/payment-requests/{orderCode}; PAID dùng amountPaid; PROCESSING → PENDING", async () => {
    const paid = fakeFetch(200, { code: "00", data: { orderCode: 1, amount: 250000, amountPaid: 250000, status: "PAID" } });
    expect(await new PayosGateway(CFG, paid.fn).getStatus(1)).toMatchObject({ status: "PAID", amount: 250000 });
    expect(paid.calls[0]!.url).toBe("https://api-merchant.payos.vn/v2/payment-requests/1");
    expect(paid.calls[0]!.init.method).toBe("GET");
    const proc = fakeFetch(200, { code: "00", data: { amount: 250000, amountPaid: 0, status: "PROCESSING" } });
    expect((await new PayosGateway(CFG, proc.fn).getStatus(1)).status).toBe("PENDING");
    const exp = fakeFetch(200, { code: "00", data: { amount: 250000, amountPaid: 0, status: "EXPIRED" } });
    expect((await new PayosGateway(CFG, exp.fn).getStatus(1)).status).toBe("EXPIRED");
  });
  it("webhook: chữ ký đúng → đơn + số tiền; sai chữ ký / sửa số tiền / thiếu chữ ký → null; giao dịch lỗi → success false", () => {
    const g = new PayosGateway(CFG);
    const data = { orderCode: 123, amount: 250000, description: "KB123", accountNumber: "12345678", reference: "TF1", transactionDateTime: "2026-11-07 10:00:00", currency: "VND", paymentLinkId: "abc", code: "00", desc: "success", counterAccountName: null };
    const body = { code: "00", desc: "success", success: true, data, signature: webhookSignature("checksum-key", data) };
    const ok = g.verifyWebhook(body);
    expect(ok).toMatchObject({ orderCode: 123, amount: 250000, success: true });
    // raw lưu DB: không chữ ký, số tài khoản che (4 số cuối), tên chủ tài khoản che.
    expect(ok?.raw).toMatchObject({ accountNumber: "****5678", reference: "TF1" });
    expect(ok?.raw).not.toHaveProperty("signature");
    expect(g.verifyWebhook({ ...body, signature: webhookSignature("khac", data) })).toBeNull();
    expect(g.verifyWebhook({ ...body, data: { ...data, amount: 1 } })).toBeNull();
    expect(g.verifyWebhook({ code: "00", data })).toBeNull();
    expect(g.verifyWebhook("rác")).toBeNull();
    const failed = { ...data, code: "01" };
    expect(g.verifyWebhook({ ...body, data: failed, signature: webhookSignature("checksum-key", failed) })?.success).toBe(false);
  });
});

describe("safeRaw", () => {
  it("che số tài khoản người trả / người nhận, tên chủ tài khoản; bỏ chữ ký; giữ trường đối soát", () => {
    expect(safeRaw({ orderCode: 1, accountNumber: "0123456789", counterAccountNumber: "9876543210", counterAccountName: "NGUYEN VAN A", virtualAccountName: "", counterAccountBankId: "970422", signature: "x" })).toEqual({
      orderCode: 1, accountNumber: "****6789", counterAccountNumber: "****3210", counterAccountName: "***", virtualAccountName: "", counterAccountBankId: "970422",
    });
  });
});

describe("FakePaymentGateway", () => {
  it("checkout quay về trang Gói & sử dụng kèm fake=1; trạng thái luôn PENDING; webhook giả chỉ nhận signature fake", async () => {
    const g = new FakePaymentGateway();
    const r = await g.createLink({ orderCode: 1, amount: 25000, description: "KB1", returnUrl: "http://localhost:3100/settings?tab=plan&payment=pay_1", cancelUrl: "x", expiredAt: Math.floor(Date.now() / 1000) + 3600 });
    expect(r.checkoutUrl).toBe("http://localhost:3100/settings?tab=plan&payment=pay_1&fake=1");
    expect((await g.getStatus(1)).status).toBe("PENDING");
    await g.createLink({ orderCode: 2, amount: 25000, description: "KB2", returnUrl: "http://localhost/x", cancelUrl: "x", expiredAt: Math.floor(Date.now() / 1000) - 1 });
    expect((await g.getStatus(2)).status).toBe("EXPIRED");
    expect(g.verifyWebhook({ orderCode: 1, amount: 25000, signature: "fake" })).toMatchObject({ orderCode: 1, success: true });
    expect(g.verifyWebhook({ orderCode: 1, amount: 25000, signature: "x" })).toBeNull();
  });
});
