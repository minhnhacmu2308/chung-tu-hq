// Tra nhiều dòng một lần (≤ 500): gợi ý mặt hàng/mã HS đã khai cho mọi dòng hàng của hồ sơ, không tải cả danh mục về trình duyệt.
import { ResolveManyInputSchema } from "@kb/contracts";
import { resolveManyWithItems } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  const { rows } = await parseBody(req, ResolveManyInputSchema);
  return fromResult(await resolveManyWithItems(getContainer().catalog, ctx, rows));
});
