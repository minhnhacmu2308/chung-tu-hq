// Xác nhận hàng loạt mục hàng chờ: mục lỗi (thiếu hệ số, đã xử lý, mã bị giữ…) trả riêng, không chặn mục khác.
import { DecideQueueBulkInputSchema } from "@kb/contracts";
import { decideQueueBulk } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await decideQueueBulk(getContainer().catalog, ctx, await parseBody(req, DecideQueueBulkInputSchema)));
});
