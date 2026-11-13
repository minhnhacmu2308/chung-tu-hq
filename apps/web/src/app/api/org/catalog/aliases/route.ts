// Gắn mã (bí danh) cho mặt hàng trong một bộ mã: người phụ trách bộ / Quản trị → ACTIVE ngay; vai trò khác (≠ Người xem) → PROPOSED.
import { ProposeAliasInputSchema } from "@kb/contracts";
import { proposeAlias } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await proposeAlias(getContainer().catalog, ctx, await parseBody(req, ProposeAliasInputSchema)));
});
