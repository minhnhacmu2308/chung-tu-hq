import { retryIdentifier } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Gửi lại một dòng lô bị từ chối / không phản hồi. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await retryIdentifier(getContainer().customs, ctx, params.idnId!));
});
