import { BranchQuerySchema } from "@kb/contracts";
import { removePostAmendmentLine } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

/** Bỏ một dòng khỏi bản khai bổ sung của tờ `?branch=` (mặc định 1). */
export const DELETE = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { branch } = parseQuery(req, BranchQuerySchema);
  return fromResult(await removePostAmendmentLine(getContainer().customs, ctx, params.id!, params.lineId!, branch));
});
