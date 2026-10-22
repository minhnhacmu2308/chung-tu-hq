import { ProductCatalogInputSchema } from "@kb/contracts";
import { deleteProducts, updateProduct } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const PUT = route(async (req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await updateProduct(getContainer().declaration, ctx, params.id!, await parseBody(req, ProductCatalogInputSchema)));
});
export const DELETE = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await deleteProducts(getContainer().declaration, ctx, [params.id!]));
});
