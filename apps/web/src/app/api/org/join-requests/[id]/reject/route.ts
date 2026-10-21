import { RejectJoinRequestInputSchema } from "@kb/contracts";
import { rejectJoinRequest } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Từ chối yêu cầu tham gia (OWNER/ADMIN); lý do tùy chọn gửi kèm email cho người xin. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, RejectJoinRequestInputSchema);
  return fromResult(await rejectJoinRequest(getContainer().identity, ctx, params.id!, input));
});
