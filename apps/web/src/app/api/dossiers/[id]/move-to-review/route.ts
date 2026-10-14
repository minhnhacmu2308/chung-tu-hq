import { moveToReview } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await moveToReview(getContainer().declaration, ctx, params.id!));
  return { ok: true };
});
