import { finishReading } from "@kb/core/modules/extraction";
import { getDossier } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  const c = getContainer();
  fromResult(await finishReading(c.extraction, ctx, params.id!));
  return fromResult(await getDossier(c.dossier, ctx, params.id!));
});
