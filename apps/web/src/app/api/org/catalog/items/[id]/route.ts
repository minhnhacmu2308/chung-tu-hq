// Một mặt hàng: chi tiết (GET), sửa thông tin chung (PATCH – Người duyệt/Quản trị/Chủ), ngưng dùng / dùng lại (PUT {archived} – Quản trị/Chủ).
import { ArchiveItemInputSchema, UpdateItemInputSchema } from "@kb/contracts";
import { archiveItem, getItem, updateItem } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getItem(getContainer().catalog, ctx, params.id!));
});
export const PATCH = route(async (req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await updateItem(getContainer().catalog, ctx, params.id!, await parseBody(req, UpdateItemInputSchema)));
});
export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  const { archived } = await parseBody(req, ArchiveItemInputSchema);
  return fromResult(await archiveItem(getContainer().catalog, ctx, params.id!, archived));
});
