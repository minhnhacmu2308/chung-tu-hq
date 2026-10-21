import type { Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { BillingDeps } from "./ports.js";

export type PlanUsage = { plan: Organization["plan"]; usage: Organization["usage"] };

/** renewsAt = ngày đầu tháng sau (gói tính theo tháng dương lịch). */
export async function getPlanUsage(deps: BillingDeps, ctx: Ctx): Promise<Result<PlanUsage>> {
  const now = deps.clock.now();
  const op = await deps.orgPlan.get(ctx.orgId);
  const plan = op ? await deps.plans.get(op.planCode) : null;
  if (!op || !plan) return err(domainError("NOT_FOUND", "Không tìm thấy gói dịch vụ của doanh nghiệp"));
  const u = await deps.usage.thisMonth(ctx.orgId, now);
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return ok({
    plan: { code: plan.code as Organization["plan"]["code"], name: plan.name, dossiersPerMonth: plan.dossiersPerMonth, pagesPerDossier: plan.pagesPerDossier, renewsAt: next.toISOString().slice(0, 10) },
    usage: { dossiersThisMonth: u.dossiers, pagesThisMonth: u.pages, aiCostVnd: u.aiCostVnd, hsCostVnd: u.hsCostVnd, customsCostVnd: u.customsCostVnd },
  });
}
