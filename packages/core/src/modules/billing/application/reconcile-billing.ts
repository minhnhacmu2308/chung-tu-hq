import type { DeclaredBranch } from "../../../shared/billing.js";
import { logOf, settlePayment, systemCtx } from "./_billing.js";
import type { BillingDeps, GatewayPaymentStatus } from "./ports.js";
import { recordDeclared } from "./record-declared.js";

/** Thanh toán còn PENDING quá 15 phút → tra cứu PayOS một lần mỗi lượt đối soát. Hạn đơn / hạn link PayOS: 24 giờ. */
export const PENDING_CHECK_MS = 15 * 60_000;
export const PENDING_EXPIRE_MS = 24 * 3_600_000;
const PENDING_BATCH = 200;

/** Chỉ ghi bù tờ khai được chấp nhận trong 7 ngày gần nhất (job chạy hằng ngày; dư để bù khi job lỗi vài ngày). */
export const RECONCILE_LOOKBACK_MS = 7 * 86_400_000;

export type ReconcileInput = {
  /** Doanh nghiệp cần đối soát lượt (container: mọi org). */
  orgIds: string[];
  /**
   * Tờ khai nhánh được Hải quan chấp nhận khai chính thức (IDC/EDC thành công) từ `since` của một org – module integration cung cấp.
   * `since` = max(mốc đầu tiên của sổ lượt – hoặc ngày tạo org nếu chưa có dòng nào, now − 7 ngày): không tính hồi tố tờ khai trước khi có gói theo lượt.
   */
  declared: (orgId: string, since: Date) => Promise<DeclaredBranch[]>;
};
export type ReconcileReport = { charged: number; paid: number; expired: number; errors: number };

/**
 * Job `billing-reconcile` (hằng ngày, chạy tay được – spec §4.5). Idempotent:
 * 1. Tờ khai nhánh đã IDC/EDC thành công mà chưa có dòng sổ lượt → ghi bù (cùng khóa `charge:<orgId>:<số tờ khai>` nên không trùng).
 * 2. Thanh toán PENDING quá 15 phút → tra cứu PayOS; chốt PAID (cộng lượt) / CANCELLED / EXPIRED **chỉ khi PayOS xác nhận**; tra cứu lỗi → giữ PENDING.
 * Lỗi của một org / một đơn chỉ log, không dừng cả lượt.
 */
export async function reconcileBilling(deps: BillingDeps, input: ReconcileInput): Promise<ReconcileReport> {
  const log = logOf(deps);
  const report: ReconcileReport = { charged: 0, paid: 0, expired: 0, errors: 0 };
  const now = deps.clock.now();
  for (const orgId of input.orgIds) {
    try {
      const first = await deps.uow.asOrg(systemCtx(orgId), (r) => r.ledger.firstAt(orgId));
      const start = first ?? (await deps.orgPlan.get(orgId))?.createdAt ?? now;
      const since = new Date(Math.max(start.getTime(), now.getTime() - RECONCILE_LOOKBACK_MS));
      for (const b of await input.declared(orgId, since)) if (await recordDeclared(deps, b)) report.charged++;
    } catch (e) {
      report.errors++;
      log("[billing] Đối soát lượt lỗi", { orgId, err: e instanceof Error ? e.message : String(e) });
    }
  }
  // Thanh toán còn chờ: chỉ chốt theo trạng thái PayOS xác nhận (PAID / CANCELLED / EXPIRED). Tra cứu lỗi hoặc PayOS vẫn PENDING → giữ nguyên
  // (link PayOS có `expiredAt` = hạn đơn nên PayOS tự báo EXPIRED); không tự đặt EXPIRED – khách trả trễ vẫn được cộng lượt.
  const gateway = deps.gateway;
  const pending = gateway ? await deps.uow.system((r) => r.payments.listPending(new Date(now.getTime() - PENDING_CHECK_MS), PENDING_BATCH)) : [];
  for (const p of pending) {
    let st: GatewayPaymentStatus;
    try {
      st = await gateway!.getStatus(p.orderCode);
    } catch (e) {
      report.errors++;
      log("[billing] Không tra cứu được trạng thái PayOS – giữ PENDING, lần đối soát sau thử lại", { orgId: p.orgId, paymentId: p.id, orderCode: p.orderCode, err: e instanceof Error ? e.message : String(e) });
      continue;
    }
    if (st.status === "PENDING") {
      if (now.getTime() - p.createdAt.getTime() > PENDING_EXPIRE_MS) log("[billing] Đơn quá hạn nhưng PayOS vẫn báo PENDING – giữ nguyên, kiểm tra tay", { orgId: p.orgId, paymentId: p.id, orderCode: p.orderCode });
      continue;
    }
    try {
      const after = await settlePayment(deps, p, st, "reconcile");
      if (after.status === "PAID") report.paid++;
      if (after.status === "EXPIRED") report.expired++;
    } catch (e) {
      report.errors++;
      log("[billing] Đối soát thanh toán lỗi", { orgId: p.orgId, paymentId: p.id, err: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
