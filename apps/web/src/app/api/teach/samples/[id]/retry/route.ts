import { retryTeachSample } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Đã đọc → so lại với tờ khai nháp hiện tại; chưa đọc được → đọc lại. Bài học không bị cộng hai lần. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await retryTeachSample(getContainer().teach, ctx, params.id!));
});
