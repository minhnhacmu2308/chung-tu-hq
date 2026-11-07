// Trang return của PayOS gọi khi webhook đến chậm: tra cứu trạng thái đơn còn PENDING rồi áp như webhook (idempotent).
import { syncPayment } from "@kb/core/modules/billing";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const POST = route(async (_req, p) => {
  const { ctx } = await requireSession();
  return fromResult(await syncPayment(getContainer().billing, ctx, p.id!));
});
