import { UpdateHysInputSchema } from "@kb/contracts";
import { deleteHysSubmission, updateHysSubmission } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, UpdateHysInputSchema);
  return fromResult(await updateHysSubmission(getContainer().customs, ctx, params.id!, params.hysId!, input));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  fromResult(await deleteHysSubmission(getContainer().customs, ctx, params.id!, params.hysId!));
  return { ok: true };
});
