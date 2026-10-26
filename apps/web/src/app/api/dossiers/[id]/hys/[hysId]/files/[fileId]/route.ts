import { removeHysFile } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await removeHysFile(getContainer().customs, ctx, params.id!, params.hysId!, params.fileId!));
});
