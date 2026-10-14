import { listLineItems } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await listLineItems(getContainer().declaration, ctx, params.id!));
});
