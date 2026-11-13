// Đặt bộ mã hiển thị chính (null = hiển thị mã nối) – Quản trị/Chủ.
import { SetPrimaryDisplayInputSchema } from "@kb/contracts";
import { setPrimaryDisplay } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  const { codeSetId } = await parseBody(req, SetPrimaryDisplayInputSchema);
  return fromResult(await setPrimaryDisplay(getContainer().catalog, ctx, codeSetId));
});
