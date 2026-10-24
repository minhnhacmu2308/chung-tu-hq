import { ImportProductCatalogInputSchema } from "@kb/contracts";
import { importProducts } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Trình duyệt đọc file Excel + gộp theo mặt hàng, gửi từng lô (≤ 500 mặt hàng) – xem features/product-catalog/import-xlsx.ts.
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await importProducts(getContainer().declaration, ctx, await parseBody(req, ImportProductCatalogInputSchema)));
});
