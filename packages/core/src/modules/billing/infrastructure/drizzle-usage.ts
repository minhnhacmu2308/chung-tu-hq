import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { usageEvents } from "../../../db/schema/billing.js";
import { withCtx } from "../../../db/with-ctx.js";
import { Decimal, dec, toDecimalString } from "../../../shared/decimal.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";
import type { ServiceUsage, ServiceUsageMeter } from "../../../shared/usage.js";
import { serviceCostVnd, type ServicePrices } from "../domain/service-pricing.js";

/** Giá USD/1M token theo bảng giá Anthropic (cập nhật 2026-10). Gồm cả model dự phòng khi model chính từ chối (fallbacks). */
export const MODEL_PRICING_USD_PER_MTOK: Record<string, { input: string; output: string }> = {
  "claude-sonnet-5-5": { input: "2", output: "10" },
  "claude-sonnet-5": { input: "2", output: "10" },
  "claude-opus-5-5": { input: "4", output: "20" },
  "claude-opus-5": { input: "5", output: "25" },
  "claude-opus-4-8": { input: "5", output: "25" },
  "claude-haiku-4-5": { input: "1", output: "5" },
  "claude-haiku-4-5-20251001": { input: "1", output: "5" },
  fake: { input: "0", output: "0" },
};

export function costUsd(model: string, inputTokens: number, outputTokens: number): Decimal {
  const p = MODEL_PRICING_USD_PER_MTOK[model] ?? { input: "3", output: "15" };
  return dec(p.input).mul(inputTokens).plus(dec(p.output).mul(outputTokens)).div(1_000_000);
}

export class DrizzleUsageRecorder {
  constructor(private db: Db, private usdVnd: Decimal) {}
  async record(e: { orgId: string; dossierId: string | null; documentId: string | null; kind: string; provider: string; model: string; inputTokens: number; outputTokens: number; dedupeKey?: string }): Promise<string> {
    // Có dedupeKey → id suy từ khóa, trùng thì bỏ qua (ràng buộc khóa chính): retry sau khi AI đã trả lời không ghi hai lần.
    const id = e.dedupeKey ? usageIdFor(e.dedupeKey) : ulidIdGen.next("use");
    const usd = costUsd(e.model, e.inputTokens, e.outputTokens);
    await withCtx(this.db, { orgId: asOrgId(e.orgId), userId: asUserId("") }, (tx) =>
      tx
        .insert(usageEvents)
        .values({
          id, orgId: e.orgId, dossierId: e.dossierId, documentId: e.documentId, kind: e.kind, provider: e.provider, model: e.model, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
          costUsd: toDecimalString(usd, 6), costVnd: toDecimalString(usd.mul(this.usdVnd), 2), ...(e.dedupeKey ? { meta: { dedupeKey: e.dedupeKey } } : {}),
        })
        .onConflictDoNothing({ target: usageEvents.id }),
    );
    return id;
  }
  /** Chi phí AI (VND) từ 00:00 giờ VN của ngày chứa `now` – cho trần chi phí/ngày. */
  async dailyAiCostVnd(orgId: string, now: Date): Promise<string> {
    const vn = new Date(now.getTime() + 7 * 3_600_000);
    const start = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3_600_000);
    const row = await withCtx(this.db, { orgId: asOrgId(orgId), userId: asUserId("") }, async (tx) =>
      (await tx.select({ ai: sql<string>`coalesce(sum(${usageEvents.costVnd}), 0)::text` }).from(usageEvents).where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.at, start), sql`${usageEvents.kind} like 'AI_%'`)))[0],
    );
    return toDecimalString(dec(String(row?.ai ?? "0")), 0);
  }
  /** Tổng chi phí tháng chứa `now` (VND), tách theo nhà cung cấp theo tiền tố `kind`: AI_* (đọc chứng từ), HS_* (HSCodePro), CUSTOMS_* (Customs Hub). */
  async monthlyTotals(orgId: string, now: Date): Promise<{ aiCostVnd: string; hsCostVnd: string; customsCostVnd: string; events: number }> {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const byPrefix = (prefix: string) => sql<string>`coalesce(sum(case when ${usageEvents.kind} like ${`${prefix}%`} then ${usageEvents.costVnd} else 0 end), 0)::text`;
    const row = await withCtx(this.db, { orgId: asOrgId(orgId), userId: asUserId("") }, async (tx) =>
      (
        await tx
          .select({ ai: byPrefix("AI_"), hs: byPrefix("HS_"), customs: byPrefix("CUSTOMS_"), n: sql<number>`count(*)::int` })
          .from(usageEvents)
          .where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.at, start)))
      )[0],
    );
    const vnd = (v: string | undefined) => toDecimalString(dec(String(v ?? "0")), 0);
    return { aiCostVnd: vnd(row?.ai), hsCostVnd: vnd(row?.hs), customsCostVnd: vnd(row?.customs), events: row?.n ?? 0 };
  }
}

/** id cố định theo khóa chống trùng → ghi lại cùng khóa (job chạy lại) không tạo dòng mới. */
export const usageIdFor = (dedupeKey: string) => `use_${createHash("sha256").update(dedupeKey).digest("hex").slice(0, 32)}`;

/**
 * Ghi chi phí HSCodePro / Customs Hub vào usage_events (cột `model` để trống; nghiệp vụ + số lượng + đơn giá trong `meta`).
 * Tiền tính bằng Decimal theo đơn giá cấu hình (HSCODEPRO_PRICE_PER_ITEM_VND, CUSTOMS_HUB_PRICE_PER_MESSAGE_VND).
 */
export class DrizzleServiceUsageMeter implements ServiceUsageMeter {
  constructor(private db: Db, private prices: ServicePrices) {}
  async record(e: ServiceUsage): Promise<void> {
    const cost = serviceCostVnd(e, this.prices);
    const unit = e.provider === "HSCODEPRO" ? this.prices.hscodeproPerItemVnd : this.prices.customsHubPerMessageVnd;
    const id = e.dedupeKey ? usageIdFor(e.dedupeKey) : ulidIdGen.next("use");
    await withCtx(this.db, { orgId: asOrgId(e.orgId), userId: asUserId("") }, (tx) =>
      tx
        .insert(usageEvents)
        .values({
          id, orgId: e.orgId, dossierId: e.dossierId, documentId: null, kind: e.kind, provider: e.provider, model: null,
          costUsd: "0", costVnd: toDecimalString(cost, 2),
          meta: { ...(e.meta ?? {}), operation: e.operation, quantity: e.quantity, unitPriceVnd: toDecimalString(unit), ...(e.dedupeKey ? { dedupeKey: e.dedupeKey } : {}) },
        })
        .onConflictDoNothing({ target: usageEvents.id }),
    );
  }
}
