// Dòng mô tả nguồn tỷ giá tính thuế trên màn Review (tuần áp dụng + Vietcombank / nhập tay / dữ liệu mẫu).
import { weekStart, type ExchangeRateInfo } from "@kb/contracts";
import { formatDate } from "@/lib/format";

const DAY = 86_400_000;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Giờ bảng Vietcombank theo giờ VN (UTC+7) – không phụ thuộc múi giờ của máy xem. */
const vnTime = (iso: string) => {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${t.slice(11, 16)} ${ddmm(t.slice(0, 10))}`;
};

export function rateSourceHint(info: ExchangeRateInfo | null | undefined, rateDate: string): string {
  if (!info) return `Ngày ${formatDate(rateDate)} · chưa có tỷ giá chính thức cho ngoại tệ này – quản trị nhập tay`;
  const week = `Tuần ${ddmm(info.effectiveFrom)} – ${ddmm(addDays(info.effectiveFrom, 6))}`;
  const src = info.source === "VCB" ? `Vietcombank${info.snapshotAt ? `, bảng lúc ${vnTime(info.snapshotAt)}` : ""}` : info.source === "MANUAL" ? "đội vận hành nhập tay" : "dữ liệu mẫu (chưa phải tỷ giá chính thức)";
  // Tuần của ngày tra chưa có tỷ giá → tra "gần nhất" rơi về tuần trước: nói rõ để người duyệt biết.
  const needed = weekStart(rateDate);
  const stale = weekStart(info.effectiveFrom) !== needed ? ` · ⚠ chưa có tỷ giá tuần ${ddmm(needed)} – đang dùng tỷ giá tuần trước, quản trị cần nhập/kiểm tra` : "";
  return `${week} · ${src}${stale}`;
}
