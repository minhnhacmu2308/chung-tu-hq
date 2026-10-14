import { removeCertificate } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await removeCertificate(getContainer().identity, ctx, params.id!));
  return { ok: true };
});
