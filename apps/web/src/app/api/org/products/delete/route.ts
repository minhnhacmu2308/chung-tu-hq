import { DeleteProductsInputSchema } from "@kb/contracts";
import { deleteProducts } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Xóa nhiều mặt hàng đã chọn.
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { ids } = await parseBody(req, DeleteProductsInputSchema);
  return fromResult(await deleteProducts(getContainer().declaration, ctx, ids));
});
