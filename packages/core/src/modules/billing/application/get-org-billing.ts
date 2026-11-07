import type { OrgBilling, Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { vnMonthOf } from "../domain/contract.js";
import { availableCredits } from "../domain/credits.js";
import { loadPlan, systemCtx, toOrgContract, toOrgPlan } from "./_billing.js";
import type { BillingDeps, PlanRow } from "./ports.js";

/**
 * Lượt / hợp đồng của org: số dư (tổng sổ lượt), lượt đang giữ, khả dụng, hợp đồng (chỉ CONTRACT), số tờ khai đã tính tháng này.
 * Gói và `reserved` (port của module khác) đọc trước; số dư/hợp đồng đọc trong MỘT transaction ngắn.
 */
export async function getOrgBilling(deps: BillingDeps, orgId: string, knownPlan?: PlanRow | null): Promise<{ plan: PlanRow; billing: OrgBilling } | null> {
  const plan = knownPlan ?? (await loadPlan(deps, orgId));
  if (!plan) return null;
  const reserved = (await deps.reserved?.(orgId)) ?? 0;
  const now = deps.clock.now();
  const { from, to } = vnMonthOf(now);
  const { balance, contract, declarations } = await deps.uow.asOrg(systemCtx(orgId), async (r) => ({
    balance: await r.ledger.balance(orgId),
    contract: plan.kind === "CONTRACT" ? await r.contracts.get(orgId) : null,
    declarations: await r.ledger.countDeclarations(orgId, from, to),
  }));
  return {
    plan,
    billing: { balance, reserved, available: availableCredits(balance, reserved), contract: plan.kind === "CONTRACT" ? toOrgContract(contract, now) : null, declarationsThisMonth: declarations },
  };
}

/** Gói + mức dùng tháng (GET /api/org/usage). Giá vốn là số nội bộ – không trả cho khách. */
export type PlanUsage = { plan: Organization["plan"]; usage: Organization["usage"] };
export async function getPlanUsage(deps: BillingDeps, ctx: Ctx): Promise<Result<PlanUsage>> {
  const plan = await loadPlan(deps, ctx.orgId);
  if (!plan) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ của doanh nghiệp"));
  const u = await deps.usage.thisMonth(ctx.orgId, deps.clock.now());
  return ok({ plan: toOrgPlan(plan), usage: { dossiersThisMonth: u.dossiers, pagesThisMonth: u.pages } });
}
