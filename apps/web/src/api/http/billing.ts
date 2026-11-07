// Gói & sử dụng, mua lượt PayOS (ADR 0011) – gọi backend thật. Cùng chữ ký với src/mocks/api/billing.ts.
import { BillingOverviewSchema, PaymentSchema, StartPurchaseResultSchema, type StartPurchaseInput } from "@kb/contracts";
import { apiGet, apiPost } from "@/lib/http";

const enc = encodeURIComponent;

export const getBillingOverview = () => apiGet("org/billing", BillingOverviewSchema);
/** Trả `checkoutUrl` – trình duyệt chuyển sang trang thanh toán PayOS. */
export const startCreditPurchase = (input: StartPurchaseInput) => apiPost("org/billing/checkout", input, StartPurchaseResultSchema);
/** Trang return (`?payment=<id>`): tra cứu trạng thái đơn khi webhook đến chậm. */
export const syncPayment = (id: string) => apiPost(`org/billing/payments/${enc(id)}/sync`, {}, PaymentSchema);
/** Chỉ dev (PAYMENT_PROVIDER=fake): giả lập "đã trả". */
export const simulatePaymentPaid = (id: string) => apiPost(`dev/payments/${enc(id)}/simulate-paid`, {}, PaymentSchema);
