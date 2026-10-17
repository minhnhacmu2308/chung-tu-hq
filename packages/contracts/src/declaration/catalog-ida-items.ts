import { fieldBuilder, type DeclarationFieldDef } from "./catalog-types.js";

/**
 * Mẫu số 01 – phần B "Thông tin khai báo chi tiết hàng hóa" (1.74–1.96), lặp theo từng dòng hàng (tối đa 50 dòng/tờ khai).
 * Tên trường FPT thuộc object VN_IDA_HANG; các chỉ tiêu nhiều ô ghi rõ trường của từng ô trong legalNote.
 */
const f = fieldBuilder("01");

export const CATALOG_IDA_ITEMS: DeclarationFieldDef[] = [
  f("1.74", "ITEMS", "Mã số hàng hóa", "code", "M", {
    maxLen: 12, fptField: "VN_IDA_HANG.HAG_CMD", amendedBy121: true,
    legalNote: "Mã HS đầy đủ theo Danh mục hàng hóa XNK VN và Biểu thuế. Hàng Chương 98: khai mã 97 chương, ghi mã Chương 98 ở Mô tả. Phần mềm NK trước máy móc: khai mã HS của máy (TT121).",
  }),
  f("1.75", "ITEMS", "Mã quản lý riêng", "text", "C", {
    maxLen: 7, fptField: "VN_IDA_HANG.HAG_GZC", manual: true,
    legalNote: "Số thứ tự mặt hàng trong Danh mục máy móc thiết bị đồng bộ (chương 84, 85, 90) hoặc danh mục trừ lùi đã đăng ký.",
  }),
  f("1.76", "ITEMS", "Thuế suất", "decimal", "C", {
    assist: true,
    maxLen: 10, fptField: "VN_IDA_HANG.HAG_TXA",
    legalNote: "Hệ thống tự xác định thuế suất NK theo mã HS và mã biểu thuế; chỉ nhập tay khi hệ thống báo lỗi E1004, E1006, E1008, E1009. Mã biểu thuế B30 (không chịu thuế): nhập \"0\".",
  }),
  f("1.77", "ITEMS", "Mức thuế tuyệt đối", "decimal", "C", {
    assist: true,
    maxLen: 10, fptField: "VN_IDA_HANG.HAG_TXB",
    legalNote: "Ô 1 mức thuế tuyệt đối (HAG_TXB); ô 2 mã đơn vị tính (HAG_TXC); ô 3 mã đồng tiền (HAG_TXD). Hệ thống tự xác định theo mã áp dụng mức thuế tuyệt đối.",
  }),
  f("1.78", "ITEMS", "Mô tả hàng hóa", "text", "M", {
    maxLen: 200, fptField: "VN_IDA_HANG.HAG_CMN", amendedBy121: true,
    legalNote: "Tên hàng, nhãn hiệu, quy cách, thông số, thành phần, hàm lượng, model, công dụng, quy cách đóng gói, nhà sản xuất… làm căn cứ xác định mã số (TT121). GC/SXXK: mã NPL#&tên hàng. Chương 98: ghi thêm mã Chương 98. Dùng KQ PTPL: số/ngày thông báo. Số lượng > 2 số thập phân: \"mô tả#&số lượng\".",
  }),
  f("1.79", "ITEMS", "Mã nước xuất xứ", "code", "M", {
    maxLen: 2, codeTable: "COUNTRY", fptField: "VN_IDA_HANG.HAG_OR",
    legalNote: "Mã nước, vùng lãnh thổ sản xuất ra hàng hóa (UN/LOCODE 2 ký tự), căn cứ C/O hoặc tài liệu liên quan.",
  }),
  f("1.80", "ITEMS", "Mã Biểu thuế nhập khẩu", "code", "M", {
    maxLen: 3, codeTable: "TAX_TABLE", fptField: "VN_IDA_HANG.HAG_ORS", amendedBy121: true,
    legalNote: "Theo \"Bảng mã Biểu thuế nhập khẩu\" trên website Cục Hải quan (TT121 thay danh sách B01…B30 của TT39). Chương 98: B02 hoặc B17 theo \"Biểu thuế Chương 98 - B02 và B17\". Hàng miễn thuế không khai mã của đối tượng không chịu thuế mà chọn biểu tương ứng loại thuế suất.",
  }),
  f("1.81", "ITEMS", "Mã ngoài hạn ngạch", "code", "C", {
    maxLen: 1, fptField: "VN_IDA_HANG.HAG_KWS",
    legalNote: "Nhập \"X\" khi áp dụng thuế suất ngoài hạn ngạch.",
  }),
  f("1.82", "ITEMS", "Mã áp dụng mức thuế tuyệt đối", "code", "C", {
    maxLen: 10, fptField: "VN_IDA_HANG.HAG_SPD",
    legalNote: "Bắt buộc với mặt hàng chịu thuế tuyệt đối/thuế hỗn hợp, theo bảng mã áp dụng mức thuế tuyệt đối.",
  }),
  f("1.83", "ITEMS", "Số lượng (1)", "decimal", "M", {
    maxLen: 12, codeTable: "A501", fptField: "VN_IDA_HANG.HAG_QN1",
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK hoặc thực tế giao dịch, ≤ 2 số thập phân; vượt thì làm tròn, ghi số lượng thực tế, đơn giá ở 1.78 \"mô tả#&số lượng\", không khai 1.86 (HAG_QN1); ô 2 mã ĐVT (HAG_QT1). Hàng chịu thuế tuyệt đối: theo ĐVT tính thuế.",
  }),
  f("1.84", "ITEMS", "Số lượng (2)", "decimal", "C", {
    maxLen: 12, codeTable: "A501", fptField: "VN_IDA_HANG.HAG_QN2",
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK VN, tối đa 2 số thập phân (HAG_QN2); ô 2 mã ĐVT (HAG_QT2).",
  }),
  f("1.85", "ITEMS", "Trị giá hóa đơn", "decimal", "C", {
    maxLen: 20, fptField: "VN_IDA_HANG.HAG_BPR",
    legalNote: "Trị giá hóa đơn từng dòng hàng, tối đa 4 số thập phân; phần nguyên vượt 12 chữ số thì tách dòng (tổng lượng không đổi). Không có hóa đơn hoặc dòng hàng FOC: để trống. Hàng thuê gia công ở nước ngoài: trị giá đến cửa khẩu nhập đầu tiên (CIF hoặc tương đương).",
  }),
  f("1.86", "ITEMS", "Đơn giá hóa đơn", "decimal", "C", {
    maxLen: 9, fptField: "VN_IDA_HANG.HAG_UPR",
    legalNote: "Ô 1 đơn giá (HAG_UPR); ô 2 mã đồng tiền (HAG_UPC); ô 3 đơn vị tính của đơn giá (HAG_TSC). Đơn giá × số lượng = trị giá hóa đơn ± 1. Đơn giá vượt 9 ký tự: không khai ở đây mà ghi ở 1.78. Không có hóa đơn hoặc dòng hàng FOC: để trống.",
  }),
  f("1.87", "ITEMS", "Trị giá tính thuế", "decimal", "C", {
    assist: true,
    maxLen: 20, fptField: "VN_IDA_HANG.HAG_DPR",
    legalNote: "Chỉ nhập khi phân bổ thủ công (mã khai trị giá 1, 2, 3, 4, 8, 9, T): ô 1 mã đồng tiền (HAG_BPC); ô 2 trị giá (HAG_DPR), VND không có thập phân. Mã 6, 7 hệ thống tự tính.",
  }),
  f("1.88", "ITEMS", "Số của mục khai khoản điều chỉnh", "int", "C", {
    maxLen: 1, fptField: "VN_IDA_HANG.HAG_VN1",
    legalNote: "Số thứ tự khoản điều chỉnh đã khai tại mục \"Các khoản điều chỉnh\" áp cho dòng hàng (tối đa 5 ô, HAG_VN1..5).",
  }),
  f("1.89", "ITEMS", "Số thứ tự của dòng hàng trên tờ khai TN-TX tương ứng", "text", "C", {
    maxLen: 2, fptField: "VN_IDA_HANG.HAG_TDL", manual: true,
    legalNote: "Số thứ tự dòng hàng trên tờ khai tạm nhập/tạm xuất tương ứng; số lượng ≤ số lượng còn lại.",
  }),
  f("1.90", "ITEMS", "Số danh mục miễn thuế nhập khẩu", "text", "C", {
    maxLen: 12, fptField: "VN_IDA_HANG.HAG_TXN", manual: true,
    legalNote: "Số Danh mục miễn thuế đã thông báo trên VNACCS, còn hiệu lực và không đang dùng cho tờ khai khác chưa thông quan.",
  }),
  f("1.91", "ITEMS", "Số dòng tương ứng trong Danh mục miễn thuế nhập khẩu", "text", "C", {
    maxLen: 3, fptField: "VN_IDA_HANG.HAG_TXR", manual: true,
    legalNote: "Số thứ tự dòng hàng trong Danh mục miễn thuế; số lượng NK ≤ số lượng còn lại của danh mục.",
  }),
  f("1.92", "ITEMS", "Mã miễn/giảm/không chịu thuế nhập khẩu", "code", "C", {
    maxLen: 5, codeTable: "A520", fptField: "VN_IDA_HANG.HAG_RE",
    legalNote: "Mã miễn/giảm/không chịu thuế NK theo bảng mã của TCHQ khi hàng thuộc đối tượng miễn, giảm, không chịu thuế.",
  }),
  f("1.93", "ITEMS", "Số tiền giảm thuế nhập khẩu", "decimal", "C", {
    maxLen: 16, fptField: "VN_IDA_HANG.HAG_REG",
    legalNote: "Số tiền thuế nhập khẩu được giảm.",
  }),
  f("1.94", "ITEMS", "Mã áp dụng thuế suất/mức thuế và thu khác", "code", "C", {
    maxLen: 10, fptField: "VN_IDA_HANG.HAG_TX1",
    legalNote: "Tối đa 5 (HAG_TX1..5), nhập theo thứ tự: thuế NK bổ sung (tự vệ, CBPG…), TTĐB, BVMT, GTGT. Hàng không chịu thuế: vẫn nhập mã sắc thuế và mã không chịu thuế tại 1.95.",
  }),
  f("1.95", "ITEMS", "Mã miễn/giảm/không chịu thuế và thu khác", "code", "C", {
    maxLen: 5, codeTable: "A520", fptField: "VN_IDA_HANG.HAG_TR1",
    legalNote: "Tương ứng từng ô của 1.94 (HAG_TR1..5); ngày đăng ký tờ khai phải trong thời hạn hiệu lực của mã.",
  }),
  f("1.96", "ITEMS", "Số tiền giảm thuế và thu khác", "decimal", "C", {
    maxLen: 16, fptField: "VN_IDA_HANG.HAG_TG1",
    legalNote: "Số tiền giảm thuế và thu khác, tương ứng từng ô của 1.94 (HAG_TG1..5).",
  }),
];
