import { staleReads } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Chứng từ trong hồ sơ còn ở bước kiểm tra đã đọc bằng cấu hình cũ của skill. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await staleReads(getContainer().skill, ctx, params.id!));
});
