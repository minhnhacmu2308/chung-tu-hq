import { ChangeRoleInputSchema } from "@kb/contracts";
import { changeMemberRole } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { role } = await parseBody(req, ChangeRoleInputSchema);
  return fromResult(await changeMemberRole(getContainer().identity, ctx, params.id!, role));
});
