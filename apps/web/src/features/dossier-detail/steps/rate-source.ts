// Dòng mô tả nguồn tỷ giá tính thuế trên màn Review (tuần áp dụng + Vietcombank / nhập tay / dữ liệu mẫu).
import { weekStart, type ExchangeRateInfo } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { formatDate } from "@/lib/format";
import { RATE_SOURCE_MESSAGES } from "./rate-source.messages";

const DAY = 86_400_000;
/** Ngày/tháng ngắn: "19/10" (vi) · "10/19" (en, zh). */
const ddmm = (iso: string, locale: UiLocale) => (locale === "vi" ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : `${iso.slice(5, 7)}/${iso.slice(8, 10)}`);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
/** Giờ bảng Vietcombank theo giờ VN (UTC+7) – không phụ thuộc múi giờ của máy xem. */
const vnTime = (iso: string, locale: UiLocale) => {
  const t = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${t.slice(11, 16)} ${ddmm(t.slice(0, 10), locale)}`;
};

export function rateSourceHint(info: ExchangeRateInfo | null | undefined, rateDate: string, locale: UiLocale): string {
  const t = pickMessages(RATE_SOURCE_MESSAGES, locale);
  if (!info) return fill(t.noRate, { date: formatDate(rateDate, locale) });
  const week = fill(t.week, { from: ddmm(info.effectiveFrom, locale), to: ddmm(addDays(info.effectiveFrom, 6), locale) });
  const src = info.source === "VCB" ? `Vietcombank${info.snapshotAt ? fill(t.vcbAt, { time: vnTime(info.snapshotAt, locale) }) : ""}` : info.source === "MANUAL" ? t.manual : t.seed;
  // Tuần của ngày tra chưa có tỷ giá → tra "gần nhất" rơi về tuần trước: nói rõ để người duyệt biết.
  const needed = weekStart(rateDate);
  const stale = weekStart(info.effectiveFrom) !== needed ? fill(t.stale, { week: ddmm(needed, locale) }) : "";
  return `${week} · ${src}${stale}`;
}
