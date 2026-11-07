import { previewFptPayload } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** GỠ LỖI TẠM (FPT_DEBUG_TRACE): body IDA/EDA từng tờ sẽ gửi FPT nếu truyền ngay – không gọi FPT. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await previewFptPayload(getContainer().customs, ctx, params.id!));
});
