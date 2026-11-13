import { pollKvgsNow } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "../../branch";

/** "Lấy phản hồi" danh sách container: hỏi Hải quan một lượt ngay (không chờ lịch kvgs-poll); không có yêu cầu đang chờ → INVALID_STATE. KVGS không có bước này (một lời gọi đồng bộ). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await pollKvgsNow(getContainer().customs, ctx, params.id!, branchOf(params)));
});
