// Khai báo định danh hàng hóa (FPT V5IdentifierReq / V5IdentifierRes, đặc tả KHAI BAO LAY MA DINH DANH v1.1): xin số định danh + mã QR
// để đưa hàng qua khu vực giám sát. Gửi riêng, không nằm trong tờ khai; mỗi lần gửi một bản ghi (attempt) theo hồ sơ.
import { z } from "zod";
import { IsoDateSchema, IsoDateTimeSchema } from "../common.js";
import { CustomsErrorSchema } from "../dto/customs.js";

/** Ô người khai nhập trong panel "Khai báo định danh" – khóa ô = tên chỉ tiêu FPT (IDENTIFIER_FORM). Mã định danh là chuỗi. */
export const IdentifierRequestSchema = z.object({
  /** LOAI_DT: 1 doanh nghiệp XNK, 2 doanh nghiệp kho, bãi, cảng. */
  objectType: z.enum(["1", "2"]),
  /** LOAI_HH: 1 nhập khẩu, 2 xuất khẩu, 3 hàng nội địa. */
  goodsType: z.enum(["1", "2", "3"]),
  /** MA_HQ: mã chi cục Hải quan khai báo. */
  customsOffice: z.string().trim().min(1).max(10),
  /** MA_DV / TEN_DV: doanh nghiệp khai báo. */
  taxCode: z.string().trim().min(1).max(14),
  companyName: z.string().trim().min(1).max(255),
  /** MA_DAI_LY / TEN_DAI_LY: đại lý khai thay (tùy chọn). */
  agentTaxCode: z.string().trim().max(14).optional(),
  agentName: z.string().trim().max(255).optional(),
  /** USER_ID tài khoản VNACCS; trống → dùng tài khoản VNACCS của doanh nghiệp. */
  userId: z.string().trim().max(50).optional(),
});
export type IdentifierRequest = z.infer<typeof IdentifierRequestSchema>;

/** TRANG_THAI: 15 → ACCEPTED (có số định danh), 10 → REJECTED, 0/11/12 → SENDING (chờ duyệt); hết lượt hỏi → NO_RESPONSE. */
export const IdentifierStatusSchema = z.enum(["SENDING", "ACCEPTED", "REJECTED", "NO_RESPONSE"]);
export type IdentifierStatus = z.infer<typeof IdentifierStatusSchema>;

export const IdentifierRecordSchema = z.object({
  attempt: z.number().int().positive(),
  status: IdentifierStatusSchema,
  request: IdentifierRequestSchema,
  refId: z.string().nullable(),
  receiptNo: z.string().nullable(),
  receiptDate: IsoDateSchema.nullable(),
  /** Mã trạng thái tiếp nhận Hải quan trả (TRANG_THAI: 0/10/11/12/15). */
  customsState: z.string().nullable(),
  identifierNo: z.string().nullable(),
  identifiedOn: IsoDateSchema.nullable(),
  /** Ảnh QR định danh (CODE_CONTENT) – Base64 PNG thuần. */
  qrPng: z.string().nullable(),
  /** KET_QUA: câu kết quả Hải quan trả (tiếng Việt, giữ nguyên). */
  resultText: z.string().nullable(),
  errors: z.array(CustomsErrorSchema),
  sentAt: IsoDateTimeSchema,
});
export type IdentifierRecord = z.infer<typeof IdentifierRecordSchema>;

/** Màn Khai báo định danh của hồ sơ: lần gửi gần nhất (null = chưa gửi). */
export const IdentifierViewSchema = z.object({ dossierId: z.string(), latest: IdentifierRecordSchema.nullable() });
export type IdentifierView = z.infer<typeof IdentifierViewSchema>;
