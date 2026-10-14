import { AddSkillFieldInputSchema } from "@kb/contracts";
import { addSkillField } from "@kb/core/modules/skill";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Thêm trường → phiên bản skill mới. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const field = await parseBody(req, AddSkillFieldInputSchema);
  return fromResult(await addSkillField(getContainer().skill, ctx, params.id!, field));
});
