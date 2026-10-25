import { BranchQuerySchema } from "@kb/contracts";
import { startPostAmendment } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Bắt đầu sửa đổi sau thông quan trên tờ `branch` (mặc định 1): tờ đã thông quan → lập bản khai bổ sung AMA (bước Review). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { branch } = await parseBody(req, BranchQuerySchema);
  fromResult(await startPostAmendment(getContainer().customs, ctx, params.id!, branch));
  return { ok: true };
});
