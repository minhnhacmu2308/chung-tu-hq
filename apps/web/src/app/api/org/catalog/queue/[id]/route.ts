// Duyệt một mục hàng chờ: Xác nhận / Chọn mặt hàng khác / Tạo mặt hàng mới / Bỏ qua (người phụ trách bộ mã / Quản trị). Idempotent: đã xử lý → CATALOG_QUEUE_ITEM_DONE.
import { DecideQueueInputSchema } from "@kb/contracts";
import { decideQueue } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await decideQueue(getContainer().catalog, ctx, params.id!, await parseBody(req, DecideQueueInputSchema)));
});
