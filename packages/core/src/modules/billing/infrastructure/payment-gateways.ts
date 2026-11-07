// Cổng thanh toán mua lượt: PayOS thật và bản giả lập (dev/mock/test). Khóa PayOS chỉ nằm trong object này – không log, không trả ra ngoài.
import { z } from "zod";
import { paymentRequestSignature, verifyWebhookSignature } from "../domain/payos.js";
import type { GatewayPaymentStatus, PaymentGateway, WebhookPayment } from "../application/ports.js";

type Fetch = typeof fetch;
export type PayosConfig = { clientId: string; apiKey: string; checksumKey: string; baseUrl?: string };

const CreateLinkResponse = z.object({
  code: z.string(),
  desc: z.string().optional(),
  data: z.object({ checkoutUrl: z.string(), paymentLinkId: z.string().nullish() }).nullish(),
});
const StatusResponse = z.object({
  code: z.string(),
  desc: z.string().optional(),
  data: z.object({ status: z.string(), amount: z.number(), amountPaid: z.number().nullish(), orderCode: z.number().nullish() }).nullish(),
});
const WebhookBody = z.object({
  code: z.string().optional(),
  desc: z.string().optional(),
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string(),
});

/** PROCESSING (đang xử lý) coi như PENDING. Trạng thái lạ → PENDING (không cộng lượt, đối soát lần sau). */
const toStatus = (s: string): GatewayPaymentStatus["status"] => (s === "PAID" ? "PAID" : s === "CANCELLED" ? "CANCELLED" : s === "EXPIRED" ? "EXPIRED" : "PENDING");

/** Trường thông tin tài khoản người trả / người nhận trong webhook PayOS – che trước khi lưu `raw`. */
const ACCOUNT_NUMBER_KEYS = ["accountNumber", "counterAccountNumber", "virtualAccountNumber"];
const ACCOUNT_NAME_KEYS = ["counterAccountName", "virtualAccountName"];
const maskNumber = (v: unknown) => (typeof v === "string" && v.length > 0 ? `****${v.slice(-4)}` : v);

/** Dữ liệu lưu `raw`: bỏ chữ ký, che số tài khoản (giữ 4 số cuối để đối soát) và tên chủ tài khoản. */
export function safeRaw(data: Record<string, unknown>): Record<string, unknown> {
  const { signature: _s, ...rest } = data;
  for (const k of ACCOUNT_NUMBER_KEYS) if (k in rest) rest[k] = maskNumber(rest[k]);
  for (const k of ACCOUNT_NAME_KEYS) if (typeof rest[k] === "string" && rest[k]) rest[k] = "***";
  return rest;
}

/**
 * PayOS (https://payos.vn/docs): tạo link POST /v2/payment-requests, tra cứu GET /v2/payment-requests/{orderCode}; header x-client-id, x-api-key.
 * Chữ ký tạo link và webhook: HMAC-SHA256 bằng checksum key (domain/payos.ts).
 */
export class PayosGateway implements PaymentGateway {
  readonly provider = "PAYOS" as const;
  readonly mode = "payos" as const;
  private base: string;
  constructor(private cfg: PayosConfig, private http: Fetch = fetch) {
    this.base = (cfg.baseUrl ?? "https://api-merchant.payos.vn").replace(/\/$/, "");
  }
  private headers() {
    return { "content-type": "application/json", "x-client-id": this.cfg.clientId, "x-api-key": this.cfg.apiKey };
  }
  async createLink(input: Parameters<PaymentGateway["createLink"]>[0]) {
    const signature = paymentRequestSignature(this.cfg.checksumKey, input);
    const res = await this.http(`${this.base}/v2/payment-requests`, {
      method: "POST", headers: this.headers(), signal: AbortSignal.timeout(15_000),
      // expiredAt không nằm trong chuỗi ký (PayOS chỉ ký 5 trường amount/cancelUrl/description/orderCode/returnUrl).
      body: JSON.stringify({ orderCode: input.orderCode, amount: input.amount, description: input.description, returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, expiredAt: input.expiredAt, ...(input.items ? { items: input.items } : {}), signature }),
    });
    const body = CreateLinkResponse.safeParse(await res.json().catch(() => null));
    if (!res.ok || !body.success || body.data.code !== "00" || !body.data.data) throw new Error(`PayOS tạo link lỗi (HTTP ${res.status}${body.success ? `, mã ${body.data.code} ${body.data.desc ?? ""}` : ""})`);
    return { checkoutUrl: body.data.data.checkoutUrl, paymentLinkId: body.data.data.paymentLinkId ?? null };
  }
  async getStatus(orderCode: number): Promise<GatewayPaymentStatus> {
    const res = await this.http(`${this.base}/v2/payment-requests/${orderCode}`, { method: "GET", headers: this.headers(), signal: AbortSignal.timeout(15_000) });
    const body = StatusResponse.safeParse(await res.json().catch(() => null));
    if (!res.ok || !body.success || body.data.code !== "00" || !body.data.data) throw new Error(`PayOS tra cứu lỗi (HTTP ${res.status}${body.success ? `, mã ${body.data.code}` : ""})`);
    const d = body.data.data;
    // Đã trả: so số tiền thực nhận (amountPaid) với đơn; chưa trả: số tiền đơn.
    return { status: toStatus(d.status), amount: d.status === "PAID" ? d.amountPaid ?? d.amount : d.amount, raw: { status: d.status, amount: d.amount, amountPaid: d.amountPaid ?? null } };
  }
  verifyWebhook(body: unknown): WebhookPayment | null {
    const b = WebhookBody.safeParse(body);
    if (!b.success || !verifyWebhookSignature(this.cfg.checksumKey, b.data.data, b.data.signature)) return null;
    const d = b.data.data;
    const orderCode = Number(d.orderCode);
    const amount = Number(d.amount);
    if (!Number.isSafeInteger(orderCode) || !Number.isFinite(amount)) return null;
    // Thành công khi cả gói tin và giao dịch đều mã "00".
    const success = (b.data.success ?? b.data.code === "00") && (d.code === undefined || d.code === "00");
    return { orderCode, amount, success, raw: safeRaw(d) };
  }
}

/**
 * Cổng giả lập (PAYMENT_PROVIDER=fake – dev/demo/test; env chặn ở production): checkout quay ngay về màn Gói & sử dụng (`&fake=1`), trạng thái
 * PENDING cho tới khi gọi route dev giả lập "đã trả" (link do chính tiến trình này tạo mà quá hạn → EXPIRED). Webhook giả:
 * body `{ orderCode, amount, success, signature: "fake" }` – route webhook từ chối cổng giả ở production.
 */
export class FakePaymentGateway implements PaymentGateway {
  readonly provider = "PAYOS" as const;
  readonly mode = "fake" as const;
  private expiry = new Map<number, number>();
  async createLink(input: Parameters<PaymentGateway["createLink"]>[0]) {
    this.expiry.set(input.orderCode, input.expiredAt);
    const url = new URL(input.returnUrl);
    url.searchParams.set("fake", "1");
    return { checkoutUrl: url.toString(), paymentLinkId: `fake_${input.orderCode}` };
  }
  async getStatus(orderCode?: number): Promise<GatewayPaymentStatus> {
    const exp = orderCode !== undefined ? this.expiry.get(orderCode) : undefined;
    return { status: exp !== undefined && Date.now() / 1000 > exp ? "EXPIRED" : "PENDING", amount: 0, raw: { fake: true } };
  }
  verifyWebhook(body: unknown): WebhookPayment | null {
    const b = z.object({ orderCode: z.number().int(), amount: z.number(), success: z.boolean().default(true), signature: z.literal("fake") }).safeParse(body);
    return b.success ? { orderCode: b.data.orderCode, amount: b.data.amount, success: b.data.success, raw: { fake: true } } : null;
  }
}
