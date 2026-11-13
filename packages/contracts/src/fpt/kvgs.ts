// Danh sách container qua khu vực giám sát (V5ContainerReq/Res – KHAI BAO DANH SACH CONTAINER v1.1.xlsx) và KVGS (ADR 0014).
// V5ContainerRes: key camelCase .NET theo Excel; số FPT trả dạng số (SO_TN, NAM_TN…) → chuỗi.
// KVGS: `POST /api/KVGS` một lời gọi đồng bộ (đặc tả API-KVGS của FPT) – giữ đúng tên trường (hoa/thường, gạch dưới); ánh xạ sang KvgsSheet ở core (kvgs-mapper).
import { z } from "zod";
import { FptErrorItemSchema } from "./common.js";

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

/** Bước 1 (V5ContainerReq) chỉ cần `reF_ID`. */
export const FptRefIdResponseSchema = z.looseObject({ reF_ID: fptText.nullish() });

/** Body `POST /api/KVGS`: ngày đăng ký `dd/MM/yyyy`; số tờ khai, mã Hải quan, MST là chuỗi (giữ số 0 đầu). */
export const FptKvgsRequestSchema = z.object({
  TK_SOTK: z.string().min(1),
  TK_NGAYDK: z.string().regex(/^\d{2}\/\d{2}\/\d{4}$/),
  TK_MAHQ: z.string().min(1),
  MA_DV: z.string().min(1),
});
export type FptKvgsRequest = z.infer<typeof FptKvgsRequestSchema>;

const text = z.string().nullish();
/** Số lượng / trọng lượng: đặc tả là number; chấp nhận cả chuỗi số (không ép kiểu ở đây). */
const quantity = z.union([z.number(), z.string()]).nullish();

/** Một dòng bảng kê container: `barcodeImage` = ảnh mã vạch Base64 thuần (PNG). */
export const FptKvgsContainerRowSchema = z.looseObject({
  soContainer: text,
  soSeal: text,
  /** API đã bỏ chuỗi `#####`. */
  soSealHQ: text,
  barcodeImage: text,
});

export const FptKvgsServiceMessageSchema = z.looseObject({
  /** 1 hàng container, 0 hàng lẻ. */
  isContainer: z.union([z.number(), z.string()]).nullish(),
  /** Hàng lẻ: []; hàng container cũng có thể [] khi Hải quan không trả dòng. */
  bangKeMaVachContainer: z.array(FptKvgsContainerRowSchema).nullish(),
  so_Luong_Hang: quantity,
  dvT_So_Luong_Hang: text,
  tong_Trong_Luong_Hang: quantity,
  dvT_Tong_Trong_Luong_Hang: text,
  soToKhai: text,
  /** `dd/MM/yyyy`. */
  ngayToKhai: text,
  loaiHinh: text,
  tenLoaiHinh: text,
  maTrangThaiToKhai: text,
  trangThaiToKhai: text,
  luongToKhai: text,
  maSoThue: text,
  tenDonViXNK: text,
  maDDGS: text,
  tenDDGS: text,
  tenChiCucHaiQuanGS: text,
  tenCucHaiQuan: text,
  tenChiCucHaiQuan: text,
  soDinhDanh: text,
  maPTVC: text,
  ngayTau: text,
  ghi_Chu: text,
  /** `dd/MM/yyyy HH:mm:ss`, giờ Việt Nam. */
  thoiGianLayDuLieu: text,
  /** Thông báo lỗi của Hải quan – controller đã chuyển sang `errorList` khi có lỗi. */
  thongBaoLoi: text,
});
export type FptKvgsServiceMessage = z.infer<typeof FptKvgsServiceMessageSchema>;

/** Phản hồi `POST /api/KVGS` (HTTP 200): `errorList` rỗng = tra cứu thành công; `serviceMessage` null khi controller trả lỗi. */
export const FptKvgsResponseSchema = z.looseObject({
  errorList: z.array(FptErrorItemSchema).nullish(),
  serviceMessage: FptKvgsServiceMessageSchema.nullish(),
});
export type FptKvgsResponse = z.infer<typeof FptKvgsResponseSchema>;
