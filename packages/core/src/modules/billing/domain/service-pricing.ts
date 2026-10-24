// Giá vốn dịch vụ ngoài AI (HSCodePro, Customs Hub). Đơn giá do cấu hình (env) – chưa có bảng giá hợp đồng nên mặc định 0.
import type { ServiceUsage } from "../../../shared/usage.js";
import { Decimal } from "../../../shared/decimal.js";

export type ServicePrices = {
  /** VND cho mỗi dòng hàng gửi HSCodePro phân loại (tạo lượt / phân loại lại / trả lời câu hỏi). */
  hscodeproPerItemVnd: Decimal;
  /** VND cho mỗi thông điệp gửi Customs Hub (nghiệp vụ hoặc hỏi trạng thái). */
  customsHubPerMessageVnd: Decimal;
};

export const ZERO_SERVICE_PRICES: ServicePrices = { hscodeproPerItemVnd: new Decimal(0), customsHubPerMessageVnd: new Decimal(0) };

/**
 * Chi phí (VND) của một lệnh gọi:
 * - HSCodePro: đơn giá × số dòng gửi đi; HS_RESULT (lượt hỏi nhận kết quả) = 0 vì dòng đã tính tiền lúc gửi – không tính hai lần.
 * - Customs Hub: đơn giá × số thông điệp.
 * Số lượng âm/không nguyên → coi là 0 (không ghi chi phí âm).
 */
export function serviceCostVnd(e: Pick<ServiceUsage, "provider" | "kind" | "quantity">, prices: ServicePrices): Decimal {
  const qty = Number.isInteger(e.quantity) && e.quantity > 0 ? e.quantity : 0;
  if (e.provider === "HSCODEPRO") return e.kind === "HS_RESULT" ? new Decimal(0) : prices.hscodeproPerItemVnd.mul(qty);
  return prices.customsHubPerMessageVnd.mul(qty);
}
