import type { DecimalString } from "@kb/contracts";
import type { Clock } from "../../../shared/clock.js";

export type PlanRow = { code: string; name: string; dossiersPerMonth: number; pagesPerDossier: number };
export interface PlansReader {
  get(code: string): Promise<PlanRow | null>;
}
export interface OrgPlanReader {
  get(orgId: string): Promise<{ planCode: string; createdAt: Date } | null>;
}
export type BillingDeps = {
  plans: PlansReader;
  orgPlan: OrgPlanReader;
  /** Mức dùng tháng hiện tại; GĐ 6 lấy từ usage_events/dossiers. */
  usage: { thisMonth(orgId: string, now: Date): Promise<{ dossiers: number; pages: number; aiCostVnd: DecimalString }> };
  clock: Clock;
};
