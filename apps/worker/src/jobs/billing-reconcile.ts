import { reconcileBilling, type BillingDeps } from "@kb/core/modules/billing";
import type { DeclaredBranch } from "@kb/core/shared";

/** Nguồn dữ liệu do container nối: mọi doanh nghiệp (identity) + tờ khai được chấp nhận từ mốc (integration). */
export type BillingReconcileSource = { orgIds: () => Promise<string[]>; declared: (orgId: string, since: Date) => Promise<DeclaredBranch[]> };

/**
 * Hằng ngày (và chạy tay bằng cách đẩy job `billing-reconcile`): ghi bù lượt cho tờ khai đã được chấp nhận khai chính thức mà sổ lượt còn thiếu,
 * tra cứu / hết hạn thanh toán PayOS còn chờ. Idempotent (khóa sổ lượt) – không có payload.
 */
export async function billingReconcileJob(deps: BillingDeps, src: BillingReconcileSource) {
  const r = await reconcileBilling(deps, { orgIds: await src.orgIds(), declared: src.declared });
  return `charged=${r.charged} paid=${r.paid} expired=${r.expired} errors=${r.errors}`;
}
