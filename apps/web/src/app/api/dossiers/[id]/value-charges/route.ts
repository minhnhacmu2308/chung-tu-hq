import { ValueChargesSchema } from "@kb/contracts";
import { getValueCharges, saveValueCharges } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getValueCharges(getContainer().declaration, ctx, params.id!));
});
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, ValueChargesSchema);
  return fromResult(await saveValueCharges(getContainer().declaration, ctx, params.id!, input));
});
