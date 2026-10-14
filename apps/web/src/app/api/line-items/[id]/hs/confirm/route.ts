import { ConfirmHsInputSchema } from "@kb/contracts";
import { confirmHs, unconfirmHs } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { code } = await parseBody(req, ConfirmHsInputSchema);
  return fromResult(await confirmHs(getContainer().declaration, ctx, params.id!, code));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await unconfirmHs(getContainer().declaration, ctx, params.id!));
});
