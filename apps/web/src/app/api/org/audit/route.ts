import { PageQuerySchema } from "@kb/contracts";
import { listOrgAudit } from "@kb/core/modules/identity";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
/** Nhật ký hoạt động của doanh nghiệp (Quản trị / Chủ sở hữu), phân trang ?limit&offset. */
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const q = req.nextUrl.searchParams;
  return fromResult(await listOrgAudit(getContainer().identity, ctx, PageQuerySchema.parse({ ...(q.get("limit") ? { limit: q.get("limit") } : {}), ...(q.get("offset") ? { offset: q.get("offset") } : {}) })));
});
