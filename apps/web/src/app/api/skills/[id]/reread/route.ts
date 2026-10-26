import { rereadStale } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Đọc lại các chứng từ đó bằng cấu hình hiện tại (tốn lượt AI như đọc mới). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await rereadStale(getContainer().skill, ctx, params.id!));
});
