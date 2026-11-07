// Chỉ dev/demo: giả lập "đã trả" cho đơn mua lượt khi PAYMENT_PROVIDER=fake (cổng giả lập). Cổng PayOS thật / production → 404.
import { simulatePaymentPaid } from "@kb/core/modules/billing";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, HttpError, route } from "@/lib/server/route";

export const POST = route(async (_req, p) => {
  const c = getContainer();
  if (c.env.PAYMENT_PROVIDER !== "fake" || c.env.NODE_ENV === "production") throw new HttpError(404, "NOT_FOUND", "Không có");
  const { ctx } = await requireSession();
  return fromResult(await simulatePaymentPaid(c.billing, ctx, p.id!));
});
