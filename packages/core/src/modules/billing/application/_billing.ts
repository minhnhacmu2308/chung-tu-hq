// Dùng chung trong các use case billing: đọc gói của org, ánh xạ DTO, chốt thanh toán (webhook / tra cứu / giả lập / đối soát).
import type { CreditLedgerEntry, OrgContract, OrgPlan, Payment, PaymentStatus } from "@kb/contracts";
import { dec, toDecimalString } from "../../../shared/decimal.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { createLogger } from "../../../shared/log.js";
import { contractStatus } from "../domain/contract.js";
import { ledgerKeys } from "../domain/credits.js";
import type { BillingDeps, ContractRow, LedgerRow, PaymentRow, PlanRow } from "./ports.js";

/** Ngữ cảnh RLS cho việc hệ thống tự ghi (webhook, worker): org của dòng, không người dùng. */
export const systemCtx = (orgId: string) => ({ orgId: asOrgId(orgId), userId: asUserId("") });

export const SYSTEM_ACTOR = "system";

const fallbackLog = createLogger({ name: "billing" });
/** Log một dòng (không chứa khóa): `deps.log` nếu có, không thì logger JSON chung. */
export const logOf = (deps: Pick<BillingDeps, "log">) => deps.log ?? ((msg: string, meta?: Record<string, unknown>) => fallbackLog.warn(msg, meta));

/** Gói hiện tại của org (đọc NGOÀI transaction – port của module khác). */
export async function loadPlan(deps: Pick<BillingDeps, "orgPlan" | "plans">, orgId: string): Promise<PlanRow | null> {
  const op = await deps.orgPlan.get(orgId);
  return op ? deps.plans.get(op.planCode) : null;
}

export const toOrgPlan = (p: PlanRow): OrgPlan => ({
  code: p.code as OrgPlan["code"], name: p.name, kind: p.kind, pagesPerDossier: p.pagesPerDossier, pricePerDeclarationVnd: toDecimalString(dec(p.pricePerDeclarationVnd), 0),
});

/** Hợp đồng → DTO; org CONTRACT chưa có dòng hợp đồng = chưa có ngày kết thúc (ACTIVE, khu Quản trị nhắc nhập). */
export function toOrgContract(c: ContractRow | null, now: Date): OrgContract {
  const s = contractStatus({ endsOn: c?.endsOn ?? null }, now);
  return { contractNo: c?.contractNo ?? null, startsOn: c?.startsOn ?? null, endsOn: c?.endsOn ?? null, status: s.status, daysLeft: s.daysLeft };
}

const vnd = (v: string) => toDecimalString(dec(v), 0);

export const toLedgerEntry = (l: LedgerRow): CreditLedgerEntry => ({
  id: l.id, at: l.at.toISOString(), delta: l.delta, reason: l.reason, amountVnd: vnd(l.amountVnd), unitPriceVnd: vnd(l.unitPriceVnd),
  dossierId: l.dossierId, branch: l.branch, declarationNo: l.declarationNo, paymentId: l.paymentId, note: l.note, createdBy: l.createdBy,
});

export const toPayment = (p: PaymentRow): Payment => ({
  id: p.id, provider: "PAYOS", orderCode: p.orderCode, credits: p.credits, amountVnd: vnd(p.amountVnd), status: p.status,
  checkoutUrl: p.checkoutUrl, createdAt: p.createdAt.toISOString(), paidAt: p.paidAt?.toISOString() ?? null,
});

/** `amount`: số tiền cổng báo (VND) – số nguyên từ PayOS hoặc chuỗi thập phân (giả lập). */
export type PaymentOutcome = { status: PaymentStatus; amount: number | string; raw: Record<string, unknown> };

/**
 * Áp kết quả thanh toán lên một đơn (idempotent):
 * - PAID đúng số tiền → PAID + sổ lượt PURCHASE (delta = số lượt) CÙNG transaction, khóa `payos:<orderCode>`. Đơn đang EXPIRED/CANCELLED
 *   mà PayOS xác nhận đã trả (khách trả trễ) → vẫn chuyển PAID và cộng lượt (khóa giữ đúng một lần) + log cảnh báo – không để mất tiền khách.
 * - PAID lệch số tiền → KHÔNG cộng lượt, log để đối soát tay; chỉ lưu `raw` khi đơn còn PENDING.
 * - CANCELLED / EXPIRED → chỉ đổi khi đơn còn PENDING. PENDING → giữ nguyên.
 * Đơn đã PAID → trả nguyên (webhook/tra cứu đến lần 2 không cộng thêm). Không bao giờ ghi đè `raw` của đơn đã chốt.
 */
export async function settlePayment(deps: BillingDeps, p: PaymentRow, outcome: PaymentOutcome, source: string): Promise<PaymentRow> {
  if (outcome.status === "PENDING" || p.status === "PAID") return p;
  const paid = outcome.status === "PAID";
  if (!paid && p.status !== "PENDING") return p;
  const now = deps.clock.now();
  const raw = { ...outcome.raw, source };
  const log = logOf(deps);
  if (paid && !dec(p.amountVnd).eq(dec(outcome.amount))) {
    log("[billing] Số tiền PayOS báo khác số tiền đơn – không cộng lượt, cần đối soát tay", { orgId: p.orgId, paymentId: p.id, orderCode: p.orderCode, expected: vnd(p.amountVnd), got: String(outcome.amount), source });
    if (p.status !== "PENDING") return p;
    await deps.uow.asOrg(systemCtx(p.orgId), (r) => r.payments.update(p.orgId, p.id, { raw: { ...raw, amountMismatch: true } }));
    return { ...p, raw };
  }
  const after = await deps.uow.asOrg(systemCtx(p.orgId), async (r) => {
    // Đọc lại trong transaction: hai lần áp song song (webhook + tra cứu) → lần sau thấy PAID, không ghi lại; khóa sổ lượt chặn trùng lần nữa.
    const cur = await r.payments.get(p.orgId, p.id);
    if (!cur || cur.status === "PAID") return { row: cur ?? p, late: null };
    if (!paid) {
      if (cur.status !== "PENDING") return { row: cur, late: null };
      await r.payments.update(p.orgId, p.id, { status: outcome.status, raw });
      return { row: { ...cur, status: outcome.status, raw }, late: null };
    }
    await r.payments.update(p.orgId, p.id, { status: "PAID", paidAt: now, raw: cur.status === "PENDING" ? raw : { ...raw, paidAfter: cur.status } });
    await r.ledger.insert({
      id: ledgerKeys.purchase(p.orderCode), orgId: p.orgId, delta: p.credits, reason: "PURCHASE", amountVnd: toDecimalString(dec(p.amountVnd), 0),
      unitPriceVnd: toDecimalString(dec(p.amountVnd).div(p.credits), 0), dossierId: null, branch: null, declarationNo: null, paymentId: p.id,
      note: `Mua ${p.credits} lượt qua PayOS (mã đơn ${p.orderCode})`, createdBy: SYSTEM_ACTOR, at: now,
    });
    return { row: { ...cur, status: "PAID" as const, paidAt: now, raw }, late: cur.status === "PENDING" ? null : cur.status };
  });
  if (after.late) log("[billing] PayOS xác nhận đã trả cho đơn đã hết hạn/hủy – vẫn cộng lượt", { orgId: p.orgId, paymentId: p.id, orderCode: p.orderCode, wasStatus: after.late, source });
  return after.row;
}
