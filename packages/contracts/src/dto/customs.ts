import { z } from "zod";
import { CustomsChannelSchema, DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

/**
 * Nghiệp vụ VNACCS / Customs Hub. Tờ khai nhập: IDA khai tạm, IDB gọi sửa khai tạm, IDC khai chính thức, IDD gọi tờ khai đã phân luồng,
 * IDA01 khai tạm sửa đổi bổ sung, IDE khai chính thức sửa đổi bổ sung, IID tra cứu; tờ khai xuất tương ứng EDA/EDB/EDC/EDD/EDA01/EDE/IEX.
 * Sau thông quan: AMA khai tạm sửa đổi, AMB gọi sửa bản khai AMA, AMC khai chính thức AMA.
 * Chứng từ & cảng: HYS số hóa chứng từ, CONT container qua khu vực giám sát, PORT_FEE lệ phí (phí hạ tầng) cảng biển.
 */
export const CustomsOperationSchema = z.enum([
  "IDA", "IDB", "IDC", "IDD", "IDA01", "IDE", "IID",
  "EDA", "EDB", "EDC", "EDD", "EDA01", "EDE", "IEX",
  "AMA", "AMB", "AMC",
  "HYS", "CONT", "PORT_FEE",
]);
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
