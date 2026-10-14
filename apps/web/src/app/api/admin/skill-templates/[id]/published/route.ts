import { setSkillTemplatePublished } from "@kb/core/modules/admin";
import { SetTemplatePublishedInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, p) => fromResult(await setSkillTemplatePublished(getContainer().admin, await requireStaff(), p.id!, await parseBody(req, SetTemplatePublishedInputSchema))));
