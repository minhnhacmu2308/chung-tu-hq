import { UpdateLessonInputSchema } from "@kb/contracts";
import { updateLesson } from "@kb/core/modules/teaching";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Duyệt / tắt / đưa về chờ / sửa giá trị bài học. */
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, UpdateLessonInputSchema);
  return fromResult(await updateLesson(getContainer().teach, ctx, params.id!, input));
});
