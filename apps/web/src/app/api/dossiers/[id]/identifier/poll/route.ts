import { pollIdentifierNow } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** "Hỏi kết quả" khai báo định danh (V5IdentifierRes) một lượt ngay, theo REF_ID của lần gửi đang chờ. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await pollIdentifierNow(getContainer().customs, ctx, params.id!));
});
