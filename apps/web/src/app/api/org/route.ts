import { OrgProfileInputSchema } from "@kb/contracts";
import { getOrganization, updateOrganization } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getOrganization(getContainer().identity, ctx));
});
export const PATCH = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await updateOrganization(getContainer().identity, ctx, await parseBody(req, OrgProfileInputSchema)));
});
