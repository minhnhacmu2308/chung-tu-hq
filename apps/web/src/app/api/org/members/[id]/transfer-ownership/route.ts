import { TransferOwnershipInputSchema } from "@kb/contracts";
import { transferOwnership } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

/** Chuyển quyền sở hữu cho thành viên `id` (chỉ OWNER, nhập lại mật khẩu). */
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, TransferOwnershipInputSchema);
  return fromResult(await transferOwnership(getContainer().identity, ctx, params.id!, input));
});
