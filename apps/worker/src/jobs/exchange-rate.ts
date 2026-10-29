import { captureWeeklyRates, ensureCurrentWeekRates, type RateDeps } from "@kb/core/modules/admin";

/** Tối thứ Năm (23:30 giờ VN): chụp bảng tỷ giá Vietcombank → tỷ giá tính thuế tuần sau. Lỗi ném ra để BullMQ thử lại (mỗi 30 phút tới sáng thứ Sáu). */
export async function exchangeRateJob(deps: RateDeps) {
  const r = await captureWeeklyRates(deps);
  return r.ok ? `tuần ${r.value.effectiveFrom}: ${r.value.count} ngoại tệ (bảng ${r.value.boardAt})` : r.error.code;
}

/** Khi worker khởi động + mỗi sáng: tuần đang áp dụng chưa có tỷ giá Vietcombank/nhập tay → lấy bù bảng thứ Năm tuần trước. */
export async function exchangeRateCatchUpJob(deps: RateDeps) {
  const r = await ensureCurrentWeekRates(deps);
  if (!r.ok) return r.error.code;
  return "skipped" in r.value ? `tuần ${r.value.effectiveFrom}: đã có tỷ giá` : `lấy bù tuần ${r.value.effectiveFrom}: ${r.value.count} ngoại tệ (bảng ${r.value.boardAt})`;
}
