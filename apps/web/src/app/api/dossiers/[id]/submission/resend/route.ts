import { ResendOperationInputSchema } from "@kb/contracts";
import { resendOperation } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Gửi lại một nghiệp vụ: luôn tra IEX trước, chỉ gửi khi Hải quan chưa ghi nhận. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { operation } = await parseBody(req, ResendOperationInputSchema);
  return fromResult(await resendOperation(getContainer().customs, ctx, params.id!, operation));
});
