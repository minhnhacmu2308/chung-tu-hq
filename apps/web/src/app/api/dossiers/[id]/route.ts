import { UpdateDossierInputSchema } from "@kb/contracts";
import { getDossier, updateDossier } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getDossier(getContainer().dossier, ctx, params.id!));
});
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await updateDossier(getContainer().dossier, ctx, params.id!, await parseBody(req, UpdateDossierInputSchema)));
});
