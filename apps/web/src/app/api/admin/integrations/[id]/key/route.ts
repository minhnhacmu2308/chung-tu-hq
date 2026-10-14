import { updateIntegrationKey } from "@kb/core/modules/admin";
import { IntegrationIdSchema, UpdateIntegrationKeyInputSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, p) => fromResult(await updateIntegrationKey(getContainer().admin, await requireStaff(), IntegrationIdSchema.parse(p.id), await parseBody(req, UpdateIntegrationKeyInputSchema))));
