// Danh mục hàng hóa dùng chung (ADR 0015): chế độ (GET), thiết lập lần đầu (POST), đổi chế độ SHARED ↔ PER_DEPARTMENT (PUT).
import { ChangeCatalogModeInputSchema, SetupCatalogInputSchema } from "@kb/contracts";
import { changeMode, getCatalogSettings, setupCatalog } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const { ctx } = await requireSession();
  return fromResult(await getCatalogSettings(getContainer().catalog, ctx));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await setupCatalog(getContainer().catalog, ctx, await parseBody(req, SetupCatalogInputSchema)));
});
export const PUT = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await changeMode(getContainer().catalog, ctx, await parseBody(req, ChangeCatalogModeInputSchema)));
});
