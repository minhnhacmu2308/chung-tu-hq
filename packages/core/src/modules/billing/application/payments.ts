// Chốt thanh toán: webhook PayOS (public), tra cứu khi khách quay lại trang (syncPayment), giả lập "đã trả" (chỉ cổng giả lập).
import type { Payment } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { logOf, settlePayment, systemCtx, toPayment } from "./_billing.js";
import type { BillingDeps } from "./ports.js";

/**
 * Webhook PayOS: verify chữ ký → tìm đơn theo mã (không có ngữ cảnh org, đọc bằng uow.system) → so số tiền → PAID + cộng lượt (idempotent).
 * Chữ ký sai → VALIDATION (route trả 400). Chữ ký đúng → luôn ok (route trả 200 { success: true } như PayOS yêu cầu),
 * kể cả đơn không tồn tại (webhook thử khi đăng ký URL) hay đã xử lý.
 */
export async function applyPaymentWebhook(deps: BillingDeps, body: unknown): Promise<Result<{ applied: boolean }>> {
  if (!deps.gateway) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "PAYMENT_NOT_CONFIGURED"));
  const w = deps.gateway.verifyWebhook(body);
  if (!w) return err(domainError("VALIDATION", "Chữ ký webhook không hợp lệ"));
  const p = await deps.uow.system((r) => r.payments.findByOrderCode(w.orderCode));
  if (!p) {
    logOf(deps)("[billing] Webhook PayOS cho mã đơn không có trong hệ thống – bỏ qua", { orderCode: w.orderCode });
    return ok({ applied: false });
  }
  if (!w.success) {
    // Giao dịch lỗi: chỉ ghi vết cho đơn còn chờ – không ghi đè dữ liệu của đơn đã chốt.
    if (p.status === "PENDING") await deps.uow.asOrg(systemCtx(p.orgId), (r) => r.payments.update(p.orgId, p.id, { raw: { ...w.raw, source: "webhook" } }));
    return ok({ applied: false });
  }
  const after = await settlePayment(deps, p, { status: "PAID", amount: w.amount, raw: w.raw }, "webhook");
  return ok({ applied: p.status !== "PAID" && after.status === "PAID" });
}

/** Trang return gọi khi webhook đến chậm: chỉ tra cứu PayOS khi đơn còn PENDING, rồi áp như webhook. */
export async function syncPayment(deps: BillingDeps, ctx: Ctx, paymentId: string): Promise<Result<Payment>> {
  if (!deps.gateway) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "PAYMENT_NOT_CONFIGURED"));
  const p = await deps.uow.asOrg(ctx, (r) => r.payments.get(ctx.orgId, paymentId));
  if (!p) return err(domainError("NOT_FOUND", "Không tìm thấy thanh toán"));
  if (p.status !== "PENDING") return ok(toPayment(p));
  try {
    const st = await deps.gateway.getStatus(p.orderCode);
    return ok(toPayment(await settlePayment(deps, p, st, "sync")));
  } catch (e) {
    logOf(deps)("[billing] Không tra cứu được trạng thái PayOS", { orgId: ctx.orgId, paymentId, err: e instanceof Error ? e.message : String(e) });
    return ok(toPayment(p));
  }
}

/** Chỉ cổng giả lập (PAYMENT_PROVIDER=fake – dev/demo): coi như khách đã trả đúng số tiền. */
export async function simulatePaymentPaid(deps: BillingDeps, ctx: Ctx, paymentId: string): Promise<Result<Payment>> {
  if (deps.gateway?.mode !== "fake") return err(domainError("NOT_SUPPORTED", "Chỉ dùng được với cổng thanh toán giả lập"));
  const p = await deps.uow.asOrg(ctx, (r) => r.payments.get(ctx.orgId, paymentId));
  if (!p) return err(domainError("NOT_FOUND", "Không tìm thấy thanh toán"));
  return ok(toPayment(await settlePayment(deps, p, { status: "PAID", amount: p.amountVnd, raw: { simulated: true } }, "fake")));
}
