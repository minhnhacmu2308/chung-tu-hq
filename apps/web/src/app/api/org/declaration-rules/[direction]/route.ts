import { DeclarationDirectionSchema } from "@kb/contracts";
import { listRuleOptions } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  await requireSession();
  return listRuleOptions(DeclarationDirectionSchema.parse(params.direction));
});
