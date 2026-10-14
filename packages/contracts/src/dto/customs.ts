import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

export const CustomsOperationSchema = z.enum(["IDA", "IDC", "EDA", "EDC", "HYS", "IEX"]);
export type CustomsOperation = z.infer<typeof CustomsOperationSchema>;

export const CustomsMessageSchema = z.object({
  id: z.string(),
  dossierId: z.string(),
  operation: CustomsOperationSchema,
  direction: z.enum(["OUT", "IN"]),
  result: z.enum(["PENDING", "OK", "ERROR"]),
  summary: z.string(),
  at: IsoDateTimeSchema,
  /** Đã che thông tin nhạy cảm. */
  payloadPreview: z.string(),
});
export type CustomsMessage = z.infer<typeof CustomsMessageSchema>;

export const CustomsResultSchema = z.object({
  dossierId: z.string(),
  declarationNo: z.string(),
  channel: CustomsChannelSchema,
  channelNote: z.string(),
  /** REJECTED: Hải quan từ chối tờ khai (tra IEX) – hiện rõ để người khai xử lý, không gộp vào "đang kiểm tra". */
  clearanceStatus: z.enum(["WAITING", "INSPECTING", "CLEARED", "REJECTED"]),
  customsTaxVnd: DecimalStringSchema,
  updatedAt: IsoDateTimeSchema,
});
export type CustomsResult = z.infer<typeof CustomsResultSchema>;

export const DigitalCertificateSchema = z.object({
  id: z.string(),
  subject: z.string(),
  /** VNPT-CA, Viettel-CA… */
  issuer: z.string(),
  serial: z.string(),
  validTo: IsoDateSchema,
  isDefault: z.boolean(),
});
export type DigitalCertificate = z.infer<typeof DigitalCertificateSchema>;
