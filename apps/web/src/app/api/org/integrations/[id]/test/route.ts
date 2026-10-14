import { IntegrationIdSchema } from "@kb/contracts";
import { testIntegration } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await testIntegration(getContainer().integration, ctx, IntegrationIdSchema.parse(params.id)));
});
