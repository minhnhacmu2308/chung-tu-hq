// Bản in tờ khai nhập khẩu (IDA) theo mẫu VNACCS MAUIN_TOKHAI_NHAPKHAU.pdf ("thông báo kết quả phân luồng"):
// tr.1 + tr.2 = `pages`, tr.3+ = mỗi dòng hàng một khối (`item`). Khóa = khóa ô của declaration-layout/ida.ts; nhãn = chữ in trên mẫu.
//
// Ô có trên mẫu nhưng bố cục IDA không có khóa nào → bỏ:
// - Đầu trang: mã vạch; "<IMP>"; số trang "n / N" (tính khi vẽ); ô "-" sau "Thời hạn tái nhập/ tái xuất".
// - Tr.2: "Số quản lý người sử dụng"; mục thông báo: "Ngày khai báo nộp thuế", "Tổng số tiền thuế chậm nộp".
// - Dòng hàng: số thứ tự dòng "< 01 >" (tính khi vẽ).
// Ba dòng không nhãn "tên … / /  tên … / /" ở mục thông báo = 6 sắc thuế được ân hạn (TK_KO{n} tên, TK_KP{n} hạn nộp), hai sắc thuế mỗi dòng.
import type { PrintCell, PrintLayout, PrintRegion, PrintRow } from "./types.js";

const c = (key: string, label = "", span?: PrintCell["span"], align?: "end"): PrintCell => ({ key, label, ...(span ? { span } : {}), ...(align ? { align } : {}) });
const rep = (count: number, cells: PrintCell[], label?: string): PrintRow => ({ kind: "repeat", ...(label ? { label } : {}), count, cells });

/** Đầu trang – lặp ở mọi trang. */
const HEADER: PrintRow[] = [
  [c("TK_ICN", "Số tờ khai", 4), c("TK_FIC", "Số tờ khai đầu tiên", 4), c("TK_BNO", "", 2), c("TK_DNO", "", 2)],
  [c("TK_TDN", "Số tờ khai tạm nhập tái xuất tương ứng", 12)],
  // Mã loại hình | mã phân loại hàng hóa | mã hiệu PTVC | [phân loại cá nhân/tổ chức]: "A11  2 [ 4 ]".
  [c("TK_A06", "Mã phân loại kiểm tra", 3), c("TK_ICB", "Mã loại hình", 2), c("TK_CCC", "", 1), c("TK_MTC", "", 1), c("TK_SKB", "", 1), c("TK_A00", "Mã số hàng hóa đại diện của tờ khai", 4)],
  // TK_CH (danh mục A038): ô mã in "mã  tên" theo danh mục → hiện mã + tên Chi cục cả trước lẫn sau đăng ký; dùng TK_A07 (tên Hải quan trả về) sẽ mất ô bắt buộc của người khai trên bản in.
  [c("TK_CH", "Tên cơ quan Hải quan tiếp nhận tờ khai", 6), c("TK_CHB", "Mã bộ phận xử lý tờ khai", 6)],
  [c("TK_A09", "Ngày đăng ký", 3), c("TK_AD11", "", 1), c("TK_AD21", "Ngày thay đổi đăng ký", 3), c("TK_AD31", "", 1), c("TK_RED", "Thời hạn tái nhập/ tái xuất", 4)],
];

const PAGE_1: PrintRegion[] = [
  { id: "nguoi-nhap-khau", title: "Người nhập khẩu", rows: [[c("TK_IMC", "Mã", 12)], [c("TK_IMN", "Tên", 12)], [c("TK_IMY", "Mã bưu chính", 12)], [c("TK_IMA", "Địa chỉ", 12)], [c("TK_IMT", "Số điện thoại", 12)]] },
  { id: "uy-thac-nk", title: "Người ủy thác nhập khẩu", rows: [[c("TK_NMC", "Mã", 12)], [c("TK_NMN", "Tên", 12)]] },
  {
    id: "nguoi-xuat-khau", title: "Người xuất khẩu", rows: [
      [c("TK_EPC", "Mã", 12)], [c("TK_EPN", "Tên", 12)], [c("TK_EPY", "Mã bưu chính", 12)],
      [c("TK_EPA", "Địa chỉ", 6), c("TK_EP2", "", 6)], [c("TK_EP3", "", 6), c("TK_EP4", "", 6)],
      [c("TK_EPO", "Mã nước", 12)],
    ],
  },
  { id: "uy-thac-xk", rows: [[c("TK_ENM", "Người ủy thác xuất khẩu", 12)]] },
  { id: "dai-ly", rows: [[c("TK_ICC", "Đại lý Hải quan", 3), c("TK_A38", "", 6), c("TK_A39", "Mã nhân viên Hải quan", 3)]] },
];

const BILL: [PrintRegion, PrintRegion] = [
  {
    id: "van-don", rows: [
      rep(5, [c("VD_BL{n}", "Số vận đơn", 12)]),
      [c("VD_NO", "Số lượng", 6, "end"), c("VD_NOT", "", 6)],
      [c("VD_GW", "Tổng trọng lượng hàng (Gross)", 6, "end"), c("VD_GWT", "", 6)],
      [c("VD_COC", "Số lượng container", 6, "end")],
    ],
  },
  {
    id: "dia-diem", rows: [
      [c("VD_ST", "Địa điểm lưu kho", 6), c("VD_A51", "", 6)],
      [c("VD_DST", "Địa điểm dỡ hàng", 6), c("VD_DSN", "", 6)],
      [c("VD_PSC", "Địa điểm xếp hàng", 6), c("VD_PSN", "", 6)],
      [c("VD_VSC", "Phương tiện vận chuyển", 6), c("VD_VSN", "", 6)],
      [c("VD_ARR", "Ngày hàng đến", 12)],
      [c("VD_MRK", "Ký hiệu và số hiệu", 12)],
      [c("VD_ISD", "Ngày được phép nhập kho đầu tiên", 12)],
      [c("TK_OL1", "Mã văn bản pháp quy khác", 4), c("TK_OL2", "", 2), c("TK_OL3", "", 2), c("TK_OL4", "", 2), c("TK_OL5", "", 2)],
    ],
  },
];

const VALUE: PrintRegion[] = [
  {
    id: "hoa-don", rows: [
      [c("TK_IV1", "Số hóa đơn", 6), c("TK_IV3", "", 6)],
      [c("TK_IV2", "Số tiếp nhận hóa đơn điện tử", 12)],
      [c("TK_IVD", "Ngày phát hành", 12)],
      [c("TK_IVP", "Phương thức thanh toán", 12)],
      [c("TK_IP1", "Tổng trị giá hóa đơn", 4), c("TK_IP2", "", 2), c("TK_IP3", "", 2), c("TK_IP4", "", 4, "end")],
      [c("TK_A86", "Tổng trị giá tính thuế", 12, "end")],
      // "34.375 -": ô một ký tự sau tổng hệ số phân bổ = mã phân loại nhập liệu tổng giá cơ bản (TK_A97, dài 1). Dòng "Tổng trị giá tính thuế" chỉ có một ô (TK_A86).
      [c("TK_TP", "Tổng hệ số phân bổ trị giá", 6, "end"), c("TK_A97", "", 1)],
      [c("TK_N4", "Mã kết quả kiểm tra nội dung", 12)],
    ],
  },
  {
    id: "giay-phep", title: "Giấy phép nhập khẩu", rows: [
      [c("TK_SS1", "1", 1), c("TK_SN1", "", 3), c("TK_SS2", "2", 1), c("TK_SN2", "", 3), c("TK_SS3", "3", 1), c("TK_SN3", "", 3)],
      [c("TK_SS4", "4", 1), c("TK_SN4", "", 3), c("TK_SS5", "5", 1), c("TK_SN5", "", 3)],
    ],
  },
  {
    id: "khai-tri-gia", rows: [
      [c("KTG_VD1", "Mã phân loại khai trị giá", 12)],
      [c("KTG_VD2", "Khai trị giá tổng hợp", 4), c("KTG_A93", "", 1), c("KTG_A94", "", 1), c("KTG_A95", "", 1), c("KTG_VCC", "", 1), c("KTG_VPC", "", 4, "end")],
      [c("KTG_FR1", "Phí vận chuyển", 4), c("KTG_FR2", "", 2), c("KTG_FR3", "", 6, "end")],
      [c("KTG_IN1", "Phí bảo hiểm", 4), c("KTG_IN2", "", 2), c("KTG_IN3", "", 3, "end"), c("KTG_IN4", "", 3)],
      // Nhãn ô = tiêu đề cột in trên mẫu, số dòng 1–5 do lúc vẽ đánh.
      rep(5, [c("KTG_VR{n}", "Mã tên", 2), c("KTG_VI{n}", "Mã phân loại", 2), c("KTG_VC{n}", "", 1), c("KTG_VP{n}", "Trị giá khoản điều chỉnh", 4, "end"), c("KTG_VT{n}", "Tổng hệ số phân bổ", 3, "end")], "Các khoản điều chỉnh"),
      [c("KTG_VLD", "Chi tiết khai trị giá", 12)],
    ],
  },
];

const TAX: [PrintRegion, PrintRegion] = [
  { id: "sac-thue", rows: [rep(6, [c("THUE_KG{n}", "Tên sắc thuế", 4), c("THUE_KH{n}", "Tổng tiền thuế", 6, "end"), c("THUE_KI{n}", "Số dòng tổng", 2, "end")])] },
  {
    id: "tong-thue", rows: [
      [c("THUE_B02", "Tổng tiền thuế phải nộp", 12, "end")],
      [c("THUE_B03", "Số tiền bảo lãnh", 12, "end")],
      rep(3, [c("THUE_KJ{n}", "Tỷ giá tính thuế", 6), c("THUE_KK{n}", "", 6, "end")]),
      [c("TK_ENC", "Mã xác định thời hạn nộp thuế", 6), c("TK_TPM", "Người nộp thuế", 6)],
      [c("TK_BP", "Mã lý do đề nghị BP", 6), c("TK_B08", "Phân loại nộp thuế", 6)],
    ],
  },
];

const PAGE_2: PrintRegion[] = [
  { id: "dinh-kem", title: "Số đính kèm khai báo điện tử", rows: [[c("TK_EA1", "1", 1), c("TK_EB1", "", 3), c("TK_EA2", "2", 1), c("TK_EB2", "", 3), c("TK_EA3", "3", 1), c("TK_EB3", "", 3)]] },
  { id: "ghi-chu", rows: [[c("TK_NT2", "Phần ghi chú", 12)]] },
  { id: "so-quan-ly", rows: [[c("TK_REF", "Số quản lý của nội bộ doanh nghiệp", 6)]] },
  { id: "chi-thi", rows: [[c("CTHQ_CCM", "Phân loại chỉ thị của Hải quan", 12)], rep(10, [c("CTHQ_D{nn}", "Ngày", 2), c("CTHQ_T{nn}", "Tên", 4), c("CTHQ_I{nn}", "Nội dung", 6)])] },
  {
    id: "thong-bao", title: "Mục thông báo của Hải quan", rows: [
      [c("TK_KO1", "", 4), c("TK_KP1", "", 2), c("TK_KO2", "", 4), c("TK_KP2", "", 2)],
      [c("TK_KO3", "", 4), c("TK_KP3", "", 2), c("TK_KO4", "", 4), c("TK_KP4", "", 2)],
      [c("TK_KO5", "", 4), c("TK_KP5", "", 2), c("TK_KO6", "", 4), c("TK_KP6", "", 2)],
      [c("TK_DPD", "Thời hạn cho phép vận chuyển bảo thuế (khởi hành)", 12)],
      // Dòng 1–3: cột Địa điểm / Ngày đến / Ngày khởi hành.
      rep(3, [c("TK_ST{n}", "Địa điểm", 4), c("TK_AD{n}", "Ngày đến", 4), c("TK_SD{n}", "Ngày khởi hành", 4)], "Thông tin trung chuyển"),
      [c("TK_ARP", "Địa điểm đích cho vận chuyển bảo thuế", 6), c("TK_ADT", "", 6)],
    ],
  },
];

/** Khối một dòng hàng (tr.3+ của mẫu). */
const ITEM: PrintRegion[] = [
  {
    id: "hang", rows: [
      [c("HAG_CMD", "Mã số hàng hóa", 4), c("HAG_GZC", "Mã quản lý riêng", 4), c("HAG_B29", "Mã phân loại tái xác nhận giá", 4)],
      [c("HAG_CMN", "Mô tả hàng hóa", 12)],
      [c("HAG_QN1", "Số lượng (1)", 4, "end"), c("HAG_QT1", "", 2)],
      [c("HAG_VN1", "Số của mục khai khoản điều chỉnh", 2), c("HAG_VN2", "", 1), c("HAG_VN3", "", 1), c("HAG_VN4", "", 1), c("HAG_VN5", "", 1), c("HAG_QN2", "Số lượng (2)", 4, "end"), c("HAG_QT2", "", 2)],
      [c("HAG_BPR", "Trị giá hóa đơn", 6, "end"), c("HAG_UPR", "Đơn giá hóa đơn", 3, "end"), c("HAG_UPC", "", 1), c("HAG_TSC", "", 2)],
    ],
  },
  {
    id: "thue-nk", title: "Thuế nhập khẩu", rows: [
      [c("HAG_B36", "Trị giá tính thuế(S)", 4, "end"), c("HAG_B50", "", 2), c("HAG_B51", "Trị giá tính thuế(M)", 6, "end")],
      [c("HAG_B37", "Số lượng tính thuế", 4, "end"), c("HAG_B38", "", 2), c("HAG_KKT", "Đơn giá tính thuế", 4, "end"), c("HAG_KKS", "", 2)],
      [c("HAG_B42", "Thuế suất", 2), c("HAG_B43", "", 2, "end"), c("HAG_SKB", "", 2), c("HAG_SPD", "Mã áp dụng thuế tuyệt đối", 6)],
      [c("HAG_B47", "Số tiền thuế", 6, "end"), c("HAG_OR", "Nước xuất xứ", 2), c("HAG_B56", "", 2), c("HAG_ORS", "", 2)],
      [c("HAG_B49", "Số tiền miễn giảm", 6, "end"), c("HAG_KWS", "Mã ngoài hạn ngạch", 6)],
      [c("HAG_TDL", "Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng", 6)],
      [c("HAG_TXN", "Danh mục miễn thuế nhập khẩu", 4), c("HAG_TXR", "", 2)],
      [c("HAG_RE", "Miễn / Giảm / Không chịu thuế nhập khẩu", 6), c("HAG_B59", "", 6)],
    ],
  },
  {
    // Mỗi khoản 1–5: cột trái tên/trị giá/thuế suất/tiền thuế/miễn giảm, cột phải mã áp dụng/số lượng/miễn giảm thu khác. Tiền thuế, tiền miễn giảm mỗi ô một dòng (cột phải trống như mẫu).
    id: "thu-khac", title: "Thuế và thu khác", rows: [
      rep(5, [
        c("HAG_KQ{n}", "Tên", 6), c("HAG_TX{n}", "Mã áp dụng thuế suất", 6),
        c("HAG_KS{n}", "Trị giá tính thuế", 6, "end"), c("HAG_KT{n}", "Số lượng tính thuế", 4, "end"), c("HAG_KU{n}", "", 2),
        c("HAG_KY{n}", "Thuế suất", 6, "end"), c("HAG_TR{n}", "Miễn / Giảm / Không chịu thuế và thu khác", 4), c("HAG_LC{n}", "", 2),
        c("HAG_KZ{n}", "Số tiền thuế", 12),
        c("HAG_LB{n}", "Số tiền miễn giảm", 12),
      ]),
    ],
  },
];

export const PRINT_IDA: PrintLayout = {
  kind: "IDA",
  header: HEADER,
  pages: [
    { id: "trang-1", regions: [...PAGE_1, BILL, ...VALUE, TAX, { id: "tong-so", rows: [[c("TK_B12", "Tổng số trang của tờ khai", 6), c("TK_B13", "Tổng số dòng hàng của tờ khai", 6)]] }] },
    { id: "trang-2", regions: PAGE_2 },
  ],
  item: ITEM,
  itemsPerPage: 1,
};
