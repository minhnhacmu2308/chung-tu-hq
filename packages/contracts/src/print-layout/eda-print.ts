// Bản in tờ khai xuất khẩu (EDA) theo mẫu VNACCS MAUIN_TOKHAI_XUATKHAU.pdf ("thông quan"):
// tr.1 + tr.2 = `pages`, tr.3+ = hai dòng hàng mỗi trang (`item`). Khóa = khóa ô của declaration-layout/eda.ts; nhãn = chữ in trên mẫu.
//
// Ô / chữ có trên mẫu nhưng bố cục EDA không có khóa nào → bỏ:
// - Đầu trang: mã vạch; "<EXP>"; số trang "n / N" (tính khi vẽ); ô "-" sau "Thời hạn tái nhập/ tái xuất".
// - Tr.1: "Số quản lý người sử dụng"; chữ "VND" cố định sau "Tổng số tiền lệ phí".
// - Tr.2: số dòng chỉ thị 1–10 (tính khi vẽ).
// - Dòng hàng: số thứ tự dòng "< 01 >" (tính khi vẽ); chữ "VND" cố định sau "Khoản tiền" lệ phí / bảo hiểm;
//   dòng không nhãn dưới "Đơn giá hóa đơn" ("73.005,1898 VND KGM" – đơn giá tính thuế quy VND của Hải quan, bố cục EDA không có khóa).
// Dãy ô đánh số trên cùng một dòng ("Mã 1 … 2 … 5", "Mã văn bản pháp luật khác 1 … 5"): ô đầu mang nhãn dòng + số, các ô sau mang số.
import { c, rep } from "./cells.js";
import type { PrintLayout, PrintRegion, PrintRow } from "./types.js";

const nums = (n: number, f: (i: number) => PrintRow): PrintRow[] => Array.from({ length: n }, (_, i) => f(i + 1));

/** Đầu trang – lặp ở mọi trang (6 dòng dưới tiêu đề). */
const HEADER: PrintRow[] = [
  [c("TK_ECN", "Số tờ khai", 4), c("TK_FIC", "Số tờ khai đầu tiên", 4), c("TK_BNO", "", 2), c("TK_DNO", "", 2)],
  [c("TK_TDN", "Số tờ khai tạm nhập tái xuất tương ứng", 12)],
  // Mã loại hình | mã phân loại hàng hóa | mã hiệu PTVC: "B11  2" (mẫu: hàng container đường biển, mã phân loại hàng trống).
  [c("TK_K07", "Mã phân loại kiểm tra", 3), c("TK_ECB", "Mã loại hình", 3), c("TK_CCC", "", 1), c("TK_MTC", "", 1), c("TK_K01", "Mã số thuế đại diện", 4)],
  // TK_CH như IDA: in mã + tên Chi cục cả trước lẫn sau đăng ký (TK_K08 = tên Hải quan trả về, không in riêng).
  [c("TK_CH", "Tên cơ quan Hải quan tiếp nhận tờ khai", 6), c("TK_CHB", "Mã bộ phận xử lý tờ khai", 6)],
  [c("TK_K10", "Ngày đăng ký", 4), c("TK_RT1", "", 2), c("TK_AD21", "Ngày thay đổi đăng ký", 4), c("TK_AD31", "", 2)],
  [c("TK_RID", "Thời hạn tái nhập/ tái xuất", 6)],
];

const PARTIES: PrintRegion[] = [
  { id: "nguoi-xuat-khau", title: "Người xuất khẩu", rows: [[c("TK_EPC", "Mã", 12)], [c("TK_EPN", "Tên", 12)], [c("TK_EPP", "Mã bưu chính", 12)], [c("TK_EPA", "Địa chỉ", 12)], [c("TK_EPT", "Số điện thoại", 12)]] },
  { id: "uy-thac-xk", title: "Người ủy thác xuất khẩu", rows: [[c("TK_EXC", "Mã", 12)], [c("TK_EXN", "Tên", 12)]] },
  {
    id: "nguoi-nhap-khau", title: "Người nhập khẩu", rows: [
      [c("TK_CGC", "Mã", 12)], [c("TK_CGN", "Tên", 12)], [c("TK_CGP", "Mã bưu chính", 12)],
      [c("TK_CGA", "Địa chỉ", 6), c("TK_CAT", "", 6)], [c("TK_CAC", "", 6), c("TK_CAS", "", 6)],
      [c("TK_CGK", "Mã nước", 12)],
    ],
  },
  // Mã đại lý người khai nhập | tên, mã nhân viên Hải quan ghi nhận.
  { id: "dai-ly", rows: [[c("TK_ECC", "Đại lý Hải quan", 3), c("TK_K33", "", 6), c("TK_K34", "Mã nhân viên Hải quan", 3)]] },
];

const BILL: PrintRegion = {
  id: "van-don", rows: [
    [c("TK_EKN", "Số vận đơn", 12)],
    [c("TK_NO", "Số lượng", 6, "end"), c("TK_NOT", "", 6)],
    [c("TK_GW", "Tổng trọng lượng hàng (Gross)", 6, "end"), c("TK_GWT", "", 6)],
    [c("TK_ST", "Địa điểm lưu kho", 6), c("TK_K42", "", 6)],
    [c("TK_DSC", "Địa điểm nhận hàng cuối cùng", 6), c("TK_DSN", "", 6)],
    [c("TK_PSC", "Địa điểm xếp hàng", 6), c("TK_PSN", "", 6)],
    [c("TK_VSC", "Phương tiện vận chuyển dự kiến", 6), c("TK_VSN", "", 6)],
    [c("TK_SYM", "Ngày hàng đi dự kiến", 12)],
    [c("TK_MRK", "Ký hiệu và số hiệu", 12)],
  ],
};

const PERMIT_VALUE: [PrintRegion, PrintRegion] = [
  { id: "giay-phep", title: "Giấy phép xuất khẩu", rows: nums(5, (i) => [c(`TK_SS${i}`, `${i}`, 2), c(`TK_SN${i}`, "", 6)]) },
  {
    id: "hoa-don", rows: [
      [c("TK_IV1", "Số hóa đơn", 6), c("TK_IV3", "", 6)],
      [c("TK_IV2", "Số tiếp nhận hóa đơn điện tử", 12)],
      [c("TK_IVD", "Ngày phát hành", 12)],
      [c("TK_IVP", "Phương thức thanh toán", 12)],
      // "CFR - USD - 85.350 - A": điều kiện giao hàng, mã tiền, trị giá, mã phân loại giá hóa đơn.
      [c("TK_IP2", "Tổng trị giá hóa đơn", 4), c("TK_IP3", "", 2), c("TK_IP4", "", 4, "end"), c("TK_IP1", "", 2)],
      [c("TK_FCD", "Tổng trị giá tính thuế", 6), c("TK_FKK", "", 6, "end")],
      // "USD - 25.790  -": tỷ giá 1, ô "-" sau = tỷ giá 2.
      [c("TK_RC1", "Tỷ giá tính thuế", 4), c("TK_RD1", "", 2, "end"), c("TK_RC2", "", 3), c("TK_RD2", "", 3, "end")],
      // "85.350 -": ô một ký tự sau = mã phân loại nhập liệu tổng giá cơ bản (như TK_A97 của IDA).
      [c("TK_TP", "Tổng hệ số phân bổ trị giá tính thuế", 6, "end"), c("TK_K68", "", 1)],
    ],
  },
];

const TAX: PrintRegion = {
  id: "nop-thue", rows: [
    [c("TK_CNV", "Phân loại không cần quy đổi VND", 3), c("TK_TPM", "Người nộp thuế", 3), c("TK_ENC", "Mã xác định thời hạn nộp thuế", 3), c("TK_PAY", "Phân loại nộp thuế", 3)],
    [c("TK_ETA", "Tổng số tiền thuế xuất khẩu", 4, "end"), c("TK_AD7", "", 2)],
    [c("TK_SAM", "Số tiền bảo lãnh", 4, "end"), c("TK_AD8", "", 2), c("TK_TCO", "Tổng số tiền lệ phí", 6, "end")],
  ],
};

const PAGE_1_TAIL: PrintRegion[] = [
  { id: "tong-so", rows: [[c("TK_K69", "Tổng số trang của tờ khai", 6), c("TK_K70", "Tổng số dòng hàng của tờ khai", 6)]] },
  { id: "dinh-kem", title: "Số đính kèm khai báo điện tử", rows: [[c("TK_EA1", "1", 1), c("TK_EB1", "", 3), c("TK_EA2", "2", 1), c("TK_EB2", "", 3), c("TK_EA3", "3", 1), c("TK_EB3", "", 3)]] },
  { id: "ghi-chu", rows: [[c("TK_NT2", "Phần ghi chú", 12)]] },
  { id: "so-quan-ly", rows: [[c("TK_REF", "Số quản lý của nội bộ doanh nghiệp", 6)]] },
  {
    id: "thong-bao", title: "Mục thông báo của Hải quan", rows: [
      [c("TK_K87", "Tên trưởng đơn vị Hải quan", 12)],
      [c("TK_CCD", "Ngày hoàn thành kiểm tra", 4), c("TK_AD4", "", 2)],
      [c("TK_K86", "Ngày cấp phép xuất nhập", 4), c("TK_AD5", "", 2)],
      [c("TK_DPD", "Thời hạn cho phép vận chuyển bảo thuế (khởi hành)", 12)],
      // Dòng 1–3: cột Địa điểm / Ngày đến / Ngày khởi hành.
      rep(3, [c("TK_ST{n}", "Địa điểm", 4), c("TK_AD{n}", "Ngày đến", 4), c("TK_SD{n}", "Ngày khởi hành", 4)], "Thông tin trung chuyển"),
      [c("TK_ARP", "Địa điểm đích cho vận chuyển bảo thuế", 6), c("TK_ADT", "", 6)],
    ],
  },
];

const PAGE_2: PrintRegion[] = [
  { id: "vanning", title: "Vanning", rows: [] },
  {
    id: "vanning-dia-diem", title: "Địa điểm xếp hàng lên xe chở hàng", rows: [
      [c("CON_VC1", "Mã 1", 4), c("CON_VC2", "2", 2), c("CON_VC3", "3", 2), c("CON_VC4", "4", 2), c("CON_VC5", "5", 2)],
      [c("CON_VN", "Tên", 12)],
      [c("CON_VA", "Địa chỉ", 12)],
    ],
  },
  // 10 dòng × 5 ô, nhãn = số thứ tự in trên mẫu (1–50).
  { id: "container", title: "Số container", rows: nums(10, (r) => Array.from({ length: 5 }, (_, i) => (r - 1) * 5 + i + 1).map((n) => c(`CON_C${String(n).padStart(2, "0")}`, `${n}`, 2))) },
  { id: "chi-thi", title: "Chỉ thị của Hải quan", rows: [rep(10, [c("CTHQ_D{nn}", "Ngày", 2), c("CTHQ_T{nn}", "Tên", 4), c("CTHQ_I{nn}", "Nội dung", 6)])] },
];

/** Khối một dòng hàng (tr.3+ của mẫu, hai khối mỗi trang). */
const ITEM: (PrintRegion | [PrintRegion, PrintRegion])[] = [
  {
    id: "hang", rows: [
      [c("HAG_CMD", "Mã số hàng hóa", 4), c("HAG_COC", "Mã quản lý riêng", 4), c("HAG_R03", "Mã phân loại tái xác nhận giá", 4)],
      [c("HAG_CMN", "Mô tả hàng hóa", 12)],
      [c("HAG_QN1", "Số lượng (1)", 4, "end"), c("HAG_QT1", "", 2)],
      [c("HAG_QN2", "Số lượng (2)", 4, "end"), c("HAG_QT2", "", 2)],
      [c("HAG_BPR", "Trị giá hóa đơn", 6, "end"), c("HAG_UPR", "Đơn giá hóa đơn", 3, "end"), c("HAG_UPC", "", 1), c("HAG_TSC", "", 2)],
    ],
  },
  {
    id: "thue-xk", title: "Thuế xuất khẩu", rows: [
      [c("HAG_R07", "Trị giá tính thuế(S)", 4, "end"), c("HAG_ADB", "", 2), c("HAG_R15", "Trị giá tính thuế(M)", 4, "end"), c("HAG_R14", "", 2)],
      [c("HAG_TSQ", "Số lượng tính thuế", 4, "end"), c("HAG_TSU", "", 2), c("HAG_CVU", "Đơn giá tính thuế", 4, "end"), c("HAG_ADA", "", 1), c("HAG_QCV", "", 1)],
      [c("HAG_TRA", "Thuế suất", 4, "end"), c("HAG_TRM", "", 2)],
      [c("HAG_TAX", "Số tiền thuế", 4, "end"), c("HAG_ADC", "", 2)],
      // EDA không có ô Hải quan cho tiền miễn giảm → in số tiền giảm người khai nhập.
      [c("HAG_REG", "Số tiền miễn giảm", 4, "end")],
    ],
  },
  {
    id: "mien-thue", rows: [
      [c("HAG_TDL", "Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng", 12)],
      [c("HAG_TXN", "Danh mục miễn thuế xuất khẩu", 6), c("HAG_ADE", "", 2)],
    ],
  },
  [
    { id: "le-phi", title: "Tiền lệ phí", rows: [[c("HAG_CUP", "Đơn giá", 6, "end")], [c("HAG_CQU", "Số lượng", 4, "end"), c("HAG_CQC", "", 2)], [c("HAG_CPR", "Khoản tiền", 6, "end")]] },
    { id: "bao-hiem", title: "Tiền bảo hiểm", rows: [[c("HAG_IUP", "Đơn giá", 6, "end")], [c("HAG_IQU", "Số lượng", 4, "end"), c("HAG_IQC", "", 2)], [c("HAG_IPR", "Khoản tiền", 6, "end")]] },
  ],
  {
    id: "van-ban-mien-giam", rows: [
      [c("HAG_OL1", "Mã văn bản pháp luật khác 1", 4), c("HAG_OL2", "2", 2), c("HAG_OL3", "3", 2), c("HAG_OL4", "4", 2), c("HAG_OL5", "5", 2)],
      [c("HAG_RE", "Miễn / Giảm / Không chịu thuế xuất khẩu", 6), c("HAG_TRL", "", 6)],
    ],
  },
];

export const PRINT_EDA: PrintLayout = {
  kind: "EDA",
  header: HEADER,
  pages: [
    { id: "trang-1", regions: [...PARTIES, BILL, PERMIT_VALUE, TAX, ...PAGE_1_TAIL] },
    { id: "trang-2", regions: PAGE_2 },
  ],
  item: ITEM,
  itemsPerPage: 2,
};
