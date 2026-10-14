import { reopenDeclaration } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Mở lại tờ khai đã duyệt (chưa truyền) hoặc bị FPT từ chối khai trước → DRAFT để sửa và duyệt lại. */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await reopenDeclaration(getContainer().customs, ctx, params.id!));
  return { ok: true };
});
