import { CreateDossierInputSchema, DossierFilterSchema, PageQuerySchema } from "@kb/contracts";
import { createDossier, listDossiers, listDossiersPage } from "@kb/core/modules/dossier";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const q = req.nextUrl.searchParams;
  const pick = (k: string) => (q.get(k) ? { [k]: q.get(k) } : {});
  const filter = DossierFilterSchema.parse({ ...pick("direction"), ...pick("status"), ...pick("step"), ...pick("q") });
  // Có limit/offset → trang {items,total,limit,offset}; không → danh sách (tối đa UNPAGED_LIST_CAP) cho màn lọc phía client.
  if (q.has("limit") || q.has("offset")) return fromResult(await listDossiersPage(getContainer().dossier, ctx, filter, PageQuerySchema.parse({ ...pick("limit"), ...pick("offset") })));
  return fromResult(await listDossiers(getContainer().dossier, ctx, filter));
});
export const POST = route(async (req) => {
  const { ctx } = await requireSession();
  return fromResult(await createDossier(getContainer().dossier, ctx, await parseBody(req, CreateDossierInputSchema)));
});
