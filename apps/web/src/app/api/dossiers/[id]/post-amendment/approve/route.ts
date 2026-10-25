import { BranchQuerySchema } from "@kb/contracts";
import { approvePostAmendment } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Phê duyệt bản khai bổ sung của tờ `branch` (Người duyệt / Chủ sở hữu, nguyên tắc 4 mắt). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { branch } = await parseBody(req, BranchQuerySchema);
  return fromResult(await approvePostAmendment(getContainer().customs, ctx, params.id!, branch));
});
