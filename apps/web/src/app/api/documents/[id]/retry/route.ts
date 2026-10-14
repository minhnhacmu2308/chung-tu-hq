import { retryDocument } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await retryDocument(getContainer().dossier, ctx, params.id!));
  return { ok: true };
});
