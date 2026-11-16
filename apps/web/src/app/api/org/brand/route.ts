import { OrgBrandInputSchema } from "@kb/contracts";
import { updateOrgBrandName } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Tên thương hiệu hiển thị (menu, tiêu đề tab); "" = về mặc định. Chỉ Quản trị / Chủ sở hữu. */
export const PATCH = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await updateOrgBrandName(getContainer().identity, ctx, await parseBody(req, OrgBrandInputSchema)));
});
