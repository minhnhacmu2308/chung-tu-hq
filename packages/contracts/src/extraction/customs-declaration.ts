// Tờ khai hải quan đã thông quan (bản in VNACCS/ECUS, thường là PDF scan) – chỉ dùng ở mục "Dạy khai báo":
// đáp án để so với tờ khai nháp app dựng từ bộ chứng từ, rút ra bài học. KHÔNG bao giờ là nguồn điền tờ khai nháp.
// Khóa trường = mã chỉ tiêu của tờ khai nháp (IDA_MAPPINGS) để so trực tiếp từng ô.
import { z } from "zod";
import { nDate, nNum, nStr, UncertaintiesSchema } from "./common.js";

const code = (label: string) => nStr(`${label} – CHỈ chép phần mã (vd "02DSEA0", "VNSGN"), không chép tên đi kèm`);

export const CustomsDeclarationLineSchema = z.object({
  lineNo: z.number().int().positive().describe("Số thứ tự dòng hàng (ô <01>, <02>… trên tờ khai)"),
  hsCode: nStr("Mã số hàng hóa (8 số, chép liền không dấu chấm, vd 94051199)"),
  description: nStr("Mô tả hàng hóa nguyên văn tiếng Việt như in trên tờ khai (gồm cả mã hàng, hiệu, mới 100%…)"),
  quantity: nNum("Số lượng (1) – lượng theo đơn vị tính khai báo"),
  unit: nStr("Mã đơn vị tính của Số lượng (1), vd PCE, SET, KGM"),
  unitPrice: nNum("Đơn giá hóa đơn"),
  invoiceValue: nNum("Trị giá hóa đơn của dòng"),
  origin: nStr("Mã nước xuất xứ (2 chữ, vd CN)"),
  importTaxSchedule: nStr("Mã biểu thuế nhập khẩu (vd B01, B30) – ô 'Mã biểu thuế nhập khẩu'"),
  importRate: nStr("Thuế suất thuế nhập khẩu, chỉ số phần trăm (vd \"0\", \"5\", \"30\")"),
  importExemptCode: nStr("Mã miễn/giảm/không chịu thuế nhập khẩu nếu có"),
  vatRate: nStr("Thuế suất thuế GTGT, chỉ số phần trăm (vd \"10\", \"8\")"),
  vatExemptCode: nStr("Mã miễn/giảm/không chịu thuế GTGT nếu có (vd VB901)"),
});
export type CustomsDeclarationLine = z.infer<typeof CustomsDeclarationLineSchema>;

export const CustomsDeclarationExtractionSchema = z.object({
  SOTK: nStr("Số tờ khai (12 số)"),
  NGAY_DK: nDate("Ngày đăng ký tờ khai"),
  MA_LH: code("Mã loại hình (vd A11, A12, E31)"),
  PTVC: code("Mã hiệu phương thức vận chuyển (1 chữ số)"),
  CQHQ: code("Cơ quan Hải quan (mã chi cục, vd 02DS)"),
  NNK_MST: nStr("Mã số thuế người nhập khẩu"),
  NNK_TEN: nStr("Tên người nhập khẩu"),
  NXK_TEN: nStr("Tên người xuất khẩu (nước ngoài)"),
  NXK_DC: nStr("Địa chỉ người xuất khẩu – nối các dòng địa chỉ bằng dấu phẩy"),
  MA_NUOC: code("Mã nước của người xuất khẩu"),
  SO_VD: nStr("Số vận đơn (dòng 1) nguyên văn"),
  SO_KIEN: nStr("Số lượng kiện kèm mã loại kiện, vd \"4 PK\""),
  TRONG_LUONG: nNum("Tổng trọng lượng hàng (Gross), số"),
  KHO: code("Địa điểm lưu kho (mã 7 ký tự)"),
  KHO_TEN: nStr("Tên địa điểm lưu kho in cạnh mã (vd KHO FEDEX)"),
  CANG_DO: code("Địa điểm dỡ hàng (mã 5 ký tự)"),
  CANG_XEP: code("Địa điểm xếp hàng (mã 5 ký tự)"),
  PTVC_TEN: nStr("Phương tiện vận chuyển (tên tàu / số chuyến bay, vd PH8090/04DEC)"),
  NGAY_DEN: nDate("Ngày hàng đến"),
  HD_PL: code("Số hóa đơn – phần mã phân loại hình thức hóa đơn trước dấu gạch (A, B, D)"),
  SO_HD: nStr("Số hóa đơn – phần số sau dấu gạch (vd M-240315)"),
  NGAY_HD: nDate("Ngày phát hành hóa đơn"),
  PT_TT: code("Phương thức thanh toán (vd TTR, KC, LC)"),
  GIA_PL: code("Tổng trị giá hóa đơn – ô đầu: mã phân loại giá (A, B…)"),
  DK_GIA: code("Tổng trị giá hóa đơn – điều kiện giá (EXW, FOB, CIF…)"),
  MA_TT: code("Tổng trị giá hóa đơn – mã đồng tiền (USD…)"),
  TONG_TG: nNum("Tổng trị giá hóa đơn – số tiền"),
  KHAI_TG: code("Mã phân loại khai trị giá (1 chữ số)"),
  PHI_VC: nStr("Phí vận chuyển: mã phân loại, mã tiền, số tiền như in (vd \"A - VND - 2.188.485\"); trống nếu không in"),
  PHI_BH: nStr("Phí bảo hiểm: mã phân loại (vd D) và số tiền nếu có"),
  CT_TG: nStr("Chi tiết khai trị giá – nguyên văn đầy đủ"),
  VBPQ: nStr("Mã văn bản pháp quy khác (các mã, cách nhau bằng dấu phẩy)"),
  NGUOI_NT: code("Người nộp thuế (1 chữ số)"),
  GHI_CHU: nStr("Phần ghi chú – nguyên văn đầy đủ"),
  SO_QLNB: nStr("Số quản lý của nội bộ doanh nghiệp"),
  TY_GIA: nNum("Tỷ giá tính thuế (số VND / 1 đơn vị ngoại tệ)"),
  TONG_THUE: nNum("Tổng tiền thuế phải nộp (VND)"),
  items: z.array(CustomsDeclarationLineSchema).describe("Mọi dòng hàng theo thứ tự trên tờ khai (các trang chi tiết dòng hàng)"),
  uncertainties: UncertaintiesSchema,
});
export type CustomsDeclarationExtraction = z.infer<typeof CustomsDeclarationExtractionSchema>;

/** Gợi ý đọc gửi kèm prompt (thay cho gợi ý theo loại chứng từ). */
export const CUSTOMS_DECLARATION_HINTS = [
  "Đây là bản in tờ khai hàng hóa nhập khẩu/xuất khẩu VNACCS (thông quan): phần thông tin chung ở các trang đầu, chi tiết từng dòng hàng ở các trang sau.",
  "Ô dạng \"mã  tên\" (kho, cảng, người xuất khẩu…): trường mã chỉ chép mã.",
  "Số tiền in kiểu Việt Nam (dấu chấm ngăn nghìn, dấu phẩy thập phân) → đổi thành số.",
];
