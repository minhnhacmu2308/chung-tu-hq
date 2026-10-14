import { approveDeclaration } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await approveDeclaration(getContainer().declaration, ctx, params.id!));
});
