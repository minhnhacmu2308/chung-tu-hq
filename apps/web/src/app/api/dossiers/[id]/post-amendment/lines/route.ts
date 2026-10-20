import { AddPostAmendmentLinesSchema } from "@kb/contracts";
import { addPostAmendmentLines } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Thêm một hoặc nhiều dòng của tờ khai gốc vào bản khai bổ sung. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { lineNos } = await parseBody(req, AddPostAmendmentLinesSchema);
  return fromResult(await addPostAmendmentLines(getContainer().customs, ctx, params.id!, lineNos));
});
