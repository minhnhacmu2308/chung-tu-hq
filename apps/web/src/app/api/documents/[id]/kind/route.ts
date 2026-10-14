import { ChangeDocumentKindInputSchema } from "@kb/contracts";
import { changeDocumentKind } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { kind } = await parseBody(req, ChangeDocumentKindInputSchema);
  return fromResult(await changeDocumentKind(getContainer().dossier, ctx, params.id!, kind));
});
