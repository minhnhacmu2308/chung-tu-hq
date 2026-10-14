import { describe, expect, it } from "vitest";
import { fixedClock } from "../../../../shared/clock.js";
import { asOrgId, asUserId } from "../../../../shared/ids.js";
import { unwrap } from "../../../../shared/result.js";
import { getPlanUsage } from "../get-plan-usage.js";
import type { BillingDeps } from "../ports.js";

const deps: BillingDeps = {
  plans: { get: async (code) => (code === "PRO" ? { code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40 } : null) },
  orgPlan: { get: async () => ({ planCode: "PRO", createdAt: new Date("2026-09-20T00:00:00.000Z") }) },
  usage: { thisMonth: async () => ({ dossiers: 3, pages: 41, aiCostVnd: "12500" }) },
  clock: fixedClock("2026-10-13T00:00:00.000Z"),
};
const ctx = { orgId: asOrgId("org_a"), userId: asUserId("usr_a"), role: "VIEWER" as const };

describe("getPlanUsage", () => {
  it("trả gói + mức dùng tháng này; renewsAt là đầu tháng sau", async () => {
    const r = unwrap(await getPlanUsage(deps, ctx));
    expect(r.plan).toEqual({ code: "PRO", name: "Chuyên nghiệp", dossiersPerMonth: 150, pagesPerDossier: 40, renewsAt: "2026-11-01" });
    expect(r.usage).toEqual({ dossiersThisMonth: 3, pagesThisMonth: 41, aiCostVnd: "12500" });
  });
  it("org không có gói hợp lệ → NOT_FOUND", async () => {
    const r = await getPlanUsage({ ...deps, orgPlan: { get: async () => null } }, ctx);
    expect(r.ok).toBe(false);
  });
});
