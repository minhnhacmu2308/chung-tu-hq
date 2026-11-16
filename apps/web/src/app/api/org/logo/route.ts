import { readOrgLogo, removeOrgLogo, setOrgLogo } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { imageResponse, readImageUpload } from "@/lib/server/image";
import { fromResult, HttpError, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Logo của doanh nghiệp đang đăng nhập (ADR 0016) – menu + favicon; chưa có → 404. */
export const GET = route(async () => {
  const { ctx } = await requireSession();
  const img = await readOrgLogo(getContainer().identity, ctx);
  if (!img) throw new HttpError(404, "NOT_FOUND", "Doanh nghiệp chưa có logo");
  return imageResponse(img);
});
/** multipart `files`: PNG/JPEG/WebP ≤ 1 MB. Chỉ Quản trị / Chủ sở hữu. */
export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await setOrgLogo(getContainer().identity, ctx, await readImageUpload(req)));
});
export const DELETE = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await removeOrgLogo(getContainer().identity, ctx));
});
