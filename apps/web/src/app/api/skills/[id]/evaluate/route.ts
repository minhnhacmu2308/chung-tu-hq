import { evaluateSkill } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Đẩy job đánh giá lại; kết quả lấy ở GET .../evaluation. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await evaluateSkill(getContainer().skill, ctx, params.id!));
});
