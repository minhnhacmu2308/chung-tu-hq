import { getEvaluation } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Kết quả đánh giá gần nhất; chưa có → null. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return { evaluation: fromResult(await getEvaluation(getContainer().skill, ctx, params.id!)) };
});
