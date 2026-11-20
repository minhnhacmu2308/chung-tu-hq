import { pollIdentifierById } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** "Hỏi kết quả" (V5IdentifierRes) một lượt ngay cho đúng dòng. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await pollIdentifierById(getContainer().customs, ctx, params.idnId!));
});
