import { z } from "zod";
import { nDate, nNum, nStr, UncertaintiesSchema } from "./common.js";

export const ChargeSchema = z.object({ label: nStr("Tên khoản phí nguyên văn (Ocean freight, THC, D/O…)"), amount: nNum("Số tiền"), currency: nStr("Tiền tệ") });

export const ArrivalNoticeExtractionSchema = z.object({
  billNo: nStr("Số vận đơn tham chiếu"),
  vessel: nStr("Tàu / chuyến"),
  eta: nDate("Ngày dự kiến đến (ETA)"),
  portOfDischarge: nStr("Cảng dỡ"),
  finalDestination: nStr("Điểm đến cuối tại Việt Nam (kho/cảng/ICD)"),
  charges: z.array(ChargeSchema).describe("Các khoản phí liệt kê"),
  uncertainties: UncertaintiesSchema,
});
export type ArrivalNoticeExtraction = z.infer<typeof ArrivalNoticeExtractionSchema>;
