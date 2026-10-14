import { deleteDocument } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await deleteDocument(getContainer().dossier, ctx, params.id!));
  return { ok: true };
});
