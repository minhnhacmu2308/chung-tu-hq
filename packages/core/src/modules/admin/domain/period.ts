// Kỳ gói, hạn mức nới thêm, tháng báo cáo – code thuần, cùng đầu vào luôn ra cùng kết quả.
const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;

/** Tháng theo giờ Việt Nam "YYYY-MM" (hạn mức, báo cáo tính theo tháng VN). Hạn mức hồ sơ (activeQuotaBonus…) ở shared/quota. */
export const vnMonth = (at: Date) => new Date(at.getTime() + VN_OFFSET).toISOString().slice(0, 7);

/** Khoảng UTC [from, to) của một tháng VN. */
export function vnMonthRange(month: string): { from: Date; to: Date } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { from: new Date(Date.UTC(y, m - 1, 1) - VN_OFFSET), to: new Date(Date.UTC(y, m, 1) - VN_OFFSET) };
}

/** `count` tháng VN gần nhất, mới nhất đứng đầu. */
export function recentMonths(now: Date, count = 6): string[] {
  const cur = vnMonth(now);
  const [y, m] = cur.split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, k) => new Date(Date.UTC(y, m - 1 - k, 1)).toISOString().slice(0, 7));
}

export type PlanPeriodInput = { planCode: string; createdAt: Date; planStartedAt: Date | null; trialEndsAt: Date | null };

/**
 * Ngày gia hạn: mốc (đổi gói gần nhất, hoặc ngày tạo) + bội số 30 ngày kế tiếp sau `now`.
 * Gói dùng thử đã được gia hạn tay → đúng ngày `trialEndsAt` (kể cả đã qua, để hiện "đã hết hạn").
 */
export function renewsAt(p: PlanPeriodInput, now: Date): Date {
  if (p.planCode === "TRIAL" && p.trialEndsAt) return p.trialEndsAt;
  const anchor = p.planStartedAt ?? p.createdAt;
  const elapsed = Math.max(0, now.getTime() - anchor.getTime());
  return new Date(anchor.getTime() + (Math.floor(elapsed / (30 * DAY)) + 1) * 30 * DAY);
}

/** Gia hạn dùng thử: cộng từ hạn hiện tại, hoặc từ hôm nay nếu đã hết hạn. */
export function extendTrial(current: Date, now: Date, days: number): Date {
  return new Date(Math.max(current.getTime(), now.getTime()) + days * DAY);
}


/** Số ngày từ hôm nay (UTC) tới ngày `d`; âm = đã qua. */
export const daysUntil = (d: Date, now: Date) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY);
