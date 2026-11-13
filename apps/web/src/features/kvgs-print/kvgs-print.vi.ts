// Chữ cố định trên bản kê mã vạch qua khu vực giám sát (văn bản Hải quan) – chỉ tiếng Việt, không dịch theo ngôn ngữ giao diện.
// Chép nguyên văn từ 2 mẫu "In bản kê mã vạch container" / "In bản kê mã vạch hàng lẻ" (docs/mauin_danhsachcontqua_kvgs/).

export const TITLE = { cont: "DANH SÁCH CONTAINER", le: "DANH SÁCH HÀNG HÓA" } as const;
export const SUBTITLE = "ĐỦ ĐIỀU KIỆN QUA KHU VỰC GIÁM SÁT HẢI QUAN";
export const SEAL = { required: "Tờ khai phải niêm phong", notRequired: "Tờ khai không phải niêm phong" } as const;

/** "Ngày 24 tháng 10 năm 2026" (góc phải đầu trang). */
export const DATE_LINE = "Ngày {d} tháng {m} năm {y}";

export const ITEMS = {
  supervisionOffice: "1. Chi cục hải quan giám sát:",
  company: "2. Đơn vị XNK:",
  taxCode: "3. Mã số thuế:",
  declarationNo: "4. Số tờ khai:",
  declarationStatus: "5. Trạng thái tờ khai:",
  declarationDate: "6. Ngày tờ khai:",
  typeName: "7. Loại hình:",
  channel: "8. Luồng:",
  cargoControlNo: "9. Số quản lý hàng hóa:",
} as const;

export const STT = "STT";

/** Tiêu đề cột, mỗi phần tử một dòng chữ như mẫu. */
export const CONT_COLUMNS = {
  containerNo: ["SỐ HIỆU CONTAINER", "(1)"],
  sealNo: ["SỐ SEAL CONTAINER", "(Nếu có)", "(2)"],
  customsSealNo: ["SỐ SEAL HẢI QUAN", "(Nếu có)", "(3)"],
  officer: ["XÁC NHẬN CỦA CÔNG CHỨC HẢI QUAN", "(4)"],
  barcode: ["MÃ VẠCH", "(5)"],
} as const;

export const CARGO_COLUMNS = {
  quantity: ["SỐ LƯỢNG HÀNG", "(1)"],
  weight: ["TỔNG TRỌNG LƯỢNG HÀNG", "(2)"],
  actual: ["LƯỢNG HÀNG HÓA THỰC TẾ QUA KHU VỰC", "GIÁM SÁT HẢI QUAN", "(3)"],
  officer: ["XÁC NHẬN CỦA CÔNG CHỨC HẢI QUAN", "(4)"],
} as const;

export const NOTE_TITLE = "Ghi chú:";

/** Dòng ghi chú: `level` 0 = gạch đầu dòng "-", 1 = thụt vào ("+" hoặc đoạn giải thích). */
export type NoteLine = { level: 0 | 1; text: string };

export const CONT_NOTES: readonly NoteLine[] = [
  { level: 0, text: "- Cột số (1):" },
  { level: 1, text: "+ Đối với hàng nhập khẩu: lấy từ Danh sách container do người khai hải quan gửi đến hệ thống." },
  { level: 1, text: "+ Đối với hàng xuất khẩu: lấy từ tiêu chí \"Số container\" trên tờ khai xuất." },
  { level: 1, text: "Trường hợp có sự thay đổi số container đã khai báo, căn cứ chứng từ do người khai hải quan nộp; xuất trình, công chức hải quan cập nhật số container vào hệ thống để in lại danh sách container." },
  { level: 0, text: "- Cột số (2): Đối với hàng nhập khẩu: lấy từ Danh sách container do người khai hải quan gửi đến hệ thống." },
];

export const CARGO_NOTES: readonly NoteLine[] = [
  { level: 0, text: "- Cột số (1) lấy từ tiêu chí \"Số lượng\" trên phần \"General\" của tờ khai hải quan." },
  { level: 0, text: "- Cột số (2) lấy từ tiêu chí \"Tổng trọng lượng hàng\" trên phần \"General\" của tờ khai hải quan." },
  { level: 0, text: "- Trường hợp hàng hóa được đưa qua KVGS nhiều lần thì đối với từng lần đưa hàng qua KVGS, công chức hải quan thực hiện:" },
  { level: 1, text: "+ Cột số (3): ghi rõ lượng hàng từng lần qua KVGS." },
  { level: 1, text: "+ Cột số (4): ghi ngày, tháng, năm; ký, đóng dấu công chức." },
  { level: 0, text: "- Trường hợp giá trị tại cột (1):" },
  { level: 1, text: "+ khác 1 thì theo dõi lượng hàng tại cột (3) tương ứng theo cột (1);" },
  { level: 1, text: "+ bằng 1 thì theo dõi lượng hàng tại cột (3) tương ứng theo cột (2)." },
];

/** "Kết xuất dữ liệu lúc: 24/10/2026 11:00 PM" */
export const EXPORTED_AT = "Kết xuất dữ liệu lúc: {at}";
export const AM = "AM";
export const PM = "PM";

/** Số trang in ở chân mỗi trang giấy. */
export const PAGE = "Trang {n}/{total}";

/** Tên truy cập của mã vạch (đọc màn hình). */
export const BARCODE_LABEL = { container: "Mã vạch container {no}", declaration: "Mã vạch tờ khai {no}" } as const;
