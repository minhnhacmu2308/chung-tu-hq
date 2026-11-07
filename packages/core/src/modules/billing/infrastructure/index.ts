import type { Env } from "../../../config/env.js";
import type { Db } from "../../../db/client.js";
import { dec } from "../../../shared/decimal.js";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { ulidIdGen } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import type { BillingDeps, OrgPlanReader, PaymentGateway } from "../application/ports.js";
import { DrizzleBillingUow, grantCreditsInTx } from "./drizzle-billing-uow.js";
import { DrizzlePlansRepo } from "./drizzle-plan-repo.js";
import { DrizzleServiceUsageMeter, DrizzleUsageRecorder } from "./drizzle-usage.js";
import { FakePaymentGateway, PayosGateway } from "./payment-gateways.js";

export { createAiBudget } from "./ai-budget.js";
export { DrizzleBillingUow, DrizzlePlansRepo, DrizzleServiceUsageMeter, DrizzleUsageRecorder, FakePaymentGateway, grantCreditsInTx, PayosGateway };
export { costUsd, MODEL_PRICING_USD_PER_MTOK, usageIdFor } from "./drizzle-usage.js";

/** Ghi chi phí HSCodePro / Customs Hub theo đơn giá trong env (chưa đặt → 0 VND). */
export function createServiceUsageMeter(db: Db, env: Pick<Env, "HSCODEPRO_PRICE_PER_ITEM_VND" | "CUSTOMS_HUB_PRICE_PER_MESSAGE_VND">): DrizzleServiceUsageMeter {
  return new DrizzleServiceUsageMeter(db, { hscodeproPerItemVnd: dec(env.HSCODEPRO_PRICE_PER_ITEM_VND), customsHubPerMessageVnd: dec(env.CUSTOMS_HUB_PRICE_PER_MESSAGE_VND) });
}

/**
 * Cổng thanh toán theo PAYMENT_PROVIDER – fail-closed, KHÔNG bao giờ tự rơi về giả lập:
 * `payos` → PayOS thật (env đã kiểm đủ 3 khóa bằng need(); thiếu → ném lỗi), `fake` → giả lập (env cấm ở production), `none` → không có cổng.
 */
export function createPaymentGateway(env: Pick<Env, "PAYMENT_PROVIDER" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "PAYOS_API_URL">): PaymentGateway | undefined {
  if (env.PAYMENT_PROVIDER === "payos") {
    if (!env.PAYOS_CLIENT_ID || !env.PAYOS_API_KEY || !env.PAYOS_CHECKSUM_KEY) throw new Error("PAYMENT_PROVIDER=payos nhưng thiếu PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY");
    return new PayosGateway({ clientId: env.PAYOS_CLIENT_ID, apiKey: env.PAYOS_API_KEY, checksumKey: env.PAYOS_CHECKSUM_KEY, baseUrl: env.PAYOS_API_URL });
  }
  if (env.PAYMENT_PROVIDER === "fake") return new FakePaymentGateway();
  return undefined;
}

/**
 * `orgPlan`/`usage`/`reserved` do container cung cấp (billing không đọc bảng organizations/dossiers/customs_results); thiếu `usage` → 0, thiếu `reserved` → 0.
 * `env` có → cổng thanh toán theo PAYMENT_PROVIDER.
 */
export function createBillingInfrastructure(opts: {
  db: Db; orgPlan: OrgPlanReader; usage?: BillingDeps["usage"]; reserved?: BillingDeps["reserved"]; clock?: Clock;
  env?: Pick<Env, "APP_URL" | "PAYMENT_PROVIDER" | "PAYOS_CLIENT_ID" | "PAYOS_API_KEY" | "PAYOS_CHECKSUM_KEY" | "PAYOS_API_URL">;
  gateway?: PaymentGateway;
}): BillingDeps {
  const log = createLogger({ name: "billing" });
  const gateway = opts.gateway ?? (opts.env ? createPaymentGateway(opts.env) : undefined);
  return {
    plans: new DrizzlePlansRepo(opts.db),
    orgPlan: opts.orgPlan,
    usage: opts.usage ?? { thisMonth: async () => ({ dossiers: 0, pages: 0, aiCostVnd: "0", hsCostVnd: "0", customsCostVnd: "0" }) },
    clock: opts.clock ?? systemClock,
    uow: new DrizzleBillingUow(opts.db),
    idGen: ulidIdGen,
    ...(opts.reserved ? { reserved: opts.reserved } : {}),
    ...(gateway ? { gateway } : {}),
    appUrl: opts.env?.APP_URL ?? "",
    log: (msg, meta) => log.warn(msg, meta),
  };
}
