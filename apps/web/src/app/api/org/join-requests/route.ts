import { listJoinRequests } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listJoinRequests(getContainer().identity, ctx));
});
