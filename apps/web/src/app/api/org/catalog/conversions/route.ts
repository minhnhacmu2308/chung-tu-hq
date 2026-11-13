// Quy đổi đơn vị mặc định của mặt hàng: thêm/sửa (PUT) và bỏ (DELETE ?itemId=&unit=). Người sửa thông tin chung hoặc người phụ trách bộ mã.
import { RemoveConversionQuerySchema, SetConversionInputSchema } from "@kb/contracts";
import { removeConversion, setConversion } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, parseQuery, route } from "@/lib/server/route";

export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  const { itemId, unit, factor } = await parseBody(req, SetConversionInputSchema);
  return fromResult(await setConversion(getContainer().catalog, ctx, itemId, unit, factor));
});
export const DELETE = route(async (req) => {
  const { ctx } = await requireSession();
  const { itemId, unit } = parseQuery(req, RemoveConversionQuerySchema);
  return fromResult(await removeConversion(getContainer().catalog, ctx, itemId, unit));
});
