import { describe, expect, it } from "vitest";
import { dossierQuota, isQuotaError } from "./dossier-quota";

const org = (used: number, perMonth: number, bonus?: number) => ({
  plan: { code: "TRIAL" as const, name: "Dùng thử", dossiersPerMonth: perMonth, pagesPerDossier: 20, renewsAt: "2026-11-23", ...(bonus === undefined ? {} : { bonusThisMonth: bonus }) },
  usage: { dossiersThisMonth: used, pagesThisMonth: 0, aiCostVnd: "0", hsCostVnd: "0", customsCostVnd: "0" },
});

describe("dossierQuota", () => {
  it("5/10 còn tạo được; 10/10 là hết", () => {
    expect(dossierQuota(org(5, 10))).toEqual({ used: 5, limit: 10, full: false });
    expect(dossierQuota(org(10, 10))).toEqual({ used: 10, limit: 10, full: true });
  });
  it("cộng phần nới thêm của tháng", () => {
    expect(dossierQuota(org(10, 10, 5))).toEqual({ used: 10, limit: 15, full: false });
  });
  it("nhận ra lỗi QUOTA_EXCEEDED", () => {
    expect(isQuotaError(Object.assign(new Error("x"), { code: "QUOTA_EXCEEDED" }))).toBe(true);
    expect(isQuotaError(new Error("x"))).toBe(false);
  });
});
