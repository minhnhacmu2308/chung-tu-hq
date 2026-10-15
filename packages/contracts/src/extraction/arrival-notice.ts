import { z } from "zod";
import { nDate, nNum, nStr, UncertaintiesSchema } from "./common.js";

export const ChargeSchema = z.object({ label: nStr("Tên khoản phí nguyên văn (Ocean freight, THC, D/O…)"), amount: nNum("Số tiền"), currency: nStr("Tiền tệ") });

export const ArrivalNoticeExtractionSchema = z.object({
  billNo: nStr("Số vận đơn tham chiếu"),
  vessel: nStr("Tàu / chuyến"),
  eta: nDate("Ngày dự kiến đến (ETA)"),
  portOfDischarge: nStr("Cảng dỡ"),
  finalDestination: nStr("Điểm đến cuối tại Việt Nam (kho/cảng/ICD)"),
  masterBillNo: nStr("Vận đơn chính (MB/L, MAWB) nếu in"),
  transportMode: z.enum(["SEA", "AIR"]).nullable().describe("SEA nếu là tàu/vận đơn đường biển, AIR nếu chuyến bay/AWB"),
  flightNo: nStr("Số hiệu chuyến bay (hàng air)"),
  portOfLoading: nStr("Nơi đi / cảng xếp / sân bay đi (Từ, From)"),
  packages: nNum("Số lượng kiện (SỐ LƯỢNG / Packages)"),
  packageUnit: nStr("Loại kiện (PALLET, PACKAGES, CARTON…)"),
  grossWeightKg: nNum("Khối lượng cả bì (kg) (KHỐI LƯỢNG / Gross Weight)"),
  warehouseCode: nStr("Mã kho / CY / địa điểm lưu kho (vd 02B1A04, 02CIS01) – chỉ phần mã; null nếu chỉ có tên"),
  warehouseName: nStr("Tên kho / CY (vd KHO SCSC, CÁT LÁI KHO 3)"),
  note: nStr("Ghi chú (Note) nguyên văn, vd CFS/CFS"),
  charges: z.array(ChargeSchema).describe("Các khoản phí liệt kê"),
  uncertainties: UncertaintiesSchema,
});
export type ArrivalNoticeExtraction = z.infer<typeof ArrivalNoticeExtractionSchema>;
