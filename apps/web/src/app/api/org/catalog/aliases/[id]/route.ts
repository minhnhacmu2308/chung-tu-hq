// Một bí danh: duyệt / từ chối đề xuất, chuyển sang mặt hàng khác (PATCH), ngưng dùng (DELETE → REJECTED). Người phụ trách bộ mã / Quản trị.
import { AliasActionInputSchema } from "@kb/contracts";
import { deactivateAlias, decideAlias, moveAlias } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, AliasActionInputSchema);
  const deps = getContainer().catalog;
  if (input.action === "MOVE") return fromResult(await moveAlias(deps, ctx, params.id!, input.toItemId, input.factor));
  return fromResult(await decideAlias(deps, ctx, params.id!, input.action, input.action === "APPROVE" ? input.factor : undefined));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await deactivateAlias(getContainer().catalog, ctx, params.id!));
});
