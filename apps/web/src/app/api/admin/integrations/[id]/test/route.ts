import { testPlatformIntegration } from "@kb/core/modules/admin";
import { IntegrationIdSchema } from "@kb/contracts";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const POST = route(async (_req, p) => fromResult(await testPlatformIntegration(getContainer().admin, await requireStaff(), IntegrationIdSchema.parse(p.id))));
