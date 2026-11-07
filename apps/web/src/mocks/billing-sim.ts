// Gói & lượt khai của bản mock (ADR 0011) – cùng quy tắc backend (module billing): quy tắc thuần lấy từ @kb/contracts (contractStatus, allowanceDecision).
// Số dư = tổng delta của sổ lượt; lượt đang giữ = tờ khai nhánh đã có số (khai tạm) chưa khai chính thức của doanh nghiệp demo.
import {
  allowanceDecision, availableCredits, contractCoversMonth, contractStatus, MAX_CREDITS_PER_PURCHASE,
  type BillingOverview, type CreditReason, type OrgBilling, type OrgContract, type OrgPlan, type Organization, type Payment, type PlanCode,
} from "@kb/contracts";
import { ApiError } from "@/lib/api-error";
import { fromMinor, toMinor } from "@/lib/decimal";
import { reasonApiError } from "./reason-error";
import type { MockLedgerEntry, MockPayment } from "./billing-types";
import type { MockDb } from "./db";

export type { MockBilling, MockContract, MockLedgerEntry, MockPayment } from "./billing-types";

/** Phần DB mà quy tắc lượt cần (khu Quản trị dùng chung). */
export type BillingScope = Pick<MockDb, "billing" | "admin">;

const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;
const LEDGER_PAGE = 50;
const RECENT_PAYMENTS = 20;
const newId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
const vnd = (v: string) => fromMinor(toMinor(v, 0), 0);

/** Gói theo mã (bảng gói ở khu Quản trị – sửa ở đó hiện ngay bên khách). */
export function planView(db: BillingScope, code: string): OrgPlan {
  const p = db.admin.plans.find((x) => x.code === code) ?? db.admin.plans[0]!;
  return { code: p.code, name: p.name, kind: p.kind, pagesPerDossier: p.pagesPerDossier, pricePerDeclarationVnd: vnd(p.pricePerDeclarationVnd) };
}

export const balanceOf = (db: Pick<MockDb, "billing">, orgId: string) => db.billing.ledger.filter((l) => l.orgId === orgId).reduce((n, l) => n + l.delta, 0);

export function contractView(db: Pick<MockDb, "billing">, orgId: string, now = new Date()): OrgContract {
  const c = db.billing.contracts[orgId];
  const s = contractStatus({ endsOn: c?.endsOn ?? null }, now);
  return { contractNo: c?.contractNo ?? null, startsOn: c?.startsOn ?? null, endsOn: c?.endsOn ?? null, status: s.status, daysLeft: s.daysLeft };
}

/** Khoảng UTC [from, to) của tháng VN chứa `now`. */
export function vnMonthRange(now: Date): { from: number; to: number } {
  const month = new Date(now.getTime() + VN_OFFSET).toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { from: Date.UTC(y, m - 1, 1) - VN_OFFSET, to: Date.UTC(y, m, 1) - VN_OFFSET };
}

/** Số tờ khai đã tính (CHARGE / CONTRACT_USE) của org trong [from, to). */
export const declarationsBetween = (db: Pick<MockDb, "billing">, orgId: string, from: number, to: number) =>
  db.billing.ledger.filter((l) => l.orgId === orgId && (l.reason === "CHARGE" || l.reason === "CONTRACT_USE") && Date.parse(l.at) >= from && Date.parse(l.at) < to).length;

const RESERVED_STAGES = new Set(["PRE_DECLARED", "RECALLED"]);

/** Lượt đang giữ của doanh nghiệp demo: tờ khai nhánh đã có số (PRE_DECLARED / RECALLED) chưa khai chính thức, bỏ hồ sơ đã hủy. */
export function reservedOf(db: MockDb): number {
  let n = 0;
  for (const [key, flow] of Object.entries(db.customsFlows ?? {})) {
    if (!RESERVED_STAGES.has(flow.stage)) continue;
    const i = key.lastIndexOf(":");
    const dossierId = i < 0 ? key : key.slice(0, i);
    const no = i < 0 ? 1 : Number(key.slice(i + 1)) || 1;
    const result = no <= 1 ? db.customsResults.find((r) => r.dossierId === dossierId) : db.customsBranchResults?.[key];
    if (!result?.declarationNo) continue;
    if (db.dossiers.find((d) => d.id === dossierId)?.status === "CANCELLED") continue;
    n++;
  }
  return n;
}

/** Lượt / hợp đồng của một org. `reserved` chỉ tính được cho doanh nghiệp demo (doanh nghiệp mẫu khác không có hồ sơ trong mock). */
export function orgBillingOf(db: MockDb, orgId: string, planCode: string, now = new Date()): OrgBilling {
  const plan = planView(db, planCode);
  const balance = balanceOf(db, orgId);
  const reserved = orgId === db.org.id ? reservedOf(db) : 0;
  const { from, to } = vnMonthRange(now);
  return {
    balance, reserved, available: availableCredits(balance, reserved),
    contract: plan.kind === "CONTRACT" ? contractView(db, orgId, now) : null,
    declarationsThisMonth: declarationsBetween(db, orgId, from, to),
  };
}

/** Doanh nghiệp demo như backend trả (GET /api/org, phiên): gói + lượt tính lúc đọc. */
export function orgView(db: MockDb): Organization {
  return { ...db.org, plan: planView(db, db.org.plan.code), billing: orgBillingOf(db, db.org.id, db.org.plan.code) };
}

/**
 * Chặn trước khi khai tạm lần đầu `sheets` tờ (spec §4.2, như checkDeclarationAllowance của backend):
 * PAYG thiếu lượt → INSUFFICIENT_CREDITS (402); CONTRACT hết hạn quá 7 ngày ân hạn → CONTRACT_EXPIRED (402).
 */
export function assertAllowance(db: MockDb, sheets: number, ownReserved = 0): void {
  if (sheets <= 0) return;
  const plan = planView(db, db.org.plan.code);
  const b = orgBillingOf(db, db.org.id, plan.code);
  const d = allowanceDecision({ kind: plan.kind, balance: b.balance, reserved: b.reserved, sheetsToStart: sheets, ownReserved, contract: b.contract?.status ?? null });
  if (d.ok) return;
  if (d.code === "INSUFFICIENT_CREDITS") {
    const e = reasonApiError("INSUFFICIENT_CREDITS", "INSUFFICIENT_CREDITS", { needed: d.needed, available: d.available });
    throw new ApiError(e.code, e.message, 402, { reason: "INSUFFICIENT_CREDITS", params: { needed: d.needed, available: d.available } });
  }
  // YYYY-MM-DD như backend – giao diện định dạng theo ngôn ngữ.
  const endsOn = b.contract?.endsOn ?? "";
  const e = reasonApiError("CONTRACT_EXPIRED", "CONTRACT_EXPIRED", { endsOn });
  throw new ApiError(e.code, e.message, 402, { reason: "CONTRACT_EXPIRED", params: { endsOn } });
}

/** Thêm một dòng sổ lượt; trùng id (khóa chống trùng) → bỏ qua. Trả true khi thật sự thêm. */
export function addLedger(db: Pick<MockDb, "billing">, e: Omit<MockLedgerEntry, "amountVnd" | "unitPriceVnd" | "dossierId" | "branch" | "declarationNo" | "paymentId" | "note"> & Partial<MockLedgerEntry>): boolean {
  if (db.billing.ledger.some((l) => l.id === e.id)) return false;
  db.billing.ledger.unshift({ amountVnd: "0", unitPriceVnd: "0", dossierId: null, branch: null, declarationNo: null, paymentId: null, note: null, ...e });
  return true;
}

/**
 * Tờ khai nhánh được Hải quan chấp nhận khai chính thức (IDC/EDC thành công): PAYG trừ 1 lượt (CHARGE, tiền = đơn giá lúc trừ),
 * CONTRACT đếm (CONTRACT_USE). Khóa `charge:<orgId>:<số tờ khai>` – khai lại / IDC01 cùng số không trừ lần 2.
 */
export function recordDeclared(db: MockDb, e: { dossierId: string; branch: number; declarationNo: string; op: string; at: string }): boolean {
  if (!e.declarationNo) return false;
  const plan = planView(db, db.org.plan.code);
  const payg = plan.kind === "PAYG";
  const unit = payg ? plan.pricePerDeclarationVnd : "0";
  return addLedger(db, {
    id: `charge:${db.org.id}:${e.declarationNo}`, orgId: db.org.id, at: e.at, delta: payg ? -1 : 0, reason: payg ? "CHARGE" : "CONTRACT_USE",
    amountVnd: unit, unitPriceVnd: unit, dossierId: e.dossierId, branch: e.branch, declarationNo: e.declarationNo, note: `${e.op} được chấp nhận`, createdBy: "system",
  });
}

const stripOrg = <T extends { orgId: string }>(x: T): Omit<T, "orgId"> => {
  const { orgId: _o, ...rest } = x;
  return rest;
};

/** Cổng thanh toán (giả lập) có bật không – tắt (như PAYMENT_PROVIDER=none) thì mua lượt / đồng bộ báo chưa bật, đội vận hành nạp tay. */
export const onlinePaymentEnabled = (db: Pick<MockDb, "billing">) => db.billing.onlinePaymentEnabled !== false;

const paymentOff = () => {
  const e = reasonApiError("INTEGRATION_NOT_CONFIGURED", "PAYMENT_NOT_CONFIGURED");
  return new ApiError(e.code, e.message, 409, { reason: "PAYMENT_NOT_CONFIGURED" });
};

/** GET /api/org/billing của doanh nghiệp demo. */
export function billingOverview(db: MockDb): BillingOverview {
  const org = orgView(db);
  return {
    plan: org.plan,
    onlinePaymentEnabled: onlinePaymentEnabled(db),
    billing: org.billing,
    ledger: db.billing.ledger.filter((l) => l.orgId === db.org.id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, LEDGER_PAGE).map(stripOrg),
    payments: db.billing.payments.filter((p) => p.orgId === db.org.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_PAYMENTS).map(stripOrg),
  };
}

/** Mua lượt (chỉ OWNER/ADMIN, chỉ PAYG, 1–1000 lượt): đơn PENDING, checkout giả quay về /settings?tab=plan&payment=…&fake=1. */
export function startPurchase(db: MockDb, credits: number): { paymentId: string; checkoutUrl: string } {
  const role = db.members.find((m) => m.id === db.currentUserId)?.role;
  if (role !== "OWNER" && role !== "ADMIN") throw new ApiError("FORBIDDEN", "Cần vai trò ADMIN", 403);
  if (!onlinePaymentEnabled(db)) throw paymentOff();
  if (!Number.isInteger(credits) || credits < 1 || credits > MAX_CREDITS_PER_PURCHASE) throw new ApiError("VALIDATION", `Số lượt mua phải từ 1 đến ${MAX_CREDITS_PER_PURCHASE}`);
  const plan = planView(db, db.org.plan.code);
  if (plan.kind !== "PAYG") throw new ApiError("INVALID_STATE", "Gói Hợp đồng năm khai không giới hạn trong hạn – không cần mua lượt", 409);
  const id = newId("pay");
  const checkoutUrl = `/settings?tab=plan&payment=${encodeURIComponent(id)}&fake=1`;
  db.billing.payments.unshift({
    id, orgId: db.org.id, provider: "PAYOS", orderCode: (Date.now() % 1e12) * 1000 + Math.floor(Math.random() * 1000), credits,
    amountVnd: fromMinor(toMinor(plan.pricePerDeclarationVnd, 0) * credits, 0), status: "PENDING", checkoutUrl, createdAt: new Date().toISOString(), paidAt: null,
  });
  return { paymentId: id, checkoutUrl };
}

/** Chốt đơn đã trả: PAID + PURCHASE (delta = số lượt), khóa `payos:<orderCode>`. Không còn PENDING → giữ nguyên (idempotent). */
function markPaid(db: MockDb, p: MockPayment): void {
  if (p.status !== "PENDING") return;
  const at = new Date().toISOString();
  p.status = "PAID";
  p.paidAt = at;
  addLedger(db, {
    id: `payos:${p.orderCode}`, orgId: p.orgId, at, delta: p.credits, reason: "PURCHASE", amountVnd: p.amountVnd,
    unitPriceVnd: fromMinor(Math.round(toMinor(p.amountVnd, 0) / p.credits), 0), paymentId: p.id, note: `Mua ${p.credits} lượt qua PayOS (mã đơn ${p.orderCode})`, createdBy: "system",
  });
}

function paymentOf(db: MockDb, id: string): MockPayment {
  const p = db.billing.payments.find((x) => x.id === id && x.orgId === db.org.id);
  if (!p) throw new ApiError("NOT_FOUND", "Không tìm thấy thanh toán", 404);
  return p;
}

/** Trang return gọi sau khi thanh toán: như FakePaymentGateway của backend – cổng giả lập luôn báo PENDING, đơn giữ nguyên trạng thái. */
export function syncPayment(db: MockDb, id: string): Payment {
  if (!onlinePaymentEnabled(db)) throw paymentOff();
  return stripOrg(paymentOf(db, id));
}

/** Route dev `simulate-paid` (PAYMENT_PROVIDER=fake): coi như khách đã trả đúng số tiền → PAID + cộng lượt (một lần). */
export function simulatePaid(db: MockDb, id: string): Payment {
  const p = paymentOf(db, id);
  markPaid(db, p);
  return stripOrg(p);
}

/** Nhãn loại dòng sổ lượt trong nhật ký quản trị. */
export const MANUAL_KIND_LABEL: Partial<Record<CreditReason, string>> = { MANUAL_TOPUP: "Nạp tay", GRANT: "Tặng", REFUND: "Hoàn", ADJUST: "Điều chỉnh" };

/** Doanh thu ghi nhận của org trong tháng (báo cáo khu Quản trị): PAYG = tổng tiền CHARGE; CONTRACT = giá trị/12 nếu hợp đồng phủ tháng. */
export function revenueOf(db: BillingScope, orgId: string, planCode: PlanCode, month: string, from: number, to: number): { declarations: number; revenueVnd: string; collectedVnd: string } {
  const rows = db.billing.ledger.filter((l) => l.orgId === orgId && Date.parse(l.at) >= from && Date.parse(l.at) < to);
  const declarations = rows.filter((l) => l.reason === "CHARGE" || l.reason === "CONTRACT_USE").length;
  const collected = rows.filter((l) => l.reason === "PURCHASE").reduce((n, l) => n + toMinor(l.amountVnd, 0), 0);
  let revenue = rows.filter((l) => l.reason === "CHARGE").reduce((n, l) => n + toMinor(l.amountVnd, 0), 0);
  if (planView(db, planCode).kind === "CONTRACT") {
    const c = db.billing.contracts[orgId];
    revenue = c && contractCoversMonth({ startsOn: c.startsOn ?? null, endsOn: c.endsOn ?? null }, month) ? Math.round(toMinor(c.valueVnd, 0) / 12) : 0;
  }
  return { declarations, revenueVnd: fromMinor(revenue, 0), collectedVnd: fromMinor(collected, 0) };
}

/** Số tờ khai đã tính trong 30 ngày qua (mục cần chú ý LOW_CREDITS). */
export const declarations30d = (db: Pick<MockDb, "billing">, orgId: string, now = Date.now()) => declarationsBetween(db, orgId, now - 30 * DAY, now + 1);
