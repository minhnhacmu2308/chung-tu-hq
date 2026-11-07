// Tháng báo cáo – code thuần, cùng đầu vào luôn ra cùng kết quả.
const DAY = 86_400_000;
const VN_OFFSET = 7 * 3_600_000;

/** Tháng theo giờ Việt Nam "YYYY-MM" (báo cáo tính theo tháng VN). */
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

/** Số ngày từ hôm nay (UTC) tới ngày `d`; âm = đã qua. */
export const daysUntil = (d: Date, now: Date) => Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / DAY);
