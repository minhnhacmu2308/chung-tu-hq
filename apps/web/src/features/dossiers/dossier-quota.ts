import type { Organization } from "@kb/contracts";

/** Hạn mức hồ sơ tháng này của doanh nghiệp (gói + phần đội vận hành nới thêm trong tháng). `full` = đã dùng hết, tạo nữa sẽ bị chặn. */
export function dossierQuota(org: Pick<Organization, "plan" | "usage">): { used: number; limit: number; full: boolean } {
  const limit = org.plan.dossiersPerMonth + (org.plan.bonusThisMonth ?? 0);
  const used = org.usage.dossiersThisMonth;
  return { used, limit, full: used >= limit };
}

export const isQuotaError = (e: unknown) => e instanceof Error && (e as Error & { code?: unknown }).code === "QUOTA_EXCEEDED";
