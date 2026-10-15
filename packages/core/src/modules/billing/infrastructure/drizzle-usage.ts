import { and, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../../../db/client.js";
import { usageEvents } from "../../../db/schema/billing.js";
import { withCtx } from "../../../db/with-ctx.js";
import { Decimal, dec, toDecimalString } from "../../../shared/decimal.js";
import { asOrgId, asUserId, ulidIdGen } from "../../../shared/ids.js";

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
  async record(e: { orgId: string; dossierId: string | null; documentId: string | null; kind: string; provider: string; model: string; inputTokens: number; outputTokens: number }): Promise<string> {
    const id = ulidIdGen.next("use");
    const usd = costUsd(e.model, e.inputTokens, e.outputTokens);
    await withCtx(this.db, { orgId: asOrgId(e.orgId), userId: asUserId("") }, (tx) =>
      tx.insert(usageEvents).values({
        id, orgId: e.orgId, dossierId: e.dossierId, documentId: e.documentId, kind: e.kind, provider: e.provider, model: e.model, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
        costUsd: toDecimalString(usd, 6), costVnd: toDecimalString(usd.mul(this.usdVnd), 2),
      }),
    );
    return id;
  }
  /** Tổng chi phí AI (VND) và số trang đã đọc của tháng chứa `now`. */
  async monthlyTotals(orgId: string, now: Date): Promise<{ aiCostVnd: string; events: number }> {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const row = await withCtx(this.db, { orgId: asOrgId(orgId), userId: asUserId("") }, async (tx) =>
      (await tx.select({ cost: sql<string>`coalesce(sum(${usageEvents.costVnd}), 0)`, n: sql<number>`count(*)::int` }).from(usageEvents).where(and(eq(usageEvents.orgId, orgId), gte(usageEvents.at, start))))[0],
    );
    return { aiCostVnd: toDecimalString(dec(String(row?.cost ?? "0")), 0), events: row?.n ?? 0 };
  }
}
