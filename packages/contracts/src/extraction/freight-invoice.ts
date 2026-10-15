import { z } from "zod";
import { nDate, nNum, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const FreightInvoiceExtractionSchema = z.object({
  invoiceNo: nStr("Số hóa đơn (hóa đơn GTGT: ký hiệu + số)"),
  date: nDate("Ngày hóa đơn"),
  issuer: PartySchema.describe("Đơn vị phát hành (forwarder / hãng tàu)"),
  totalAmount: nNum("Tổng tiền thanh toán"),
  currency: nStr("Tiền tệ (VND/USD)"),
  vatAmount: nNum("Tiền thuế GTGT nếu tách riêng"),
  billRef: nStr("Số vận đơn/AWB ghi trong nội dung hóa đơn (vd B/L: FANS25040166)"),
  services: z.array(z.object({ label: nStr("Tên dịch vụ (cước vận chuyển quốc tế, phí THC, phí D/O…)"), amount: nNum("Số tiền chưa VAT") })),
  uncertainties: UncertaintiesSchema,
});
export type FreightInvoiceExtraction = z.infer<typeof FreightInvoiceExtractionSchema>;
