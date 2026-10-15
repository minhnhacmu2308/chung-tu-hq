import { z } from "zod";
import { FPT_CREDENTIAL_ROWS, fptObjectSchema, toFptFields, type FptFieldMeta, type FptFieldRow } from "./common.js";

/**
 * Tờ khai XUẤT KHẨU – đặc tả `VNACCS_EDA v1.2.xlsx`.
 *
 * Sheet `Chung`:
 * | Object            | Mô tả                    | Gửi đi | Nhận về |
 * |-------------------|--------------------------|--------|---------|
 * | VN_EDA            | Thông tin tờ khai xuất   | Có     | Có      |
 * | VN_EDA_CTHQ       | Chỉ thị Hải Quan         | Không  | Có      |
 * | VN_EDA_CON        | Khai báo container       | Có     | Có      |
 * | VN_EDA_HANG       | Hàng xuất khẩu (nhiều)   | Có     | Có      |
 * | VN_EDA_TRANGTHAI  | Trạng thái tờ khai xuất  | Không  | Có      |
 *
 * Các nghiệp vụ (sheet chỉ liệt kê trường; ý nghĩa theo quy trình VNACCS chuẩn):
 * - EDA: khai trước thông tin tờ khai xuất – payload `objVN_EDA` + `objVN_EDA_HANG[]` + `objVN_EDA_CON`
 *   (mẫu: format.json).
 * - EDC: đăng ký (khai chính thức) tờ khai đã khai EDA. Sheet `EDC`: USER_ID, PASSWORD, TERMINAL_ID,
 *   TERMINAL_ACCESS_KEY (Text 50, bắt buộc) + TK_ECN (Decimal 12, Số tờ khai, bắt buộc).
 * - EDD: gọi lại tờ khai đã đăng ký để khai sửa đổi – cùng 5 trường như EDC.
 * - EDA01: khai trước thông tin sửa đổi – sheet `EDA01` (214 dòng) là danh sách PHẲNG gồm 4 trường tài
 *   khoản + toàn bộ TK_/HAG_/CON_/CTHQ_ như VN_EDA*; dùng lại các schema ở file này.
 * - EDE: đăng ký tờ khai sửa đổi (sau EDA01) – cùng 5 trường như EDC.
 * Đặc tả KHÔNG ghi endpoint, cách đặt tài khoản trong JSON hay mã HTTP – cần đối chiếu T1.
 *
 * Sheet VN_EDA_CON/CTHQ/TRANGTHAI không có cột Required → mọi trường tùy chọn. Key JSON theo `fptKey`.
 */

/** Sheet `VN_EDA` (VNACCS_EDA v1.2.xlsx) – 130 dòng. */
export const VN_EDA_ROWS = [
  ["TK_ID", "long", null, false, "Tờ khai ID", { acceptString: "any", note: "format.json gửi \"tK_ID\": \"TFECUSTEST01\" (chuỗi) dù sheet ghi Long Integer" }],
  ["TK_ECN", "decimal", "12", false, "Số tờ khai"],
  ["TK_JKN", "text", "1", false, "Phân loại xuất báo cáo sửa đổi"],
  ["TK_FIC", "text", "12", false, "Số tờ khai đầu tiên"],
  ["TK_BNO", "long", null, false, "Số nhánh của tờ khai chia nhỏ"],
  ["TK_DNO", "long", null, false, "Tổng số tờ khai chia nhỏ"],
  ["TK_TDN", "decimal", "12", false, "Số tờ khai tạm nhập tái xuất tương ứng"],
  ["TK_K07", "text", "3", false, "Mã phân loại kiểm tra"],
  ["TK_ECB", "text", "5", true, "Mã loại hình"],
  ["TK_CCC", "text", "1", false, "Mã phân loại hàng hóa", { category: "Bảng mã dài – xem sheet VN_EDA cột Category" }],
  ["TK_CH", "text", "6", true, "Cơ quan Hải quan", { category: "VN_A038" }],
  ["TK_MTC", "text", "1", true, "Mã hiệu phương thức vận chuyển"],
  ["TK_K01", "text", "4", false, "Mã số thuế đại diện"],
  ["TK_K08", "text", "10", false, "Tên cơ quan Hải quan"],
  ["TK_ECD", "date", null, false, "Ngày khai báo (Dự kiến)"],
  ["TK_CHB", "text", "2", true, "Nhóm xử lý hồ sơ", { category: "VN _A014" }],
  ["TK_K10", "date", null, false, "Ngày đăng ký"],
  ["TK_RT1", "text", "6", false, "Giờ đăng ký"],
  ["TK_AD21", "date", null, false, "Ngày thay đổi đăng ký"],
  ["TK_AD31", "text", "6", false, "Giờ thay đổi đăng ký"],
  ["TK_RID", "date", null, false, "Thời hạn tái nhập khẩu"],
  ["TK_AAA", "text", "1", false, "Biểu thị trường hợp hết hạn"],
  ["TK_EPC", "text", "13", true, "Mã người xuất khẩu"],
  ["TK_EPN", "text", "100", true, "Tên người xuất khẩu"],
  ["TK_EPP", "text", "7", false, "Mã bưu chính"],
  ["TK_EPA", "text", null, false, "Địa chỉ người xuất khẩu", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["TK_EPT", "text", "20", true, "Số điện thoại người xuất khẩu"],
  ["TK_EXC", "text", "13", false, "Mã người ủy thác xuất khẩu"],
  ["TK_EXN", "text", null, false, "Tên người ủy thác xuất khẩu", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["TK_CGC", "text", "13", false, "Mã người nhập khẩu"],
  ["TK_ECC", "text", "5", false, "Mã đại lý Hải quan"],
  ["TK_CGN", "text", "70", true, "Tên người nhập khẩu"],
  ["TK_CGP", "text", "9", false, "Mã bưu chính"],
  ["TK_CGA", "text", "35", true, "Địa chỉ 1(Street and number/P.O.BOX)"],
  ["TK_CAT", "text", "35", false, "Địa chỉ 2(Street and number/P.O.BOX)"],
  ["TK_CAC", "text", "35", false, "Địa chỉ 3(City name)"],
  ["TK_CAS", "text", "35", false, "Địa chỉ 4(Country sub-entity, name)"],
  ["TK_CGK", "text", "2", false, "Mã nước(Country, coded)"],
  ["TK_K32", "text", "5", false, "Mã đại lý Hải quan"],
  ["TK_K33", "text", "50", false, "Tên đại lý Hải quan"],
  ["TK_K34", "text", "5", false, "Mã nhân viên Hải quan"],
  ["TK_EKN", "text", "35", false, "Số vận đơn (Số B/L, số AWB v.v. …)"],
  ["TK_NO", "long", null, true, "Số kiện", { acceptString: "numeric", note: "format.json gửi \"23\" (chuỗi số)" }],
  ["TK_NOT", "text", "3", true, "Mã đơn vị tính"],
  ["TK_GW", "decimal", "28.3", true, "Tổng trọng lượng hàng (Gross)"],
  ["TK_GWT", "text", "6", true, "Mã đơn vị tính trọng lượng (Gross)"],
  ["TK_ST", "text", "7", false, "Mã địa điểm lưu kho hàng chờ thông quan dự kiến"],
  ["TK_K42", "text", "20", false, "Tên địa điểm lưu kho hàng chờ thông quan dự kiến"],
  ["TK_DSC", "text", "6", true, "Mã địa điểm nhận hàng cuối cùng"],
  ["TK_DSN", "text", "255", true, "Tên địa điểm nhận hàng cuối cùng"],
  ["TK_PSC", "text", "6", true, "Mã địa điểm xếp hàng"],
  ["TK_PSN", "text", "255", true, "Tên địa điểm xếp hàng"],
  ["TK_VSC", "text", "9", false, "Mã phương tiện vận chuyển dự kiến"],
  ["TK_VSN", "text", "255", true, "Tên phương tiện vận chuyển dự kiến"],
  ["TK_SYM", "date", null, true, "Ngày hàng đi dự kiến"],
  ["TK_MRK", "text", "140", false, "Ký hiệu và số hiệu"],
  ["TK_SS1", "text", "4", false, "Phân loại giấy phép xuất khẩu"],
  ["TK_SN1", "text", "20", false, "Số của giấy phép"],
  ["TK_SS2", "text", "4", false, "Phân loại giấy phép xuất khẩu"],
  ["TK_SN2", "text", "20", false, "Số của giấy phép"],
  ["TK_SS3", "text", "4", false, "Phân loại giấy phép xuất khẩu"],
  ["TK_SN3", "text", "20", false, "Số của giấy phép"],
  ["TK_SS4", "text", "4", false, "Phân loại giấy phép xuất khẩu"],
  ["TK_SN4", "text", "20", false, "Số của giấy phép"],
  ["TK_SS5", "text", "4", false, "Phân loại giấy phép xuất khẩu"],
  ["TK_SN5", "text", "20", false, "Số của giấy phép"],
  ["TK_IV1", "text", "1", true, "Phân loại hình thức hóa đơn"],
  ["TK_IV3", "text", "35", false, "Số hóa đơn"],
  ["TK_IV2", "decimal", "12", false, "Số tiếp nhận hóa đơn điện tử"],
  ["TK_IVD", "date", null, false, "Ngày phát hành"],
  ["TK_BRC", "text", "11", false, "Mã ngân hàng trả thuế thay"],
  ["TK_IVP", "text", "7", false, "Phương thức thanh toán"],
  ["TK_BYA", "long", null, false, "Năm phát hành hạn mức"],
  ["TK_IP2", "text", "3", false, "Mã điều kiện giá hóa đơn"],
  ["TK_BCM", "text", "10", false, "Kí hiệu chứng từ hạn mức"],
  ["TK_IP3", "text", "3", true, "Mã đồng tiền của hóa đơn"],
  ["TK_BCN", "text", "10", false, "Số chứng từ hạn mức"],
  ["TK_IP4", "decimal", "20.4", true, "Tổng trị giá hóa đơn"],
  ["TK_IP1", "text", "1", false, "Mã phân loại giá hóa đơn"],
  ["TK_SBC", "text", "11", false, "Mã ngân hàng bảo lãnh"],
  ["TK_FCD", "text", "3", true, "Mã đồng tiền của tổng trị giá tính thuế"],
  ["TK_RYA", "long", null, false, "Năm phát hành bảo lãnh"],
  ["TK_FKK", "decimal", "20.4", true, "Tổng trị giá tính thuế", { acceptString: "numeric", note: "format.json gửi \"5543.17\" (chuỗi số)" }],
  ["TK_SCM", "text", "10", false, "Ký hiệu chứng từ bảo lãnh"],
  ["TK_RC1", "text", "3", false, "Mã đồng tiền của tỷ giá tính thuế"],
  ["TK_RD1", "decimal", "17.8", false, "Tỷ giá tính thuế"],
  ["TK_SCN", "text", "10", false, "Số chứng từ bảo lãnh"],
  ["TK_RC2", "text", "3", false, "Mã đồng tiền của tỷ giá tính thuế"],
  ["TK_RD2", "decimal", "17.8", false, "Tỷ giá tính thuế"],
  ["TK_TP", "decimal", "28.4", false, "Tổng hệ số phân bổ trị giá tính thuế"],
  ["TK_K68", "text", "1", false, "Mã phân loại nhập liệu cho Tổng giá cơ bản"],
  ["TK_CNV", "text", "1", false, "Phân loại không cần quy đổi VND"],
  ["TK_TPM", "text", "1", false, "Người nộp thuế"],
  ["TK_ENC", "text", "1", false, "Mã xác định thời hạn nộp thuế"],
  ["TK_PAY", "text", "1", false, "Phân loại nộp thuế"],
  ["TK_ETA", "decimal", "19.8", false, "Tổng số tiền thuế xuất khẩu"],
  ["TK_AD7", "text", "3", false, "Mã tiền tệ của tổng số tiền thuế xuất khẩu"],
  ["TK_TCO", "decimal", "11", false, "Tổng số tiền lệ phí"],
  ["TK_SAM", "decimal", "11", false, "Số tiền bảo lãnh"],
  ["TK_AD8", "text", "3", false, "Mã tiền tệ của số tiền bảo lãnh"],
  ["TK_K69", "long", null, false, "Tổng số trang của tờ khai"],
  ["TK_K70", "long", null, false, "Tổng số dòng hàng của tờ khai"],
  ["TK_EA1", "text", "3", false, "Phân loại đính kèm khai báo điện tử"],
  ["TK_EB1", "decimal", "12", false, "Số đính kèm khai báo điện tử"],
  ["TK_EA2", "text", "3", false, "Phân loại đính kèm khai báo điện tử"],
  ["TK_EB2", "decimal", "12", false, "Số đính kèm khai báo điện tử"],
  ["TK_EA3", "text", "3", false, "Phân loại đính kèm khai báo điện tử"],
  ["TK_EB3", "decimal", "12", false, "Số đính kèm khai báo điện tử"],
  ["TK_NT2", "text", null, false, "Phần ghi chú", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["TK_REF", "text", "20", false, "Số quản lý của nội bộ doanh nghiệp"],
  ["TK_K82", "text", "5", false, "Số quản lý người sử dụng"],
  ["TK_DPD", "date", null, false, "Ngày khởi hành vận chuyển"],
  ["TK_ST1", "text", "7", false, "Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp)"],
  ["TK_AD1", "date", null, false, "Ngày dự kiến đến(Địa điểm trung chuyển)"],
  ["TK_SD1", "date", null, false, "Ngày khởi hành vận chuyển(Địa điểm trung chuyển)"],
  ["TK_ST2", "text", "7", false, "Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp)"],
  ["TK_AD2", "date", null, false, "Ngày dự kiến đến(Địa điểm trung chuyển)"],
  ["TK_SD2", "date", null, false, "Ngày khởi hành vận chuyển(Địa điểm trung chuyển)"],
  ["TK_ST3", "text", "7", false, "Địa điểm trung chuyển cho vận chuyển bảo thuế (khai báo gộp)"],
  ["TK_AD3", "date", null, false, "Ngày dự kiến đến(Địa điểm trung chuyển)"],
  ["TK_SD3", "date", null, false, "Ngày khởi hành vận chuyển(Địa điểm trung chuyển)"],
  ["TK_ARP", "text", "7", false, "Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp)"],
  ["TK_ADT", "date", null, false, "Ngày dự kiến đến"],
  ["TK_NGAYTX", "date", null, false, "Ngày thực xuất"],
  ["TK_NGAYHT", "date", null, false, "Ngày hoàn thành"],
  ["TK_LOAIHINHTK", "decimal", null, false, "Loại hình tờ khai: / 1. Kinh doanh / 2. Sản xuất xuất khẩu / 3. Gia công / 4. Chế xuất", { note: "Đặc tả ghi Type \"Double\" – coi là decimal (số JSON)" }],
  ["MALHV4", "text", "255", false, "Mã loại hình V4"],
  ["HD_SO", "text", "255", false, "Số hợp đồng"],
  ["HD_NGAY", "text", "255", false, "Ngày hợp đồng"],
  ["HD_ID", "long", null, false, "Hợp đồng ID"],
] as const satisfies readonly FptFieldRow[];

/** Sheet `VN_EDA_HANG` (VNACCS_EDA v1.2.xlsx) – 56 dòng. */
export const VN_EDA_HANG_ROWS = [
  ["HAG_ID", "long", null, false, "Hàng ID"],
  ["TK_ID", "long", null, false, "Tờ khai ID"],
  ["HAG_R01", "text", "2", false, "Số dòng"],
  ["HAG_CMD", "text", "12", true, "Mã số hàng hóa"],
  ["HAG_COC", "text", "255", false, "Mã quản lý riêng"],
  ["HAG_R03", "text", "1", false, "Mã phân loại tái xác nhận giá"],
  ["HAG_CMN", "text", "200", true, "Mô tả hàng hóa"],
  ["HAG_QN1", "decimal", "20.8", true, "Số lượng (1)"],
  ["HAG_QT1", "text", "4", true, "Mã đơn vị tính (1)"],
  ["HAG_QN2", "decimal", "20.4", true, "Số lượng (2)"],
  ["HAG_QT2", "text", "4", true, "Mã đơn vị tính (2)"],
  ["HAG_BPR", "decimal", "20.4", true, "Trị giá hóa đơn"],
  ["HAG_UPR", "decimal", "20.8", true, "Đơn giá hóa đơn"],
  ["HAG_UPC", "text", "3", true, "Mã đồng tiền của đơn giá hóa đơn"],
  ["HAG_TSC", "text", "4", false, "Price quantity unit"],
  ["HAG_R07", "decimal", "25.4", false, "Trị giá tính thuế(S)"],
  ["HAG_BPC", "text", "3", false, "Mã đồng tiền của giá tính thuế(S)"],
  ["HAG_R14", "text", "3", false, "Mã đồng tiền của giá tính thuế(M)"],
  ["HAG_R15", "decimal", "28.4", false, "Trị giá tính thuế(M)"],
  ["HAG_TSQ", "decimal", "20.4", false, "Số lượng tính thuế"],
  ["HAG_TSU", "text", "4", false, "Mã đơn vị tính chuẩn để đánh thuế xuất khẩu"],
  ["HAG_CVU", "decimal", "26.4", false, "Đơn giá tính thuế"],
  ["HAG_ADA", "text", "3", false, "Mã tiền tệ của đơn giá tính thuế"],
  ["HAG_QCV", "text", "4", false, "Đơn vị số lượng trong đơn giá tính thuế"],
  ["HAG_TRA", "text", "30", false, "Thuế suất thuế xuất khẩu"],
  ["HAG_TRM", "text", "1", false, "Phân loại nhập thuế suất thuế xuất khẩu"],
  ["HAG_TAX", "decimal", "24.4", false, "Số tiền thuế xuất khẩu"],
  ["HAG_ADB", "text", "3", false, "Mã tiền tệ của số tiền thuế xuất khẩu"],
  ["HAG_REG", "decimal", "16", false, "Số tiền giảm thuế xuất khẩu"],
  ["HAG_ADC", "text", "3", false, "Mã tiền tệ của số tiền giảm thuế xuất khẩu"],
  ["HAG_TDL", "text", "2", false, "Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng"],
  ["HAG_TXR", "decimal", "12", false, "Danh mục miễn thuế xuất khẩu"],
  ["HAG_ADE", "text", "3", false, "Số dòng tương ứng trong danh mục miễn thuế"],
  ["HAG_CUP", "text", "21", false, "Tiền lệ phí (Đơn giá)"],
  ["HAG_IUP", "text", "21", false, "Tiền bảo hiểm (Đơn giá)"],
  ["HAG_CQU", "decimal", "20.4", false, "Tiền lệ phí (Số lượng)"],
  ["HAG_CQC", "text", "4", false, "Tiền lệ phí (Mã đơn vị số lượng)"],
  ["HAG_IQU", "decimal", "20.4", false, "Tiền bảo hiểm (Số lượng)"],
  ["HAG_IQC", "text", "4", false, "Tiền bảo hiểm (Mã đơn vị số lượng)"],
  ["HAG_CPR", "decimal", "24.4", false, "Tiền lệ phí (Khoản tiền)"],
  ["HAG_IPR", "decimal", "24.4", false, "Tiền bảo hiểm (Khoản tiền)"],
  ["HAG_OL1", "text", "2", false, "Mã văn bản pháp quy khác"],
  ["HAG_OL2", "text", "2", false, "Mã văn bản pháp quy khác"],
  ["HAG_OL3", "text", "2", false, "Mã văn bản pháp quy khác"],
  ["HAG_OL4", "text", "2", false, "Mã văn bản pháp quy khác"],
  ["HAG_OL5", "text", "2", false, "Mã văn bản pháp quy khác"],
  ["HAG_RE", "text", "5", false, "Mã miễn / Giảm / Không chịu thuế xuất khẩu"],
  ["HAG_TXD", "text", "3", false, "Mã đồng tiền của mức thuế tuyệt đối"],
  ["HAG_DPR", "decimal", "28.4", false, "Trị giá tính thuế"],
  ["HAG_TXN", "text", "12", false, "Danh mục miễn thuế xuất khẩu"],
  ["HAG_TXC", "text", "4", false, "Mã đơn vị tính thuế tuyệt đối"],
  ["HAG_TRL", "text", "60", false, "Điều khoản miễn / Giảm / Không chịu thuế xuất khẩu  (Pháp luật)"],
  ["HAG_TXA", "decimal", "18.4", false, "Thuế suất"],
  ["HAG_TXB", "decimal", "18.4", false, "Mức thuế tuyệt đối"],
  ["HAG_MAHANG", "text", "255", false, "Mã hàng"],
  ["HAG_XX", "text", "5", false, "HAG_XX", { note: "Sheet đánh Required nhưng request EDA thật gửi thành công không có trường này (docdungapivnacss, 14/10/2026) → tùy chọn" }],
] as const satisfies readonly FptFieldRow[];

/** Sheet `VN_EDA_CON` (VNACCS_EDA v1.2.xlsx) – 59 dòng. */
export const VN_EDA_CON_ROWS = [
  ["CON_ID", "long", null, false, "Container ID"],
  ["TK_ID", "long", null, false, "Tờ khai ID"],
  ["CON_VC1", "text", "7", false, "Mã địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VC2", "text", "7", false, "Mã địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VC3", "text", "7", false, "Mã địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VC4", "text", "7", false, "Mã địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VC5", "text", "7", false, "Mã địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VN", "text", "70", false, "Tên địa điểm xếp hàng lên xe chở hàng (Vanning)"],
  ["CON_VA", "text", null, false, "Địa chỉ địa điểm xếp hàng lên xe chở hàng (Vanning)", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CON_C01", "text", "12", false, "Số container"],
  ["CON_C02", "text", "12", false, "Số container"],
  ["CON_C03", "text", "12", false, "Số container"],
  ["CON_C04", "text", "12", false, "Số container"],
  ["CON_C05", "text", "12", false, "Số container"],
  ["CON_C06", "text", "12", false, "Số container"],
  ["CON_C07", "text", "12", false, "Số container"],
  ["CON_C08", "text", "12", false, "Số container"],
  ["CON_C09", "text", "12", false, "Số container"],
  ["CON_C10", "text", "12", false, "Số container"],
  ["CON_C11", "text", "12", false, "Số container"],
  ["CON_C12", "text", "12", false, "Số container"],
  ["CON_C13", "text", "12", false, "Số container"],
  ["CON_C14", "text", "12", false, "Số container"],
  ["CON_C15", "text", "12", false, "Số container"],
  ["CON_C16", "text", "12", false, "Số container"],
  ["CON_C17", "text", "12", false, "Số container"],
  ["CON_C18", "text", "12", false, "Số container"],
  ["CON_C19", "text", "12", false, "Số container"],
  ["CON_C20", "text", "12", false, "Số container"],
  ["CON_C21", "text", "12", false, "Số container"],
  ["CON_C22", "text", "12", false, "Số container"],
  ["CON_C23", "text", "12", false, "Số container"],
  ["CON_C24", "text", "12", false, "Số container"],
  ["CON_C25", "text", "12", false, "Số container"],
  ["CON_C26", "text", "12", false, "Số container"],
  ["CON_C27", "text", "12", false, "Số container"],
  ["CON_C28", "text", "12", false, "Số container"],
  ["CON_C29", "text", "12", false, "Số container"],
  ["CON_C30", "text", "12", false, "Số container"],
  ["CON_C31", "text", "12", false, "Số container"],
  ["CON_C32", "text", "12", false, "Số container"],
  ["CON_C33", "text", "12", false, "Số container"],
  ["CON_C34", "text", "12", false, "Số container"],
  ["CON_C35", "text", "12", false, "Số container"],
  ["CON_C36", "text", "12", false, "Số container"],
  ["CON_C37", "text", "12", false, "Số container"],
  ["CON_C38", "text", "12", false, "Số container"],
  ["CON_C39", "text", "12", false, "Số container"],
  ["CON_C40", "text", "12", false, "Số container"],
  ["CON_C41", "text", "12", false, "Số container"],
  ["CON_C42", "text", "12", false, "Số container"],
  ["CON_C43", "text", "12", false, "Số container"],
  ["CON_C44", "text", "12", false, "Số container"],
  ["CON_C45", "text", "12", false, "Số container"],
  ["CON_C46", "text", "12", false, "Số container"],
  ["CON_C47", "text", "12", false, "Số container"],
  ["CON_C48", "text", "12", false, "Số container"],
  ["CON_C49", "text", "12", false, "Số container"],
  ["CON_C50", "text", "12", false, "Số container"],
] as const satisfies readonly FptFieldRow[];

/** Sheet `VN_EDA_CTHQ` (VNACCS_EDA v1.2.xlsx) – 33 dòng. */
export const VN_EDA_CTHQ_ROWS = [
  ["CTHQ_ID", "long", null, false, "Chỉ thị HQ ID"],
  ["TK_ID", "long", null, false, "Tờ khai ID"],
  ["CTHQ_CCM", "text", "1", false, "Phân loại chỉ thị của Hải quan"],
  ["CTHQ_D01", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T01", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I01", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D02", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T02", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I02", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D03", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T03", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I03", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D04", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T04", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I04", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D05", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T05", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I05", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D06", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T06", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I06", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D07", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T07", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I07", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D08", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T08", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I08", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D09", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T09", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I09", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
  ["CTHQ_D10", "date", null, false, "Ngày chỉ thị của Hải quan"],
  ["CTHQ_T10", "text", "120", false, "Tên chỉ thị của Hải quan"],
  ["CTHQ_I10", "text", null, false, "Nội dung chỉ thị của Hải quan", { note: "Đặc tả ghi Type \"Memo\" (không giới hạn độ dài) – coi là text" }],
] as const satisfies readonly FptFieldRow[];

/** Sheet `VN_EDA_TRANGTHAI` (VNACCS_EDA v1.2.xlsx) – 9 dòng. */
export const VN_EDA_TRANGTHAI_ROWS = [
  ["TK_ID", "long", null, false, "Tờ khai ID"],
  ["TK_AD4", "text", "255", false, "Giờ hoàn thành kiểm tra"],
  ["TK_K86", "date", null, false, "Ngày cấp phép"],
  ["TK_AD5", "text", "255", false, "Giờ cấp phép"],
  ["TK_K87", "text", "255", false, "Tên trưởng đơn vị Hải quan"],
  ["TK_CCD", "date", null, false, "Ngày hoàn thành kiểm tra"],
  ["TK_LUONG", "long", null, false, "Luồng ID"],
  ["TK_TRANGTHAI", "text", "255", false, "Trạng Thái ID"],
  ["TK_THONGQUAN", "long", null, false, "Thông quan ID"],
] as const satisfies readonly FptFieldRow[];

export const VN_EDA_FIELDS: FptFieldMeta[] = toFptFields(VN_EDA_ROWS);
export const VN_EDA_HANG_FIELDS: FptFieldMeta[] = toFptFields(VN_EDA_HANG_ROWS);
export const VN_EDA_CON_FIELDS: FptFieldMeta[] = toFptFields(VN_EDA_CON_ROWS);
export const VN_EDA_CTHQ_FIELDS: FptFieldMeta[] = toFptFields(VN_EDA_CTHQ_ROWS);
export const VN_EDA_TRANGTHAI_FIELDS: FptFieldMeta[] = toFptFields(VN_EDA_TRANGTHAI_ROWS);

export const VnEdaSchema = fptObjectSchema(VN_EDA_ROWS);
export type VnEda = z.infer<typeof VnEdaSchema>;
/** Lưu ý: sheet đánh dấu HAG_XX (Text 5, không mô tả) là bắt buộc, nhưng FPT thật nhận dòng hàng không có nó → để tùy chọn. */
export const VnEdaHangSchema = fptObjectSchema(VN_EDA_HANG_ROWS);
export type VnEdaHang = z.infer<typeof VnEdaHangSchema>;
export const VnEdaConSchema = fptObjectSchema(VN_EDA_CON_ROWS);
export type VnEdaCon = z.infer<typeof VnEdaConSchema>;
export const VnEdaCthqSchema = fptObjectSchema(VN_EDA_CTHQ_ROWS, "response");
export type VnEdaCthq = z.infer<typeof VnEdaCthqSchema>;
export const VnEdaTrangThaiSchema = fptObjectSchema(VN_EDA_TRANGTHAI_ROWS, "response");
export type VnEdaTrangThai = z.infer<typeof VnEdaTrangThaiSchema>;

/**
 * Payload EDA đúng thứ tự/tên object như format.json. Mẫu có kèm `objVN_EDA_CTHQ` toàn chuỗi rỗng dù
 * sheet `Chung` ghi CTHQ "không gửi" → để tùy chọn.
 */
export const EdaRequestSchema = z.object({
  objVN_EDA: VnEdaSchema,
  objVN_EDA_CON: VnEdaConSchema.nullish(),
  objVN_EDA_CTHQ: VnEdaCthqSchema.nullish(),
  objVN_EDA_HANG: z.array(VnEdaHangSchema).min(1),
});
export type EdaRequest = z.infer<typeof EdaRequestSchema>;

export const EdaResponseSchema = z.looseObject({
  objVN_EDA: fptObjectSchema(VN_EDA_ROWS, "response").nullish(),
  objVN_EDA_CON: fptObjectSchema(VN_EDA_CON_ROWS, "response").nullish(),
  objVN_EDA_CTHQ: VnEdaCthqSchema.nullish(),
  objVN_EDA_HANG: z.array(fptObjectSchema(VN_EDA_HANG_ROWS, "response")).nullish(),
  objVN_EDA_TRANGTHAI: VnEdaTrangThaiSchema.nullish(),
});
export type EdaResponse = z.infer<typeof EdaResponseSchema>;

/** Sheet `EDC` / `EDD` / `EDE`: tài khoản VNACCS + số tờ khai. Key theo `fptKey` (suy luận). */
export const EDA_BY_NUMBER_ROWS = [
  ...FPT_CREDENTIAL_ROWS,
  ["TK_ECN", "decimal", "12", true, "Số tờ khai"],
] as const satisfies readonly FptFieldRow[];
export const EdaByNumberRequestSchema = fptObjectSchema(EDA_BY_NUMBER_ROWS);
export type EdaByNumberRequest = z.infer<typeof EdaByNumberRequestSchema>;
