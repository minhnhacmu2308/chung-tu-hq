// MỌI hiển thị số/tiền/ngày đi qua đây (apps/web/CLAUDE.md). Tiền nhận chuỗi thập phân, không dùng number để tính.
// Định dạng theo ngôn ngữ giao diện: Providers gọi setFormatLocale() khi đổi ngôn ngữ (cả cây được dựng lại).
// Bản in tờ khai (văn bản pháp lý tiếng Việt) truyền `"vi"` tường minh.
import { fill, intlLocale, pickMessages, type UiLocale } from "@kb/ui";
import { FORMAT_MESSAGES } from "./format.messages";

let current: UiLocale = "vi";

export function setFormatLocale(locale: UiLocale): void {
  current = locale;
}

export function getFormatLocale(): UiLocale {
  return current;
}

/** "20850.5" → "20.850,50" (vi) / "20,850.50" (en, zh). Chỉ để HIỂN THỊ (không dùng để cộng trừ tiền). */
export function formatMoney(value: string, currency?: string, fractionDigits = 2, locale: UiLocale = current): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const s = n.toLocaleString(intlLocale(locale), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  return currency ? `${s} ${currency}` : s;
}

/** Tiền VND: không phần lẻ. */
export const formatVnd = (value: string, locale: UiLocale = current) => formatMoney(value, "VND", 0, locale);

export function formatNumber(value: string | number, fractionDigits = 0, locale: UiLocale = current): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(intlLocale(locale), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** "2026-10-12" → "12/10/2026" (vi) · "10/12/2026" (en) · "2026/10/12" (zh). */
export function formatDate(iso: string, locale: UiLocale = current): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!(y && m && d)) return iso;
  if (locale === "en") return `${m}/${d}/${y}`;
  if (locale === "zh") return `${y}/${m}/${d}`;
  return `${d}/${m}/${y}`;
}

/** Thời điểm UTC → "12/10/2026 14:05" giờ máy người dùng. */
export function formatDateTime(iso: string, locale: UiLocale = current): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString(intlLocale(locale), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "5 phút trước", "2 giờ trước", "3 ngày trước". */
export function formatRelative(iso: string, now = Date.now(), locale: UiLocale = current): string {
  const t = pickMessages(FORMAT_MESSAGES, locale);
  const diff = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return t.justNow;
  if (diff < 60) return fill(t.minutesAgo, { n: diff });
  const h = Math.round(diff / 60);
  if (h < 24) return fill(t.hoursAgo, { n: h });
  const d = Math.round(h / 24);
  return d < 30 ? fill(t.daysAgo, { n: d }) : formatDate(iso, locale);
}

/** Số ngày từ hôm nay đến hạn (âm = quá hạn). */
export function daysUntil(isoDate: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - today) / 86_400_000);
}

/** "Quá hạn 2 ngày" / "Hạn hôm nay" / "Còn 3 ngày". */
export function formatDue(isoDate: string, locale: UiLocale = current): string {
  const t = pickMessages(FORMAT_MESSAGES, locale);
  const n = daysUntil(isoDate);
  if (n < 0) return fill(t.overdue, { n: -n });
  if (n === 0) return t.dueToday;
  return fill(t.dueIn, { n });
}

export function formatBytesVi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
}

/** Giờ:phút:giây – cho nhật ký tiến trình / thông điệp. */
export function formatTime(iso: string, locale: UiLocale = current): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
