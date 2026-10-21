import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { dec } from "../../../shared/decimal.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import type { BillingDeps, OrgPlanReader } from "../application/ports.js";
import { DrizzlePlansRepo } from "./drizzle-plan-repo.js";
import { DrizzleServiceUsageMeter, DrizzleUsageRecorder } from "./drizzle-usage.js";

export { DrizzlePlansRepo, DrizzleServiceUsageMeter, DrizzleUsageRecorder };
export { costUsd, MODEL_PRICING_USD_PER_MTOK, usageIdFor } from "./drizzle-usage.js";

/** Ghi chi phí HSCodePro / Customs Hub theo đơn giá trong env (chưa đặt → 0 VND). */
export function createServiceUsageMeter(db: Db, env: Pick<Env, "HSCODEPRO_PRICE_PER_ITEM_VND" | "CUSTOMS_HUB_PRICE_PER_MESSAGE_VND">): DrizzleServiceUsageMeter {
  return new DrizzleServiceUsageMeter(db, { hscodeproPerItemVnd: dec(env.HSCODEPRO_PRICE_PER_ITEM_VND), customsHubPerMessageVnd: dec(env.CUSTOMS_HUB_PRICE_PER_MESSAGE_VND) });
}

/** `orgPlan`/`usage` do container cung cấp (billing không đọc bảng organizations/dossiers); thiếu `usage` → 0. */
export function createBillingInfrastructure(opts: { db: Db; orgPlan: OrgPlanReader; usage?: BillingDeps["usage"]; clock?: Clock }): BillingDeps {
  return {
    plans: new DrizzlePlansRepo(opts.db),
    orgPlan: opts.orgPlan,
    usage: opts.usage ?? { thisMonth: async () => ({ dossiers: 0, pages: 0, aiCostVnd: "0", hsCostVnd: "0", customsCostVnd: "0" }) },
    clock: opts.clock ?? systemClock,
  };
}
