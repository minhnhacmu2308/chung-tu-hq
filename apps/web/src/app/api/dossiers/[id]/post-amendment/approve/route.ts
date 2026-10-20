import { approvePostAmendment } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

/** Phê duyệt bản khai bổ sung (Người duyệt / Chủ sở hữu, nguyên tắc 4 mắt). */
export const POST = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await approvePostAmendment(getContainer().customs, ctx, params.id!));
});
