import { markAllNotificationsRead } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async () => {
  const { ctx } = await requireSession();
  fromResult(await markAllNotificationsRead(getContainer().identity, ctx));
  return { ok: true };
});
