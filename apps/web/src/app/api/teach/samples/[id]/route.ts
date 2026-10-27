import { deleteTeachSample, getTeachComparison } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** So sánh tờ khai mẫu với tờ khai nháp của hồ sơ cùng lô (từng ô + từng dòng hàng). */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getTeachComparison(getContainer().teach, ctx, params.id!));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await deleteTeachSample(getContainer().teach, ctx, params.id!));
});
