// Webhook PayOS (PUBLIC – không phiên, không CSRF Origin): xác thực bằng chữ ký HMAC trong body (checksum key).
// Chữ ký đúng → luôn 200 { success: true } (PayOS yêu cầu, kể cả đơn không tồn tại/đã xử lý); sai → 400. Không log body (có số tài khoản).
import { applyPaymentWebhook } from "@kb/core/modules/billing";
import { NextResponse } from "next/server";
import { getContainer } from "@/container";
import { fromResult, HttpError, json, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const POST = route(async (req) => {
  const c = getContainer();
  // Fail-closed: thanh toán online tắt (PAYMENT_PROVIDER=none) hoặc cổng giả lập ở production (env đã cấm, chặn thêm ở đây) → 404, không ai tự cộng lượt.
  const gateway = c.billing.gateway;
  if (!gateway || (gateway.mode === "fake" && c.env.NODE_ENV === "production")) throw new HttpError(404, "NOT_FOUND", "Không có");
  fromResult(await applyPaymentWebhook(c.billing, await json(req)));
  return NextResponse.json({ success: true });
});
