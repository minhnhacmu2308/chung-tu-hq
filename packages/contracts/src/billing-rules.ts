// Quy tắc gói PAYG / CONTRACT (ADR 0011) – THUẦN, dùng chung backend (module billing) và mock FE để hai bên cùng một quy tắc.
import type { ContractStatus, PlanKind } from "./dto/billing.js";

/** Còn ≤ 30 ngày → cảnh báo sắp hết hạn (vẫn khai được). */
export const CONTRACT_WARN_DAYS = 30;
/** Quá hạn ≤ 7 ngày → ân hạn (vẫn khai được); quá 7 ngày → khóa khai tạm lần đầu. */
export const CONTRACT_GRACE_DAYS = 7;

const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;

/** Ngày hôm nay theo giờ VN, "YYYY-MM-DD". */
export const vnToday = (now: Date) => new Date(now.getTime() + VN_OFFSET).toISOString().slice(0, 10);

/** Số ngày từ `from` tới `to` (YYYY-MM-DD); âm = `to` đã qua. */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

export type ContractState = { status: ContractStatus; daysLeft: number | null };

/**
 * - ACTIVE: chưa có ngày kết thúc, hoặc còn > 30 ngày.
 * - EXPIRING: hôm nay ≤ ends_on và còn ≤ 30 ngày (vẫn ACTIVE về quyền khai, chỉ cảnh báo).
 * - GRACE: ends_on < hôm nay ≤ ends_on + 7.
 * - EXPIRED: hôm nay > ends_on + 7 → khóa khai tạm lần đầu.
 */
export function contractStatus(c: { endsOn: string | null }, now: Date): ContractState {
  if (!c.endsOn) return { status: "ACTIVE", daysLeft: null };
  const daysLeft = daysBetween(vnToday(now), c.endsOn);
  if (daysLeft > CONTRACT_WARN_DAYS) return { status: "ACTIVE", daysLeft };
  if (daysLeft >= 0) return { status: "EXPIRING", daysLeft };
  if (daysLeft >= -CONTRACT_GRACE_DAYS) return { status: "GRACE", daysLeft };
  return { status: "EXPIRED", daysLeft };
}

/** Hợp đồng phủ (ít nhất một ngày của) tháng VN "YYYY-MM": bắt đầu ≤ cuối tháng và (chưa có ngày kết thúc hoặc kết thúc ≥ đầu tháng). */
export function contractCoversMonth(c: { startsOn: string | null; endsOn: string | null }, month: string): boolean {
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return (!c.startsOn || c.startsOn <= last) && (!c.endsOn || c.endsOn >= first);
}

/** Doanh nghiệp còn ≤ 3 lượt khả dụng → nhắc mua thêm (dashboard khách, mục cần chú ý của khu Quản trị). */
export const LOW_CREDITS = 3;
/** Lượt tặng khi doanh nghiệp tự đăng ký (D4) và khi chuyển từ gói cũ (D6). */
export const SIGNUP_GRANT_CREDITS = 3;

/** Lượt khả dụng = số dư − lượt đang giữ cho tờ khai đã có số nhưng chưa khai chính thức. Có thể âm. */
export const availableCredits = (balance: number, reserved: number) => balance - reserved;

export type AllowanceInput = {
  kind: PlanKind;
  balance: number;
  reserved: number;
  /** Số tờ khai nhánh lần gửi này sẽ dùng lượt (khi Hải quan chấp nhận khai chính thức). */
  sheetsToStart: number;
  /** Trong `sheetsToStart`, số tờ ĐÃ nằm trong `reserved` (khai chính thức cả lô: các tờ đã khai tạm) – không tính hai lần. */
  ownReserved?: number;
  contract: ContractStatus | null;
};

export type AllowanceDecision =
  | { ok: true }
  | { ok: false; code: "INSUFFICIENT_CREDITS"; needed: number; available: number }
  | { ok: false; code: "CONTRACT_EXPIRED" };

/**
 * Chặn trước khi gửi khai tạm lần đầu (spec §4.2):
 * - PAYG: cần available ≥ sheetsToStart (available tính bỏ các tờ của chính lần gửi đã nằm trong reserved).
 * - CONTRACT: EXPIRED → chặn; GRACE / EXPIRING / ACTIVE → cho gửi.
 */
export function allowanceDecision(i: AllowanceInput): AllowanceDecision {
  if (i.sheetsToStart <= 0) return { ok: true };
  if (i.kind === "CONTRACT") return i.contract === "EXPIRED" ? { ok: false, code: "CONTRACT_EXPIRED" } : { ok: true };
  const available = availableCredits(i.balance, i.reserved - Math.min(i.ownReserved ?? 0, i.reserved));
  return available >= i.sheetsToStart ? { ok: true } : { ok: false, code: "INSUFFICIENT_CREDITS", needed: i.sheetsToStart, available: Math.max(available, 0) };
}
