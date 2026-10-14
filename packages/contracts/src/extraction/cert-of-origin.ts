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
  uncertainties: UncertaintiesSchema,
});
export type CertOfOriginExtraction = z.infer<typeof CertOfOriginExtractionSchema>;
