import { readMemberAvatar, removeMyAvatar, setMyAvatar } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { imageResponse, readImageUpload } from "@/lib/server/image";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Ảnh đại diện của chính mình (ADR 0016); chưa có → 404. */
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return imageResponse(fromResult(await readMemberAvatar(getContainer().identity, ctx, ctx.userId)));
});
/** multipart `files`: PNG/JPEG/WebP ≤ 1 MB. */
export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await setMyAvatar(getContainer().identity, ctx, await readImageUpload(req)));
});
export const DELETE = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await removeMyAvatar(getContainer().identity, ctx));
});
