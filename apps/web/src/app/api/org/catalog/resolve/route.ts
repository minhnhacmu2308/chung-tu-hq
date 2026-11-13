// Tra mã (code thuần, không AI): bí danh ACTIVE trong bộ chỉ định → cùng mã ở bộ khác → luật ghép SURE/MAYBE/NONE.
import { ResolveItemQuerySchema } from "@kb/contracts";
import { resolveItem } from "@kb/core/modules/catalog";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseQuery, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (req) => {
  const { ctx } = await requireSession();
  const q = parseQuery(req, ResolveItemQuerySchema);
  return fromResult(
    await resolveItem(getContainer().catalog, ctx, {
      ...(q.codeSetId ? { codeSetId: q.codeSetId } : {}), ...(q.partnerName ? { partnerName: q.partnerName } : {}), ...(q.code ? { code: q.code } : {}),
      ...(q.name ? { name: q.name } : {}), ...(q.hsCode ? { hsCode: q.hsCode } : {}), ...(q.unit ? { unit: q.unit } : {}),
    }),
  );
});
