// Nghiệp vụ đi kèm vận đơn trên bản mẫu (thuần): nút nào hiện theo loại tờ khai, giá trị điền sẵn từ tờ khai + kết quả giả theo giai đoạn.
import { BILL_SPLIT_FORM, EXPORT_IDENTIFIER_FORM, IDENTIFIER_FORM, type TransportOperationForm } from "@kb/contracts";
import type { Stage } from "./fixtures";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

/**
 * Tách vận đơn chỉ cho hàng nhập (vận đơn gốc về cảng nhập); định danh cho cả nhập và xuất (xuất: panel có chọn đường biển / hàng không).
 * Đang khai sửa đổi: theo ảnh IDA01 chỉ còn "Chọn số VĐ tách"; EDA01 vẫn còn "Khai mã định danh hàng hóa".
 */
export const operationsFor = (kind: Kind, amending = false): TransportOperationForm[] =>
  kind === "IDA" ? (amending ? [BILL_SPLIT_FORM] : [BILL_SPLIT_FORM, IDENTIFIER_FORM]) : [EXPORT_IDENTIFIER_FORM];

/** Kết quả giả khi tờ khai đã khai: Hải quan đã duyệt định danh. */
const IDENTIFIER_RESULT: FormValues = {
  REF_ID: "DD-2026-000184", SO_TN: "300012845", NGAY_TN: "2026-10-08", NAM_TN: "2026",
  // kb-allow-raw: dữ liệu giả Hải quan trả về (kết quả định danh tiếng Việt như phản hồi VNACCS)
  SO_DD: "26VN01B1000184", NGAY_DD: "2026-10-08", CODE_CONTENT: "Có – tải mã QR khi kết nối", TRANG_THAI: "15", KET_QUA: "Cấp số định danh thành công",
};

export function operationValues(form: TransportOperationForm, kind: Kind, header: FormValues, stage: Stage): FormValues {
  const company = kind === "IDA" ? { MA_DV: header["TK_IMC"] ?? "", TEN_DV: header["TK_IMN"] ?? "" } : { MA_DV: header["TK_EPC"] ?? "", TEN_DV: header["TK_EPN"] ?? "" };
  const declarer = { MA_HQ: header["TK_CH"] ?? "", ...company };
  if (form.id === "dinh-danh") {
    return { LOAI_DT: "1", LOAI_HH: kind === "IDA" ? "1" : "2", ...declarer, ...(stage === "nhap" ? {} : IDENTIFIER_RESULT) };
  }
  return {
    ...declarer,
    TVD_VD_GOC: header["VD_BL1"] ?? "",
    TVD_VD_GOC_NGAY: header["APP_NGAY_VD1"] ?? "",
    TVD_LOAIHANG: header["TK_MTC"]?.trim() === "2" ? "1" : "0",
  };
}
