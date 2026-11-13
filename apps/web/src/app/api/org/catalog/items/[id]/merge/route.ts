// Gộp mặt hàng trong đường dẫn vào mặt hàng `intoId` (Quản trị/Chủ). Chứng từ cũ trỏ mặt hàng bị gộp tra ra mặt hàng cuối chuỗi.
import { MergeItemsInputSchema } from "@kb/contracts";
import { mergeItems } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { intoId } = await parseBody(req, MergeItemsInputSchema);
  return fromResult(await mergeItems(getContainer().catalog, ctx, { fromId: params.id!, intoId }));
});
