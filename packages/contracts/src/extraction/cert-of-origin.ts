import { z } from "zod";
import { nDate, nStr, PartySchema, UncertaintiesSchema } from "./common.js";

export const CoItemSchema = z.object({
  description: nStr("Mô tả hàng"),
  hs6: nStr("Mã HS 6 số trên C/O"),
  criterion: nStr("Tiêu chí xuất xứ (WO, PE, RVC 40%, CTH…)"),
});

export const CertOfOriginExtractionSchema = z.object({
  form: z.enum(["AK", "D", "E", "VK", "AJ", "AANZ", "AI", "EUR1", "EVFTA_REX", "CPTPP", "RCEP", "OTHER"]).nullable().describe("Mẫu C/O: Form AK (ASEAN–Hàn), D (ATIGA), E (ASEAN–TQ), VK (VN–Hàn), AJ, AANZ, AI, EUR.1; EVFTA_REX nếu tự chứng nhận REX trên invoice; OTHER"),
  coNo: nStr("Số C/O (Reference No.)"),
  issueDate: nDate("Ngày cấp"),
  exporter: PartySchema,
  consignee: PartySchema,
  invoiceNo: nStr("Số invoice ghi trên C/O"),
  invoiceDate: nDate("Ngày invoice ghi trên C/O"),
  originCountry: nStr("Nước xuất xứ (mã ISO-2)"),
  items: z.array(CoItemSchema),
  rexNo: nStr("Số REX (EVFTA tự chứng nhận) nếu có"),
  departureDate: nDate("Ô 3: ngày khởi hành (Departure date)"),
  transportName: nStr("Ô 3: tên tàu/chuyến bay (Vessel's name/Aircraft)"),
  portOfLoading: nStr("Ô 3: nơi đi (FROM …)"),
  portOfDischarge: nStr("Ô 3: cảng dỡ / nơi đến (Port of Discharge, TO …)"),
  packagesDescription: nStr("Ô 7: số và loại kiện kèm mô tả hàng nguyên văn"),
  quantityOrWeight: nStr("Ô 9: trọng lượng cả bì hoặc số lượng nguyên văn (vd 60 sets, 65 PIECES)"),
  certified: z.boolean().nullable().describe("Ô 12 Certification: true nếu có CẢ chữ ký VÀ con dấu cơ quan cấp; false nếu thiếu"),
  uncertainties: UncertaintiesSchema,
});
export type CertOfOriginExtraction = z.infer<typeof CertOfOriginExtractionSchema>;
