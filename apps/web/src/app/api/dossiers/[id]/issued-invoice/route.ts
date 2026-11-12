// Hóa đơn thương mại (ADR 0013 mục 3): xem / cấp số / phát hành sau thông quan / hủy số.
import { IssueActionSchema } from "@kb/contracts";
import { getIssuedInvoices, issueInvoiceAction } from "@kb/core/modules/extraction";
import { requireSession } from "@/lib/server/auth";
import { getContainer } from "@/container";
import { fromResult, parseBody, route } from "@/lib/server/route";

export const dynamic = "force-dynamic";
export const GET = route(async (_req, params) => {
  const { ctx } = await requireSession();
  return fromResult(await getIssuedInvoices(getContainer().extraction, ctx, params.id!));
});
export const POST = route(async (req, params) => {
  const { ctx } = await requireSession();
  const input = await parseBody(req, IssueActionSchema);
  return fromResult(await issueInvoiceAction(getContainer().extraction, ctx, params.id!, input));
});
