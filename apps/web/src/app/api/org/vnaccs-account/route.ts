import { VnaccsAccountInputSchema } from "@kb/contracts";
import { getVnaccsAccount, removeVnaccsAccount, saveVnaccsAccount } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getVnaccsAccount(getContainer().identity, ctx));
});
export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, VnaccsAccountInputSchema);
  return fromResult(await saveVnaccsAccount(getContainer().identity, ctx, input));
});
export const DELETE = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await removeVnaccsAccount(getContainer().identity, ctx));
});
