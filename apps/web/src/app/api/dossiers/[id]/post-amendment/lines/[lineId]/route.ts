import { removePostAmendmentLine } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Bỏ một dòng khỏi bản khai bổ sung. */
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await removePostAmendmentLine(getContainer().customs, ctx, params.id!, params.lineId!));
});
