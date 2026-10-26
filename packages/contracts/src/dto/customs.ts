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
  direction: z.enum(["OUT", "IN", "NOTE"]),
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

/**
 * Thông tin Hải quan trả về cho tờ khai (người khai không nhập) – đọc từ phản hồi IDA/IDC/IID (VN_IDA, VN_IDA_HANG, VN_IDA_THUE,
 * VN_IDA_CTHQ, VN_IDA_TRANGTHAI) và EDA/EDC/IEX (VN_EDA, VN_EDA_HANG, VN_EDA_CTHQ, VN_EDA_TRANGTHAI). Đặc tả VNACCS_IDA/EDA v1.2.
 * Mọi trường tùy chọn: Hải quan trả dần theo nghiệp vụ (số tờ khai sau khai tạm, phân luồng/ngày đăng ký sau khai chính thức, cấp phép khi thông quan).
 */
export const CustomsInfoTaxSchema = z.object({
  /** Mã sắc thuế (THUE_KF*), ví dụ "N" nhập khẩu, "V" GTGT. */
  code: z.string().optional(),
  name: z.string(),
  amountVnd: DecimalStringSchema,
});
export const CustomsInfoItemSchema = z.object({
  lineNo: z.number().int().positive(),
  hsCode: z.string().optional(),
  /** Trị giá tính thuế Hải quan tính cho dòng (HAG_B36/HAG_R07). */
  customsValue: DecimalStringSchema.optional(),
  customsValueCurrency: z.string().optional(),
  /** Thuế suất chính (nhập khẩu / xuất khẩu), %. */
  taxRate: DecimalStringSchema.optional(),
  /** Tiền thuế chính (nhập khẩu HAG_B47 / xuất khẩu HAG_TAX), VND. */
  taxAmountVnd: DecimalStringSchema.optional(),
});
export const CustomsDirectiveSchema = z.object({ date: IsoDateSchema.optional(), title: z.string().optional(), content: z.string() });
export const CustomsInfoSchema = z.object({
  /** Lần cuối nhận phản hồi có dữ liệu. */
  receivedAt: IsoDateTimeSchema,
  declarationNo: z.string().optional(),
  /** Tờ khai chia nhỏ: nhánh thứ mấy / tổng số (TK_BNO / TK_DNO). */
  branch: z.object({ no: z.number().int(), of: z.number().int() }).optional(),
  /** Ngày giờ đăng ký (TK_A09/TK_AD11 · TK_K10/TK_RT1) – mốc áp tỷ giá, thuế suất. */
  registeredDate: IsoDateSchema.optional(),
  registeredTime: z.string().optional(),
  customsOfficeName: z.string().optional(),
  /** Đội thủ tục (TK_CHB) Hải quan xác định. */
  subsection: z.string().optional(),
  /** Mã phân loại kiểm tra (TK_A06 / TK_K07). */
  inspectionCode: z.string().optional(),
  /** Mã số hàng hóa đại diện (TK_A00 / TK_K01). */
  representativeHs: z.string().optional(),
  pages: z.number().int().optional(),
  lines: z.number().int().optional(),
  exchangeRates: z.array(z.object({ currency: z.string(), rate: DecimalStringSchema })),
  totalCustomsValue: z.object({ amount: DecimalStringSchema, currency: z.string() }).optional(),
  taxes: z.array(CustomsInfoTaxSchema),
  totalTaxVnd: DecimalStringSchema.optional(),
  guaranteeVnd: DecimalStringSchema.optional(),
  items: z.array(CustomsInfoItemSchema),
  /** Phân loại chỉ thị (CTHQ_CCM): A hướng dẫn sửa đổi, B thay đổi khai báo. */
  directiveKind: z.string().optional(),
  directives: z.array(CustomsDirectiveSchema),
  permitDate: IsoDateSchema.optional(),
  permitTime: z.string().optional(),
  inspectionDoneDate: IsoDateSchema.optional(),
  chiefName: z.string().optional(),
});
export type CustomsInfo = z.infer<typeof CustomsInfoSchema>;

/** Một lỗi Hải quan/FPT trả về: `field` = mã chỉ tiêu lỗi (indexCode, ví dụ "EPN"), `line` = dòng hàng (rowPosition). */
export const CustomsErrorSchema = z.object({ code: z.string(), message: z.string(), solution: z.string().optional(), field: z.string().optional(), line: z.number().int().positive().optional() });
/** Lần gửi gần nhất bị từ chối (còn hiệu lực tới khi chính nghiệp vụ đó gửi lại thành công). */
export const CustomsRejectionSchema = z.object({ operation: CustomsOperationSchema, at: IsoDateTimeSchema, errors: z.array(CustomsErrorSchema) });
export type CustomsError = z.infer<typeof CustomsErrorSchema>;
export type CustomsRejection = z.infer<typeof CustomsRejectionSchema>;
export type CustomsInfoTax = z.infer<typeof CustomsInfoTaxSchema>;
export type CustomsInfoItem = z.infer<typeof CustomsInfoItemSchema>;
export type CustomsDirective = z.infer<typeof CustomsDirectiveSchema>;

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
