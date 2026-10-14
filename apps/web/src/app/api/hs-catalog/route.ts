import { HsCatalogQuerySchema } from "@kb/contracts";
import { listHsCatalog } from "@kb/core/modules/declaration";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** ?q= tìm theo mã/mô tả (biểu thuế tối thiểu – D1). */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const { q } = HsCatalogQuerySchema.parse({ q: req.nextUrl.searchParams.get("q") ?? undefined });
  return fromResult(await listHsCatalog(getContainer().declaration, ctx, q));
});
