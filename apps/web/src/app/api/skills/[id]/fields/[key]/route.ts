import { SkillFieldPatchSchema } from "@kb/contracts";
import { removeSkillField, updateSkillField } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const patch = await parseBody(req, SkillFieldPatchSchema);
  return fromResult(await updateSkillField(getContainer().skill, ctx, params.id!, params.key!, patch));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await removeSkillField(getContainer().skill, ctx, params.id!, params.key!));
});
