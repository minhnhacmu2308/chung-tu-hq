import { captureWeeklyRates, type RateDeps } from "@kb/core/modules/admin";

/** Tối thứ Năm (23:30 giờ VN): chụp bảng tỷ giá Vietcombank → tỷ giá tính thuế tuần sau. Lỗi ném ra để BullMQ thử lại (mỗi 30 phút tới sáng thứ Sáu). */
export async function exchangeRateJob(deps: RateDeps) {
  const r = await captureWeeklyRates(deps);
  return r.ok ? `tuần ${r.value.effectiveFrom}: ${r.value.count} ngoại tệ (bảng ${r.value.boardAt})` : r.error.code;
}
