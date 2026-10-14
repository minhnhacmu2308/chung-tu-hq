import { z } from "zod";
import { nDate, nNum, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const SalesContractExtractionSchema = z.object({
  contractNo: nStr("Số hợp đồng"),
  date: nDate("Ngày ký"),
  seller: PartySchema,
  buyer: PartySchema,
  incoterm: nStr("Điều kiện giao hàng"),
  currency: nStr("Mã tiền tệ"),
  totalAmount: nNum("Tổng trị giá hợp đồng"),
  paymentTerms: nStr("Điều khoản thanh toán"),
  uncertainties: UncertaintiesSchema,
});
export type SalesContractExtraction = z.infer<typeof SalesContractExtractionSchema>;
