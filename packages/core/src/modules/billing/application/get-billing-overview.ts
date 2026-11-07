import type { BillingOverview } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { systemCtx, toLedgerEntry, toOrgPlan, toPayment } from "./_billing.js";
import { getOrgBilling } from "./get-org-billing.js";
import type { BillingDeps } from "./ports.js";

export const LEDGER_PAGE = 50;
export const RECENT_PAYMENTS = 20;

/** GET /api/org/billing: gói, số dư, khả dụng, hợp đồng, 50 dòng sổ lượt gần nhất, thanh toán gần đây. Mọi thành viên xem được. */
export async function getBillingOverview(deps: BillingDeps, ctx: Ctx): Promise<Result<BillingOverview>> {
  const b = await getOrgBilling(deps, ctx.orgId);
  if (!b) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ của doanh nghiệp"));
  const { ledger, payments } = await deps.uow.asOrg(systemCtx(ctx.orgId), async (r) => ({
    ledger: await r.ledger.list(ctx.orgId, LEDGER_PAGE),
    payments: await r.payments.listRecent(ctx.orgId, RECENT_PAYMENTS),
  }));
  return ok({ plan: toOrgPlan(b.plan), onlinePaymentEnabled: !!deps.gateway, billing: b.billing, ledger: ledger.map(toLedgerEntry), payments: payments.map(toPayment) });
}
