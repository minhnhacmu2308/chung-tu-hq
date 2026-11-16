import { ConfirmCancelledInputSchema } from "@kb/contracts";
import { confirmDeclarationCancelled } from "@kb/core/modules/integration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Người duyệt / quản trị ghi nhận Hải quan đã hủy tờ khai (VNACCS không có thông điệp hủy) → tờ ở giai đoạn CANCELLED. */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, ConfirmCancelledInputSchema);
  fromResult(await confirmDeclarationCancelled(getContainer().customs, ctx, params.id!, input));
  return { ok: true };
});
