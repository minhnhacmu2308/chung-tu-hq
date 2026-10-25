import { AddPostAmendmentLinesSchema, BranchQuerySchema } from "@kb/contracts";
import { addPostAmendmentLines } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Thêm một hoặc nhiều dòng của tờ khai gốc vào bản khai bổ sung của tờ `branch`. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { lineNos, branch } = await parseBody(req, AddPostAmendmentLinesSchema.merge(BranchQuerySchema));
  return fromResult(await addPostAmendmentLines(getContainer().customs, ctx, params.id!, lineNos, branch));
});
