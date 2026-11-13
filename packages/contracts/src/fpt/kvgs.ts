// Danh sách container qua khu vực giám sát (V5ContainerReq/Res – KHAI BAO DANH SACH CONTAINER v1.1.xlsx) và KVGS (ADR 0014).
// V5ContainerRes: key camelCase .NET theo Excel; số FPT trả dạng số (SO_TN, NAM_TN…) → chuỗi. KVGS: phản hồi thô CHƯA có đặc tả – xem kvgs-mapper.
import { z } from "zod";

const fptText = z.union([z.string(), z.number()]).transform(String);

/** `tranG_THAI`: 0 nhập mới, 10 từ chối, 11 chưa có phản hồi, 12 Hải quan chấp nhận. */
export const V5ContainerResSchema = z.looseObject({
  reF_ID: fptText.nullish(),
  sO_TN: fptText.nullish(),
  ngaY_TN: z.string().nullish(),
  naM_TN: fptText.nullish(),
  tranG_THAI: fptText.nullish(),
  keT_QUA: z.string().nullish(),
});
export type V5ContainerRes = z.infer<typeof V5ContainerResSchema>;

/** Bước 1 (V5ContainerReq / KVGS) chỉ cần `reF_ID`. */
export const FptRefIdResponseSchema = z.looseObject({ reF_ID: fptText.nullish() });
