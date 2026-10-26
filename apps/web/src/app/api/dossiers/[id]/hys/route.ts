import { CreateHysInputSchema } from "@kb/contracts";
import { createHysSubmission, getHysOverview } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Tổng quan HYS của hồ sơ: các bộ, gợi ý còn thiếu, lô còn sửa được. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getHysOverview(getContainer().customs, ctx, params.id!));
});
/** Tạo bộ HYS (nháp). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, CreateHysInputSchema);
  return fromResult(await createHysSubmission(getContainer().customs, ctx, params.id!, input));
});
