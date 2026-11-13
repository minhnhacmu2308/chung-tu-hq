// Hàng chờ ghép: lọc "Của tôi" / bộ mã / mức / trạng thái / lần nhập (mọi vai trò được xem).
import { ListQueueQuerySchema } from "@kb/contracts";
import { listQueue } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await listQueue(getContainer().catalog, ctx, parseQuery(req, ListQueueQuerySchema)));
});
