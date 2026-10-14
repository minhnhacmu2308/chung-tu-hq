import { SetDisabledInputSchema } from "@kb/contracts";
import { setMemberDisabled } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { disabled } = await parseBody(req, SetDisabledInputSchema);
  return fromResult(await setMemberDisabled(getContainer().identity, ctx, params.id!, disabled));
});
