// MỌI hiển thị số/tiền/ngày đi qua đây (apps/web/CLAUDE.md). Tiền nhận chuỗi thập phân, không dùng number để tính.
const LOCALE = "vi-VN";

/** "20850.5" → "20.850,50". Chỉ để HIỂN THỊ (Number đủ chính xác cho in ra, không dùng để cộng trừ tiền). */
export function formatMoney(value: string, currency?: string, fractionDigits = 2): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const s = n.toLocaleString(LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
  return currency ? `${s} ${currency}` : s;
}

/** Tiền VND: không phần lẻ. */
export const formatVnd = (value: string) => formatMoney(value, "VND", 0);

export function formatNumber(value: string | number, fractionDigits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString(LOCALE, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

/** "2026-10-12" → "12/10/2026". */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Thời điểm UTC → "12/10/2026 14:05" giờ máy người dùng. */
export function formatDateTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleString(LOCALE, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "5 phút trước", "2 giờ trước", "3 ngày trước". */
export function formatRelative(iso: string, now = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (diff < 1) return "vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const h = Math.round(diff / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d} ngày trước` : formatDate(iso);
}

/** Số ngày từ hôm nay đến hạn (âm = quá hạn). */
export function daysUntil(isoDate: string, now = new Date()): number {
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = isoDate.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - today) / 86_400_000);
}

/** "Quá hạn 2 ngày" / "Hôm nay" / "Còn 3 ngày". */
export function formatDue(isoDate: string): string {
  const n = daysUntil(isoDate);
  if (n < 0) return `Quá hạn ${-n} ngày`;
  if (n === 0) return "Hạn hôm nay";
  return `Còn ${n} ngày`;
}

export function formatBytesVi(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024, 0)} KB`;
  return `${formatNumber(bytes / 1024 / 1024, 1)} MB`;
}

/** Giờ:phút:giây – cho nhật ký tiến trình / thông điệp. */
export function formatTime(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return t.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
