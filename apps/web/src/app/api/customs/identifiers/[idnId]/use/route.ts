import { IdentifierUseSchema } from "@kb/contracts";
import { releaseIdentifier, useIdentifier } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, parseQuery, route } from "@/lib/server/route";

/** Hồ sơ dùng số định danh còn dùng được. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { dossierId } = await parseBody(req, IdentifierUseSchema);
  return fromResult(await useIdentifier(getContainer().customs, ctx, params.idnId!, dossierId));
});

/** Hồ sơ trả lại số đang giữ (`?dossierId=`). */
export const DELETE = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { dossierId } = parseQuery(req, IdentifierUseSchema);
  return fromResult(await releaseIdentifier(getContainer().customs, ctx, params.idnId!, dossierId));
});
