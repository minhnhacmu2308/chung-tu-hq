import { DeclarationDirectionSchema, DeclarationProfileInputSchema } from "@kb/contracts";
import { getDeclarationProfile, saveDeclarationProfile } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getDeclarationProfile(getContainer().declaration, ctx, DeclarationDirectionSchema.parse(params.direction)));
});
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, DeclarationProfileInputSchema);
  return fromResult(await saveDeclarationProfile(getContainer().declaration, ctx, DeclarationDirectionSchema.parse(params.direction), input));
});
