// Tỷ giá tính thuế theo tuần (BACKEND-TODO D2): tỷ giá mua chuyển khoản Vietcombank cuối ngày thứ Năm tuần trước,
// áp cho tờ khai đăng ký trong tuần (Điều 21 khoản 5 NĐ 08/2015, sửa bởi NĐ 167/2025). `effectiveFrom` = thứ Hai của tuần áp dụng.
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

/** VCB: tự lấy từ Vietcombank · MANUAL: đội vận hành nhập tay (tỷ giá chéo NHNN, sửa) · SEED: dữ liệu mẫu. */
export const ExchangeRateSourceSchema = z.enum(["VCB", "MANUAL", "SEED"]);
export type ExchangeRateSource = z.infer<typeof ExchangeRateSourceSchema>;

export const ExchangeRateSchema = z.object({
  currency: z.string().length(3),
  effectiveFrom: IsoDateSchema,
  rate: DecimalStringSchema,
  source: ExchangeRateSourceSchema,
  /** Giờ của bảng Vietcombank đã chụp (VCB). */
  snapshotAt: IsoDateTimeSchema.nullable(),
  updatedByName: z.string().nullable(),
  note: z.string().nullable(),
});
export type ExchangeRate = z.infer<typeof ExchangeRateSchema>;

export const ExchangeRateFetchSchema = z.object({
  id: z.string(), ranAt: IsoDateTimeSchema, effectiveFrom: IsoDateSchema, status: z.enum(["OK", "FAILED"]), count: z.number().int().nonnegative(),
  boardAt: IsoDateTimeSchema.nullable(), error: z.string().nullable(),
});
export type ExchangeRateFetch = z.infer<typeof ExchangeRateFetchSchema>;

export const ExchangeRatesViewSchema = z.object({
  weeks: z.array(z.object({ effectiveFrom: IsoDateSchema, rates: z.array(ExchangeRateSchema) })),
  lastFetch: ExchangeRateFetchSchema.nullable(),
  /** Lần chạy tự động kế tiếp (thứ Năm 23:30 giờ VN). */
  nextRunAt: IsoDateTimeSchema,
});
export type ExchangeRatesView = z.infer<typeof ExchangeRatesViewSchema>;

/** YYYY-MM-DD là thứ Hai (lịch, không phụ thuộc múi giờ). */
export const isMonday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 1;

const VN_OFFSET_MS = 7 * 3_600_000; // Việt Nam không đổi giờ mùa hè
const DAY_MS = 86_400_000;
/** Ngày nghiệp vụ (YYYY-MM-DD) theo giờ Việt Nam. */
export const vnDateOf = (d: Date) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
export const addIsoDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
/** Thứ Hai của tuần chứa ngày `iso` (tuần tỷ giá: thứ Hai → Chủ nhật). */
export function weekStart(iso: string): string {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Chủ nhật
  return addIsoDays(iso, -((dow + 6) % 7));
}
/** Hai ngày nghiệp vụ cùng một tuần áp dụng tỷ giá tính thuế. */
export const sameRateWeek = (a: string, b: string) => weekStart(a) === weekStart(b);
