// Nghiệp vụ đi kèm vận đơn (thuần): nút nào hiện theo loại tờ khai, giá trị điền sẵn từ tờ khai.
import { BILL_SPLIT_FORM, EXPORT_IDENTIFIER_FORM, IDENTIFIER_FORM, type TransportOperationForm } from "@kb/contracts";
import type { FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

/**
 * Tách vận đơn chỉ cho hàng nhập (vận đơn gốc về cảng nhập); định danh cho cả nhập và xuất (xuất: panel có chọn đường biển / hàng không).
 * Đang khai sửa đổi: theo ảnh IDA01 chỉ còn "Chọn số VĐ tách"; EDA01 vẫn còn "Khai mã định danh hàng hóa".
 */
export const operationsFor = (kind: Kind, amending = false): TransportOperationForm[] =>
  kind === "IDA" ? (amending ? [BILL_SPLIT_FORM] : [BILL_SPLIT_FORM, IDENTIFIER_FORM]) : [EXPORT_IDENTIFIER_FORM];

export function operationValues(form: TransportOperationForm, kind: Kind, header: FormValues): FormValues {
  const company = kind === "IDA" ? { MA_DV: header["TK_IMC"] ?? "", TEN_DV: header["TK_IMN"] ?? "" } : { MA_DV: header["TK_EPC"] ?? "", TEN_DV: header["TK_EPN"] ?? "" };
  const declarer = { MA_HQ: header["TK_CH"] ?? "", ...company };
  if (form.id === "dinh-danh") {
    return { LOAI_DT: "1", LOAI_HH: kind === "IDA" ? "1" : "2", ...declarer };
  }
  return {
    ...declarer,
    TVD_VD_GOC: header["VD_BL1"] ?? "",
    TVD_VD_GOC_NGAY: header["APP_NGAY_VD1"] ?? "",
    TVD_LOAIHANG: header["TK_MTC"]?.trim() === "2" ? "1" : "0",
  };
}
