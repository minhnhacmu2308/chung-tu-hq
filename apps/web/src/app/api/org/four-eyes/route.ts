import { FourEyesInputSchema } from "@kb/contracts";
import { updateFourEyes } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req) => {
  const { ctx } = await requireSession();
  const { enabled } = await parseBody(req, FourEyesInputSchema);
  return fromResult(await updateFourEyes(getContainer().identity, ctx, enabled));
});
