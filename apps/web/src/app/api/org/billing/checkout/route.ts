// Mua lượt qua PayOS (chỉ OWNER/ADMIN, gói PAYG): tạo đơn PENDING → trả checkoutUrl để trình duyệt chuyển sang trang thanh toán.
import { StartPurchaseInputSchema } from "@kb/contracts";
import { startCreditPurchase } from "@kb/core/modules/billing";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await startCreditPurchase(getContainer().billing, ctx, await parseBody(req, StartPurchaseInputSchema)));
});
