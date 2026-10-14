import { updatePlan } from "@kb/core/modules/admin";
import { UpdatePlanInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, p) => fromResult(await updatePlan(getContainer().admin, await requireStaff(), p.code!, await parseBody(req, UpdatePlanInputSchema))));
