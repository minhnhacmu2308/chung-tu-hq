import { listAudit } from "@kb/core/modules/admin";
import { requireStaff } from "@/lib/server/admin-auth";
import { getContainer } from "@/container";
import { fromResult, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const orgId = req.nextUrl.searchParams.get("orgId");
  return fromResult(await listAudit(getContainer().admin, await requireStaff(), orgId ? { orgId } : {}));
});
