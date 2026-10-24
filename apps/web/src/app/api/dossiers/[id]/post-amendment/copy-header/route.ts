import { CopyPostAmendmentHeaderSchema } from "@kb/contracts";
import { copyPostAmendmentHeader } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Nhân bản sửa chỉ tiêu chung từ AMA của tờ `fromBranch` sang AMA các tờ đã thông quan khác → { applied, skipped }. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, CopyPostAmendmentHeaderSchema);
  return fromResult(await copyPostAmendmentHeader(getContainer().customs, ctx, params.id!, input));
});
