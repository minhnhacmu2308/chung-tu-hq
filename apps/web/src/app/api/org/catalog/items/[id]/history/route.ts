// Lịch sử sửa một mặt hàng (field_audit source CATALOG_EDIT, mới nhất trước) – mọi vai trò được xem.
import { getItemHistory } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getItemHistory(getContainer().catalog, ctx, params.id!));
});
