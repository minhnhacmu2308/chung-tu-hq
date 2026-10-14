import { SetSkillEnabledInputSchema } from "@kb/contracts";
import { setSkillEnabled } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { enabled } = await parseBody(req, SetSkillEnabledInputSchema);
  return fromResult(await setSkillEnabled(getContainer().skill, ctx, params.id!, enabled));
});
