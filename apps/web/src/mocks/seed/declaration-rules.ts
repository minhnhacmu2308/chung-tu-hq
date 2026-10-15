// Phạm vi cấu hình chỉ tiêu cho bản mock – rút gọn từ quy tắc thật (@kb/core declaration/domain/mapping, ruleOptionsView).
import type { RuleOptionView } from "@kb/contracts";

const profile = (code: string) => ({ id: `profile.${code}`, label: "Mặc định khai báo" });
const rule = (code: string, no: string | null, label: string, required: boolean, sources: { id: string; label: string }[], allowFixed: boolean): RuleOptionView => ({ code, no, label, required, sources, allowFixed, locked: false });
const locked = (code: string, no: string | null, label: string): RuleOptionView => ({ code, no, label, required: true, sources: [], allowFixed: false, locked: true });

const NK: RuleOptionView[] = [
  rule("SO_VD", "1.26", "Số vận đơn", true, [{ id: "transport.houseBillNo", label: "Vận đơn nhà (HB/L, HAWB)" }, { id: "transport.masterBillNo", label: "Vận đơn chủ (MB/L, MAWB)" }], false),
  rule("KHO", "1.29", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", true, [{ id: "an.warehouse", label: "Kho / CY trên Arrival Notice" }, profile("KHO")], true),
  rule("NGAY_DEN", "1.32", "Ngày hàng đến", true, [{ id: "transport.arrivalDate", label: "Ngày đến (ETA) trên Arrival Notice" }, { id: "transport.departureDate", label: "Ngày đi (ngày B/L, ngày bay)" }], false),
  rule("PT_TT", "1.43", "Phương thức thanh toán", true, [profile("PT_TT")], true),
  rule("KHAI_TG", "1.45", "Mã phân loại khai trị giá", true, [profile("KHAI_TG")], true),
  rule("NGUOI_NT", "1.52", "Người nộp thuế", true, [profile("NGUOI_NT")], true),
  rule("PL_CN", "1.7", "Mã phân loại cá nhân/tổ chức", true, [profile("PL_CN")], true),
  rule("HD_PL", "1.39", "Phân loại hình thức hóa đơn", true, [profile("HD_PL")], true),
  rule("GIA_PL", "1.44", "Mã phân loại giá hóa đơn", true, [profile("GIA_PL")], true),
  locked("TONG_TG", "1.44", "Tổng trị giá hóa đơn"),
  locked("TY_GIA", null, "Tỷ giá tính thuế"),
  locked("PHI_VC", "1.47", "Phí vận chuyển"),
];
const XK: RuleOptionView[] = [
  rule("SO_VD", "2.24", "Số vận đơn / booking", false, [{ id: "transport.houseBillNo", label: "Vận đơn nhà (HB/L, HAWB)" }, { id: "transport.masterBillNo", label: "Vận đơn chủ (MB/L, MAWB)" }], false),
  rule("KHO", "2.27", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", true, [profile("KHO")], true),
  rule("NGAY_DI", "2.31", "Ngày hàng đi dự kiến", false, [{ id: "transport.departureDate", label: "Ngày đi (ngày B/L, ngày bay)" }], true),
  rule("PT_TT", "2.38", "Phương thức thanh toán", true, [profile("PT_TT")], true),
  rule("GIA_PL", "2.39", "Mã phân loại giá hóa đơn", true, [profile("GIA_PL")], true),
  locked("TONG_TG", "2.39", "Tổng trị giá hóa đơn"),
  locked("TY_GIA", null, "Tỷ giá tính thuế"),
];

export const mockRules = (direction: "NK" | "XK"): RuleOptionView[] => (direction === "NK" ? NK : XK);
