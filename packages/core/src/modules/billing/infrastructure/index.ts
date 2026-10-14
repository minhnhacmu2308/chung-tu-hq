import type { Db } from "../../../db/client.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import type { BillingDeps, OrgPlanReader } from "../application/ports.js";
import { DrizzlePlansRepo } from "./drizzle-plan-repo.js";
import { DrizzleUsageRecorder } from "./drizzle-usage.js";

export { DrizzlePlansRepo, DrizzleUsageRecorder };
export { costUsd, MODEL_PRICING_USD_PER_MTOK } from "./drizzle-usage.js";

/** `orgPlan`/`usage` do container cung cấp (billing không đọc bảng organizations/dossiers); thiếu `usage` → 0. */
export function createBillingInfrastructure(opts: { db: Db; orgPlan: OrgPlanReader; usage?: BillingDeps["usage"]; clock?: Clock }): BillingDeps {
  return {
    plans: new DrizzlePlansRepo(opts.db),
    orgPlan: opts.orgPlan,
    usage: opts.usage ?? { thisMonth: async () => ({ dossiers: 0, pages: 0, aiCostVnd: "0" }) },
    clock: opts.clock ?? systemClock,
  };
}
