// Mặt hàng chuẩn: danh sách (tìm theo mã nối / tên / mọi mã, xem theo bộ mã, lọc) và tạo (thẳng hoặc vào hàng chờ ghép).
import { CreateItemInputSchema, ListCatalogItemsQuerySchema } from "@kb/contracts";
import { createItem, listItems } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, parseQuery, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await listItems(getContainer().catalog, ctx, parseQuery(req, ListCatalogItemsQuerySchema)));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await createItem(getContainer().catalog, ctx, await parseBody(req, CreateItemInputSchema)));
});
