import { pollKvgsNow } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";
import { branchOf } from "../../branch";

/** "Lấy phản hồi": hỏi Hải quan một lượt ngay (không chờ lịch kvgs-poll) cho CONT_LIST; không có yêu cầu đang chờ → INVALID_STATE. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await pollKvgsNow(getContainer().customs, ctx, params.id!, branchOf(params), "CONT_LIST"));
});
