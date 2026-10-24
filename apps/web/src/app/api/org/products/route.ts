import { ProductCatalogInputSchema } from "@kb/contracts";
import { createProduct, listProducts } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

// Danh mục hàng hóa của doanh nghiệp.
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await listProducts(getContainer().declaration, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await createProduct(getContainer().declaration, ctx, await parseBody(req, ProductCatalogInputSchema)));
});
