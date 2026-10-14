import { SuspectThresholdInputSchema } from "@kb/contracts";
import { updateSuspectThreshold } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req) => {
  const { ctx } = await requireSession();
  const { threshold } = await parseBody(req, SuspectThresholdInputSchema);
  return fromResult(await updateSuspectThreshold(getContainer().identity, ctx, threshold));
});
