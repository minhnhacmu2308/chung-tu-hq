import { reviewedDocuments } from "@kb/core/modules/extraction";
import { learnFromReview } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Sau khi người dùng xác nhận dữ liệu ở bước OCR: chứng từ có trường bị sửa thành mẫu cho skill (tự học). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  const c = getContainer();
  const docs = fromResult(await reviewedDocuments(c.extraction, ctx, params.id!));
  return fromResult(await learnFromReview(c.skill, ctx, docs));
});
