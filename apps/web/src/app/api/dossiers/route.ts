import { CreateDossierInputSchema, DossierFilterSchema } from "@kb/contracts";
import { createDossier, listDossiers } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const q = req.nextUrl.searchParams;
  const filter = DossierFilterSchema.parse({ ...(q.get("direction") ? { direction: q.get("direction") } : {}), ...(q.get("status") ? { status: q.get("status") } : {}), ...(q.get("step") ? { step: q.get("step") } : {}) });
  return fromResult(await listDossiers(getContainer().dossier, ctx, filter));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await createDossier(getContainer().dossier, ctx, await parseBody(req, CreateDossierInputSchema)));
});
