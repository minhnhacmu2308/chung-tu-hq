import { readMemberAvatar } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { imageResponse } from "@/lib/server/image";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Ảnh đại diện của một thành viên cùng doanh nghiệp (ADR 0016); người ngoài org hoặc chưa có ảnh → 404. */
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return imageResponse(fromResult(await readMemberAvatar(getContainer().identity, ctx, params.id!)));
});
