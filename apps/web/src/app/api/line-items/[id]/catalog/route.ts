// Gắn mặt hàng danh mục cho dòng hàng ("Mã lạ – Chọn mặt hàng"): chọn mặt hàng có sẵn hoặc tạo mới (spec danh mục §5).
import { LinkLineItemInputSchema } from "@kb/contracts";
import { linkLineItem } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, LinkLineItemInputSchema);
  return fromResult(await linkLineItem(getContainer().declaration, ctx, params.id!, input));
});
