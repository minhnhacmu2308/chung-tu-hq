import { MAX_CREDITS_PER_PURCHASE, type StartPurchaseInput, type StartPurchaseResult } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { dec, toDecimalString } from "../../../shared/decimal.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { newOrderCode, payosDescription } from "../domain/payos.js";
import { loadPlan, logOf } from "./_billing.js";
import { PENDING_EXPIRE_MS } from "./reconcile-billing.js";
import type { BillingDeps, PaymentRow } from "./ports.js";

const ORDER_CODE_TRIES = 5;

/** returnUrl / cancelUrl của PayOS: màn Cài đặt → Gói & sử dụng, kèm mã thanh toán để trang gọi tra cứu (syncPayment). */
export const paymentReturnUrl = (appUrl: string, paymentId: string) => `${appUrl.replace(/\/$/, "")}/settings?tab=plan&payment=${encodeURIComponent(paymentId)}`;

/**
 * Mua lượt (D3): chỉ OWNER/ADMIN, chỉ gói PAYG, 1–1000 lượt. Tiền = số lượt × đơn giá gói (VND nguyên).
 * Ghi payments PENDING (mã đơn duy nhất, trùng thì thử số khác) → gọi PayOS tạo link NGOÀI transaction → lưu checkoutUrl.
 * Lượt chỉ được cộng khi PayOS báo đã trả (webhook / tra cứu) – không cộng ở đây.
 */
export async function startCreditPurchase(deps: BillingDeps, ctx: Ctx, input: StartPurchaseInput): Promise<Result<StartPurchaseResult>> {
  const allowed = requireRole(ctx, "ADMIN");
  if (!allowed.ok) return allowed;
  if (!Number.isInteger(input.credits) || input.credits < 1 || input.credits > MAX_CREDITS_PER_PURCHASE)
    return err(domainError("VALIDATION", `Số lượt mua phải từ 1 đến ${MAX_CREDITS_PER_PURCHASE}`));
  const plan = await loadPlan(deps, ctx.orgId);
  if (!plan) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ của doanh nghiệp"));
  if (plan.kind !== "PAYG") return err(domainError("INVALID_STATE", "Gói Hợp đồng năm khai không giới hạn trong hạn – không cần mua lượt"));
  // PAYMENT_PROVIDER=none (production chưa có khóa PayOS): fail-closed, đội vận hành nạp lượt tay.
  if (!deps.gateway) return err(reasonError("INTEGRATION_NOT_CONFIGURED", "PAYMENT_NOT_CONFIGURED"));
  const unit = dec(plan.pricePerDeclarationVnd).toDecimalPlaces(0);
  const amount = unit.mul(input.credits);
  if (amount.lte(0)) return err(domainError("INVALID_STATE", "Gói Theo lượt chưa có đơn giá – liên hệ KhaiBáo AI"));
  const random = deps.random ?? Math.random;
  const now = deps.clock.now();
  const id = deps.idGen.next("pay");

  let row: PaymentRow | null = null;
  for (let i = 0; i < ORDER_CODE_TRIES && !row; i++) {
    const orderCode = newOrderCode(now.getTime() + i, random() * 1000);
    if (await deps.uow.system((r) => r.payments.orderCodeExists(orderCode))) continue;
    const candidate: PaymentRow = {
      id, orgId: ctx.orgId, provider: "PAYOS", orderCode, credits: input.credits, amountVnd: toDecimalString(amount, 0), status: "PENDING",
      checkoutUrl: null, paymentLinkId: null, createdBy: ctx.userId, createdAt: now, paidAt: null, raw: null,
    };
    try {
      await deps.uow.asOrg(ctx, (r) => r.payments.insert(candidate));
      row = candidate;
    } catch (e) {
      // Hai đơn cùng lúc trúng cùng mã → unique order_code → thử số khác.
      if (!/duplicate key|unique/i.test(e instanceof Error ? e.message : String(e))) throw e;
    }
  }
  if (!row) return err(domainError("CONFLICT", "Không tạo được mã đơn thanh toán – thử lại"));

  const back = paymentReturnUrl(deps.appUrl, row.id);
  try {
    const link = await deps.gateway.createLink({
      orderCode: row.orderCode, amount: amount.toNumber(), description: payosDescription(row.orderCode), returnUrl: back, cancelUrl: back,
      // Link hết hạn cùng lúc với đơn (đối soát chỉ chốt EXPIRED khi PayOS xác nhận).
      expiredAt: Math.floor((now.getTime() + PENDING_EXPIRE_MS) / 1000),
      items: [{ name: `${input.credits} lượt khai báo`, quantity: input.credits, price: unit.toNumber() }],
    });
    await deps.uow.asOrg(ctx, (r) => r.payments.update(ctx.orgId, id, { checkoutUrl: link.checkoutUrl, paymentLinkId: link.paymentLinkId }));
    return ok({ paymentId: id, checkoutUrl: link.checkoutUrl });
  } catch (e) {
    logOf(deps)("[billing] Không tạo được link thanh toán PayOS", { orgId: ctx.orgId, paymentId: id, orderCode: row.orderCode, err: e instanceof Error ? e.message : String(e) });
    await deps.uow.asOrg(ctx, (r) => r.payments.update(ctx.orgId, id, { status: "CANCELLED", raw: { error: "CREATE_LINK_FAILED" } }));
    return err(domainError("GATEWAY_ERROR", "Cổng thanh toán PayOS đang lỗi – thử lại sau"));
  }
}
