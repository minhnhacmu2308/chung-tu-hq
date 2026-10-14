import type { Db } from "../client.js";
import { plans } from "../schema/index.js";

export const PLANS = [
  { code: "TRIAL", name: "Dùng thử", dossiersPerMonth: 10, pagesPerDossier: 20, priceVnd: "0" },
  { code: "BASIC", name: "Cơ bản", dossiersPerMonth: 50, pagesPerDossier: 30, priceVnd: "990000" },
  { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, priceVnd: "2990000" },
  { code: "ENTERPRISE", name: "Doanh nghiệp", dossiersPerMonth: 1000, pagesPerDossier: 100, priceVnd: "0" },
] as const;

export async function seedPlans(db: Db) {
  for (const p of PLANS) {
    await db
      .insert(plans)
      .values(p)
      .onConflictDoUpdate({
        target: plans.code,
        set: { name: p.name, dossiersPerMonth: p.dossiersPerMonth, pagesPerDossier: p.pagesPerDossier, priceVnd: p.priceVnd },
      });
  }
}
