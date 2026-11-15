// FPT.VNACCS khai báo định danh hàng hóa (KHAI BAO LAY MA DINH DANH v1.1): body phẳng (không objVNACCS_ACCOUNT), giữ đúng tên trường FPT.
// Cổng thật trả kết quả ngay trong phản hồi V5IdentifierReq (sO_DD, codE_CONTENT, tranG_THAI 15); cổng chỉ trả reF_ID → hỏi V5IdentifierRes.
import { z } from "zod";

const fptText = z.union([z.string(), z.number()]).transform(String);

/** Body V5IdentifierReq (Postman FPT): mọi trường là chuỗi – MST/mã HQ giữ số 0 đầu. */
export const FptIdentifierRequestSchema = z.object({
  mA_DV: z.string().min(1),
  teN_DV: z.string().min(1),
  loaI_DT: z.enum(["1", "2"]),
  loaI_HH: z.enum(["1", "2", "3"]),
  mA_HQ: z.string().min(1),
  mA_DAI_LY: z.string(),
  teN_DAI_LY: z.string(),
  useR_ID: z.string().min(1),
});
export type FptIdentifierRequest = z.infer<typeof FptIdentifierRequestSchema>;

/** Body V5IdentifierRes (Postman FPT): thông tin doanh nghiệp + reF_ID của lần khai – không gửi loaI_DT / loaI_HH. */
export const FptIdentifierQuerySchema = FptIdentifierRequestSchema.omit({ loaI_DT: true, loaI_HH: true }).extend({ reF_ID: z.string().min(1) });
export type FptIdentifierQuery = z.infer<typeof FptIdentifierQuerySchema>;

/** Phản hồi V5IdentifierReq / V5IdentifierRes: ngày `dd/MM/yyyy`; codE_CONTENT = Base64 PNG mã QR. */
export const V5IdentifierResSchema = z.looseObject({
  reF_ID: fptText.nullish(),
  sO_TN: fptText.nullish(),
  ngaY_TN: z.string().nullish(),
  naM_TN: fptText.nullish(),
  tranG_THAI: fptText.nullish(),
  keT_QUA: z.string().nullish(),
  sO_DD: fptText.nullish(),
  ngaY_DD: z.string().nullish(),
  codE_CONTENT: z.string().nullish(),
});
export type V5IdentifierRes = z.infer<typeof V5IdentifierResSchema>;
