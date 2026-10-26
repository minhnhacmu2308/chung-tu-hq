/**
 * Danh mục mã nhỏ dùng khi khai tờ khai IDA/EDA.
 * Nguồn: Phụ lục II TT39/2018 (sửa đổi TT121/2025) cho các bảng mã ghi ngay trong hướng dẫn chỉ tiêu.
 * "DANH MUC CHUAN VNACCS.xlsx" (FPT) chỉ mô tả cấu trúc bảng (API SyncCategory), không chứa dữ liệu,
 * nên các mã không có trong tài liệu được đánh dấu `unverified: true` – cần đồng bộ lại từ danh mục VNACCS.
 */
import type { CodeTable } from "./catalog-types.js";

export interface CodeEntry {
  code: string;
  label: string;
  /** true khi mã/nhãn lấy theo hiểu biết chung, chưa đối chiếu được với văn bản trong business/. */
  unverified?: true;
}

/** Chỉ tiêu 1.6 / 2.6 – Mã hiệu phương thức vận chuyển. */
export const TRANSPORT_MODES: CodeEntry[] = [
  { code: "1", label: "Đường không" },
  { code: "2", label: "Đường biển (container)" },
  { code: "3", label: "Đường biển (hàng rời, lỏng...)" },
  { code: "4", label: "Đường bộ (xe tải)" },
  { code: "5", label: "Đường sắt" },
  { code: "6", label: "Đường sông" },
  { code: "9", label: "Khác" },
];

/** Chỉ tiêu 1.39 / 2.34 – Phân loại hình thức hóa đơn (không có mã C). */
export const INVOICE_KINDS: CodeEntry[] = [
  { code: "A", label: "Hóa đơn thương mại" },
  { code: "B", label: "Chứng từ tương đương hóa đơn thương mại, bảng kê hóa đơn (02/BKHĐ/GSQL) hoặc không có hóa đơn" },
  { code: "D", label: "Hóa đơn điện tử (đăng ký trên VNACCS)" },
];

/**
 * Chỉ tiêu 1.44 ô 1 / 2.39 ô 4 – Mã phân loại giá hóa đơn.
 * Nhãn D "(kể cả không có hóa đơn thương mại)" theo TT121 cho 1.44. Riêng 2.39 ô 4 (TT39): không có hóa đơn và không
 * nhập "Số hóa đơn" thì không khai ô này.
 */
export const PRICE_KINDS: CodeEntry[] = [
  { code: "A", label: "Giá hóa đơn cho hàng hóa phải trả tiền" },
  { code: "B", label: "Giá hóa đơn cho hàng hóa không phải trả tiền (FOC/hàng khuyến mại)" },
  { code: "C", label: "Giá hóa đơn cho hàng hóa gồm phải trả tiền và không phải trả tiền" },
  { code: "D", label: "Các trường hợp khác (kể cả không có hóa đơn thương mại)" },
];

/** Chỉ tiêu 1.43 / 2.38 – Phương thức thanh toán (TK_IVP). */
export const PAYMENT_METHODS: CodeEntry[] = [
  { code: "BIENMAU", label: "Biên mậu" },
  { code: "DA", label: "Nhờ thu chấp nhận chứng từ" },
  { code: "CAD", label: "Trả tiền lấy chứng từ" },
  { code: "CANTRU", label: "Cấn trừ, bù trừ" },
  { code: "CASH", label: "Tiền mặt" },
  { code: "CHEQUE", label: "Séc" },
  { code: "DP", label: "Nhờ thu kèm chứng từ" },
  { code: "GV", label: "Góp vốn" },
  { code: "H-D-H", label: "Hàng đổi hàng" },
  { code: "H-T-N", label: "Hàng trả nợ" },
  { code: "HPH", label: "Hối phiếu" },
  { code: "KHONGTT", label: "Không thanh toán" },
  { code: "LC", label: "Tín dụng thư" },
  { code: "LDDT", label: "Liên doanh đầu tư" },
  { code: "OA", label: "Mở tài khoản thanh toán" },
  { code: "TTR", label: "Chuyển tiền bồi hoàn bằng điện" },
  { code: "KC", label: "Khác (bao gồm cả thanh toán bằng hình thức TT)" },
];

/**
 * Điều kiện giá hóa đơn (1.44 ô 2 / 2.39 ô 1): 11 mã Incoterms 2020 và các mã cũ VNACCS vẫn chấp nhận theo Phụ lục II
 * TT39: C&F (CNF), DAT, C&I, DAF, DDU, DES, DEQ. Mã nào dùng được cho mẫu nào: xem INCOTERMS_IDA / INCOTERMS_EDA.
 */
export const INCOTERMS: CodeEntry[] = [
  { code: "EXW", label: "Giao tại xưởng" },
  { code: "FCA", label: "Giao cho người chuyên chở" },
  { code: "FAS", label: "Giao dọc mạn tàu" },
  { code: "FOB", label: "Giao lên tàu" },
  { code: "CFR", label: "Tiền hàng và cước phí" },
  { code: "CIF", label: "Tiền hàng, bảo hiểm và cước phí" },
  { code: "CPT", label: "Cước phí trả tới" },
  { code: "CIP", label: "Cước phí và bảo hiểm trả tới" },
  { code: "DAP", label: "Giao tại nơi đến" },
  { code: "DPU", label: "Giao tại nơi đến đã dỡ xuống" },
  { code: "DDP", label: "Giao hàng đã nộp thuế" },
  { code: "C&F", label: "Tiền hàng và cước phí (cách viết cũ của CFR)" },
  { code: "CNF", label: "Tiền hàng và cước phí (cách viết khác của C&F)" },
  { code: "C&I", label: "Tiền hàng và bảo hiểm" },
  { code: "DAT", label: "Giao tại bến (Incoterms 2010)" },
  { code: "DAF", label: "Giao tại biên giới (Incoterms 2000)" },
  { code: "DDU", label: "Giao hàng chưa nộp thuế (Incoterms 2000)" },
  { code: "DES", label: "Giao tại tàu (Incoterms 2000)" },
  { code: "DEQ", label: "Giao tại cầu cảng (Incoterms 2000)" },
];

/** Mã viết khác của cùng một điều kiện giá: Phụ lục II ghi "C&F (CNF)" là một mục. */
export const INCOTERM_ALIASES: Readonly<Record<string, string>> = { CNF: "C&F" };

/** 1.44 ô 2 (Mẫu 01, IDA): 18 mã theo TT121 – 17 mã của TT39 cộng DPU. CNF được chấp nhận như C&F. */
export const INCOTERMS_IDA: readonly string[] = [
  "CIF", "CIP", "FOB", "FCA", "FAS", "EXW", "C&F", "CFR", "CPT", "DDP", "DAP", "DAT", "C&I", "DAF", "DDU", "DES", "DEQ", "DPU",
];

/** 2.39 ô 1 (Mẫu 02, EDA): 17 mã theo TT39, không có DPU (TT121 chỉ bổ sung DPU cho 1.44). */
export const INCOTERMS_EDA: readonly string[] = INCOTERMS_IDA.filter((code) => code !== "DPU");

/** Mã điều kiện giá có dùng được cho mẫu tờ khai không (chấp nhận mã viết khác, ví dụ CNF). */
export function isIncotermAllowed(code: string, form: "01" | "02"): boolean {
  const normalized = INCOTERM_ALIASES[code] ?? code;
  return (form === "01" ? INCOTERMS_IDA : INCOTERMS_EDA).includes(normalized);
}

/**
 * 1.48: điều kiện giá đã gồm bảo hiểm – ô phí bảo hiểm không nhập được (TT39: CIF, CIP, C&I, DDU, DDP, DAP, DAF, DAT).
 * DPU KHÔNG có trong danh sách của văn bản (TT121 không sửa 1.48) nên không đưa vào, dù về bản chất DPU cũng là nhóm D
 * như DAP – khi khai DPU cần người khai tự xác nhận.
 */
export const INCOTERMS_WITH_INSURANCE: readonly string[] = ["CIF", "CIP", "C&I", "DDU", "DDP", "DAP", "DAF", "DAT"];

/** Nhóm E, F: giá chưa gồm cước vận tải quốc tế (phải khai phí vận chuyển 1.47). */
export const INCOTERMS_FREIGHT_NOT_INCLUDED: readonly string[] = ["EXW", "FCA", "FAS", "FOB"];

/** Đơn vị tính số lượng hàng (A501, chuẩn UN/ECE Rec 20) – nhóm hay gặp. */
export const UNITS: CodeEntry[] = [
  { code: "PCE", label: "Chiếc/cái" },
  { code: "SET", label: "Bộ" },
  { code: "KGM", label: "Kilôgam" },
  { code: "GRM", label: "Gam" },
  { code: "TNE", label: "Tấn" },
  { code: "LBR", label: "Pound" },
  { code: "MTR", label: "Mét" },
  { code: "CMT", label: "Xentimét", unverified: true },
  { code: "MTK", label: "Mét vuông" },
  { code: "MTQ", label: "Mét khối" },
  { code: "LTR", label: "Lít" },
  { code: "MLT", label: "Mililít", unverified: true },
  { code: "PR", label: "Đôi" },
  { code: "DZN", label: "Tá", unverified: true },
  { code: "UNT", label: "Đơn vị", unverified: true },
  { code: "KWH", label: "Kilôoát giờ", unverified: true },
  { code: "GLL", label: "Gallon", unverified: true },
  { code: "CTN", label: "Thùng carton", unverified: true },
  { code: "BAG", label: "Bao/túi", unverified: true },
  { code: "BOX", label: "Hộp", unverified: true },
  { code: "ROL", label: "Cuộn", unverified: true },
  { code: "CAI", label: "Cái (mã tiếng Việt)", unverified: true },
  { code: "CHIEC", label: "Chiếc (mã tiếng Việt)", unverified: true },
  { code: "BO", label: "Bộ (mã tiếng Việt)", unverified: true },
  { code: "DOI", label: "Đôi (mã tiếng Việt)", unverified: true },
  { code: "CUON", label: "Cuộn (mã tiếng Việt)", unverified: true },
  { code: "TAM", label: "Tấm (mã tiếng Việt)", unverified: true },
  { code: "HOP", label: "Hộp (mã tiếng Việt)", unverified: true },
  { code: "THUNG", label: "Thùng (mã tiếng Việt)", unverified: true },
  { code: "KIEN", label: "Kiện (mã tiếng Việt)", unverified: true },
];

/**
 * Mã loại kiện cho ô 2 chỉ tiêu 1.27 / 2.25 (bảng "Mã loại kiện", UN/ECE Rec 21; chỉ CS, BX được ghi làm ví dụ trong
 * Phụ lục II). Bảng mã catalog "PACKAGE_KIND" trỏ tới bảng này.
 */
export const PACKAGE_UNITS: CodeEntry[] = [
  { code: "CS", label: "Thùng (case)" },
  { code: "BX", label: "Hộp" },
  { code: "PK", label: "Kiện (package, pallet)" },
  { code: "CT", label: "Thùng carton", unverified: true },
  { code: "BG", label: "Bao/túi", unverified: true },
  { code: "DR", label: "Thùng phuy", unverified: true },
  { code: "RO", label: "Cuộn", unverified: true },
  { code: "BL", label: "Kiện nén (bale)", unverified: true },
  { code: "BE", label: "Bó", unverified: true },
  { code: "CR", label: "Thùng gỗ (crate)", unverified: true },
  { code: "SA", label: "Bao tải", unverified: true },
];

/** Mã nước ISO 3166-1 alpha-2 (ô "Mã nước", "Mã nước xuất xứ") – đối tác thương mại chính của Việt Nam. */
export const COUNTRIES: CodeEntry[] = [
  { code: "VN", label: "Việt Nam" },
  { code: "CN", label: "Trung Quốc" },
  { code: "JP", label: "Nhật Bản" },
  { code: "KR", label: "Hàn Quốc" },
  { code: "TW", label: "Đài Loan" },
  { code: "HK", label: "Hồng Kông" },
  { code: "MO", label: "Ma Cao" },
  { code: "US", label: "Hoa Kỳ" },
  { code: "CA", label: "Canada" },
  { code: "MX", label: "Mexico" },
  { code: "BR", label: "Brazil" },
  { code: "AR", label: "Argentina" },
  { code: "CL", label: "Chi Lê" },
  { code: "DE", label: "Đức" },
  { code: "FR", label: "Pháp" },
  { code: "IT", label: "Ý" },
  { code: "ES", label: "Tây Ban Nha" },
  { code: "NL", label: "Hà Lan" },
  { code: "BE", label: "Bỉ" },
  { code: "GB", label: "Vương quốc Anh" },
  { code: "CH", label: "Thụy Sĩ" },
  { code: "SE", label: "Thụy Điển" },
  { code: "PL", label: "Ba Lan" },
  { code: "CZ", label: "Séc" },
  { code: "RU", label: "Nga" },
  { code: "TR", label: "Thổ Nhĩ Kỳ" },
  { code: "IN", label: "Ấn Độ" },
  { code: "BD", label: "Bangladesh" },
  { code: "PK", label: "Pakistan" },
  { code: "TH", label: "Thái Lan" },
  { code: "MY", label: "Malaysia" },
  { code: "SG", label: "Singapore" },
  { code: "ID", label: "Indonesia" },
  { code: "PH", label: "Philippines" },
  { code: "KH", label: "Campuchia" },
  { code: "LA", label: "Lào" },
  { code: "MM", label: "Myanmar" },
  { code: "AU", label: "Úc" },
  { code: "NZ", label: "New Zealand" },
  { code: "AE", label: "Các Tiểu vương quốc Ả Rập Thống nhất" },
  { code: "SA", label: "Ả Rập Xê Út" },
  { code: "IL", label: "Israel" },
  { code: "ZA", label: "Nam Phi" },
];

/** Mã tiền tệ ISO 4217 (A527). */
export const CURRENCIES: CodeEntry[] = [
  { code: "USD", label: "Đô la Mỹ" },
  { code: "EUR", label: "Euro" },
  { code: "JPY", label: "Yên Nhật" },
  { code: "CNY", label: "Nhân dân tệ" },
  { code: "KRW", label: "Won Hàn Quốc" },
  { code: "GBP", label: "Bảng Anh" },
  { code: "SGD", label: "Đô la Singapore" },
  { code: "THB", label: "Baht Thái" },
  { code: "TWD", label: "Đô la Đài Loan" },
  { code: "HKD", label: "Đô la Hồng Kông" },
  { code: "AUD", label: "Đô la Úc" },
  { code: "CAD", label: "Đô la Canada" },
  { code: "CHF", label: "Franc Thụy Sĩ" },
  { code: "MYR", label: "Ringgit Malaysia" },
  { code: "INR", label: "Rupee Ấn Độ" },
  { code: "NZD", label: "Đô la New Zealand" },
  { code: "VND", label: "Đồng Việt Nam" },
];

/**
 * Mã Chi cục Hải quan (A038) hay gặp. Chỉ 03CC (CV 4613/TCHQ-VNACCS), 47NB (Phụ lục II, ví dụ mã 47NBOZZ)
 * và 01PR (CV 8444/CHQ-GSQL, ví dụ số tiếp nhận) có trong tài liệu; còn lại theo trí nhớ, tên đơn vị đã đổi
 * sau sắp xếp bộ máy 2025 – phải đồng bộ lại bằng danh mục A038 (FPT SyncCategory).
 */
export const CUSTOMS_OFFICES: CodeEntry[] = [
  { code: "03CC", label: "Hải quan CK cảng Hải Phòng KV I" },
  { code: "47NB", label: "Hải quan Biên Hòa (Đồng Nai)" },
  { code: "01PR", label: "Hải quan Vĩnh Phúc" },
  { code: "03CE", label: "Hải quan CK cảng Hải Phòng KV II", unverified: true },
  { code: "03EE", label: "Hải quan CK cảng Hải Phòng KV III", unverified: true },
  { code: "03TG", label: "Hải quan CK cảng Đình Vũ", unverified: true },
  { code: "03PJ", label: "Hải quan Hải Dương", unverified: true },
  { code: "03PL", label: "Hải quan Hưng Yên", unverified: true },
  { code: "01B1", label: "Hải quan CK sân bay quốc tế Nội Bài (hàng hóa XNK)", unverified: true },
  { code: "01NV", label: "Hải quan Bắc Hà Nội", unverified: true },
  { code: "01E1", label: "Hải quan Gia Lâm", unverified: true },
  { code: "02CI", label: "Hải quan CK cảng Sài Gòn KV I (Cát Lái)", unverified: true },
  { code: "02CC", label: "Hải quan CK cảng Sài Gòn KV II", unverified: true },
  { code: "02CV", label: "Hải quan CK cảng Sài Gòn KV III (Hiệp Phước)", unverified: true },
  { code: "02CX", label: "Hải quan CK cảng Sài Gòn KV IV", unverified: true },
  { code: "02B1", label: "Hải quan CK sân bay quốc tế Tân Sơn Nhất", unverified: true },
  { code: "18A1", label: "Hải quan Bắc Ninh", unverified: true },
  { code: "18ID", label: "Hải quan cảng nội địa Tiên Sơn (Bắc Ninh)", unverified: true },
  { code: "18B1", label: "Hải quan Bắc Giang", unverified: true },
  { code: "31BB", label: "Hải quan Hà Nam", unverified: true },
  { code: "34CE", label: "Hải quan CK cảng Đà Nẵng", unverified: true },
  { code: "34AB", label: "Hải quan CK sân bay quốc tế Đà Nẵng", unverified: true },
  { code: "15BB", label: "Hải quan CK Hữu Nghị (Lạng Sơn)", unverified: true },
  { code: "15SI", label: "Hải quan ga đường sắt quốc tế Đồng Đăng (Lạng Sơn)", unverified: true },
  { code: "20BC", label: "Hải quan CK quốc tế Móng Cái (Quảng Ninh)", unverified: true },
  { code: "43IH", label: "Hải quan Sóng Thần (Bình Dương)", unverified: true },
  { code: "51CB", label: "Hải quan CK cảng Cái Mép (Bà Rịa – Vũng Tàu)", unverified: true },
];

/** Mã loại hình nhập khẩu (VN_A_ICB) – đủ 24 mã theo QĐ 1357/QĐ-TCHQ (danh mục đầy đủ kèm hướng dẫn: code-lists TYPE_CODE). */
export const TYPE_CODES_NK: CodeEntry[] = [
  { code: "A11", label: "Nhập kinh doanh tiêu dùng" },
  { code: "A12", label: "Nhập kinh doanh sản xuất" },
  { code: "A21", label: "Chuyển tiêu thụ nội địa từ nguồn tạm nhập" },
  { code: "A31", label: "Nhập khẩu hàng hóa đã xuất khẩu" },
  { code: "A41", label: "Nhập kinh doanh của doanh nghiệp thực hiện quyền nhập khẩu" },
  { code: "A42", label: "Thay đổi mục đích sử dụng hoặc chuyển tiêu thụ nội địa từ các loại hình khác, trừ tạm nhập" },
  { code: "A43", label: "Nhập khẩu hàng hóa thuộc Chương trình ưu đãi thuế" },
  { code: "A44", label: "Tạm nhập hàng hóa bán tại cửa hàng miễn thuế" },
  { code: "E11", label: "Nhập nguyên liệu của DNCX từ nước ngoài" },
  { code: "E13", label: "Nhập hàng hóa khác vào DNCX" },
  { code: "E15", label: "Nhập nguyên liệu, vật tư của DNCX từ nội địa" },
  { code: "E21", label: "Nhập nguyên liệu, vật tư để gia công cho thương nhân nước ngoài" },
  { code: "E23", label: "Nhập nguyên liệu, vật tư gia công từ hợp đồng khác chuyển sang" },
  { code: "E31", label: "Nhập nguyên liệu sản xuất xuất khẩu" },
  { code: "E33", label: "Nhập nguyên liệu, vật tư vào kho bảo thuế" },
  { code: "E41", label: "Nhập sản phẩm thuê gia công ở nước ngoài" },
  { code: "G11", label: "Tạm nhập hàng kinh doanh tạm nhập tái xuất" },
  { code: "G12", label: "Tạm nhập máy móc, thiết bị phục vụ dự án có thời hạn" },
  { code: "G13", label: "Tạm nhập miễn thuế" },
  { code: "G14", label: "Tạm nhập khác" },
  { code: "G51", label: "Tái nhập hàng hóa đã tạm xuất" },
  { code: "C11", label: "Hàng nước ngoài gửi kho ngoại quan" },
  { code: "C21", label: "Hàng đưa vào khu phi thuế quan" },
  { code: "H11", label: "Hàng nhập khẩu khác" },
];

/** Mã loại hình xuất khẩu (VN_A_ECB) – đủ 16 mã theo QĐ 1357/QĐ-TCHQ (danh mục đầy đủ kèm hướng dẫn: code-lists TYPE_CODE). */
export const TYPE_CODES_XK: CodeEntry[] = [
  { code: "B11", label: "Xuất kinh doanh" },
  { code: "B12", label: "Xuất sau khi đã tạm xuất" },
  { code: "B13", label: "Xuất khẩu hàng đã nhập khẩu" },
  { code: "E42", label: "Xuất khẩu sản phẩm của DNCX" },
  { code: "E52", label: "Xuất sản phẩm gia công cho thương nhân nước ngoài" },
  { code: "E54", label: "Xuất nguyên liệu gia công từ hợp đồng này sang hợp đồng khác" },
  { code: "E62", label: "Xuất sản phẩm sản xuất xuất khẩu" },
  { code: "E82", label: "Xuất nguyên liệu, vật tư thuê gia công ở nước ngoài" },
  { code: "G21", label: "Tái xuất hàng kinh doanh tạm nhập tái xuất" },
  { code: "G22", label: "Tái xuất máy móc, thiết bị đã tạm nhập để phục vụ dự án có thời hạn" },
  { code: "G23", label: "Tái xuất hàng tạm nhập miễn thuế" },
  { code: "G24", label: "Tái xuất khác" },
  { code: "G61", label: "Tạm xuất hàng hóa" },
  { code: "C12", label: "Hàng hóa từ kho ngoại quan xuất đi nước ngoài" },
  { code: "C22", label: "Hàng đưa ra khu phi thuế quan" },
  { code: "H21", label: "Xuất khẩu hàng khác" },
];

/** Chỉ tiêu 1.5 / 2.5 – Mã phân loại hàng hóa (TT39 Mẫu 01, Mẫu 02). Chỉ dùng "J" khi Chính phủ có văn bản riêng. */
export const CARGO_CLASSES: CodeEntry[] = [
  { code: "A", label: "Hàng quà biếu, quà tặng" },
  { code: "B", label: "Hàng an ninh, quốc phòng" },
  { code: "C", label: "Hàng cứu trợ khẩn cấp" },
  { code: "D", label: "Hàng phòng chống thiên tai, dịch bệnh" },
  { code: "E", label: "Hàng viện trợ nhân đạo, viện trợ không hoàn lại" },
  { code: "F", label: "Hàng bưu chính, chuyển phát nhanh" },
  { code: "G", label: "Hàng tài sản di chuyển" },
  { code: "H", label: "Hàng hóa được sử dụng cho PTVT xuất, nhập cảnh" },
  { code: "I", label: "Hàng ngoại giao" },
  { code: "J", label: "Hàng khác theo quy định của Chính phủ" },
  { code: "K", label: "Hàng bảo quản đặc biệt" },
];

/** Chỉ tiêu 1.7 – Phân loại cá nhân/tổ chức (TT39 Mẫu 01). */
export const PARTY_CLASSES: CodeEntry[] = [
  { code: "1", label: "Cá nhân gửi cá nhân" },
  { code: "2", label: "Tổ chức/công ty gửi cá nhân" },
  { code: "3", label: "Cá nhân gửi tổ chức/công ty" },
  { code: "4", label: "Tổ chức/công ty gửi tổ chức/công ty" },
  { code: "5", label: "Khác" },
];

/**
 * Chỉ tiêu 1.45 – Mã phân loại khai trị giá (TT39 Mẫu 01). Mã "0", "5", "Z" (tờ khai trị giá tổng hợp) chưa áp dụng nên
 * không có trong bảng. Nhiều phương pháp trong một lô: khai mã áp dụng nhiều nhất; "6", "7" chỉ khi đủ điều kiện trị giá giao dịch.
 */
export const VALUATION_METHODS: CodeEntry[] = [
  { code: "1", label: "Trị giá giao dịch của hàng hóa giống hệt" },
  { code: "2", label: "Trị giá giao dịch của hàng hóa tương tự" },
  { code: "3", label: "Phương pháp khấu trừ" },
  { code: "4", label: "Phương pháp tính toán" },
  { code: "6", label: "Phương pháp trị giá giao dịch" },
  { code: "7", label: "Trị giá giao dịch, có quan hệ đặc biệt nhưng không ảnh hưởng tới trị giá giao dịch" },
  { code: "8", label: "Trị giá giao dịch, phân bổ khoản điều chỉnh thủ công vào trị giá tính thuế từng dòng hàng" },
  { code: "9", label: "Phương pháp suy luận" },
  { code: "T", label: "Trường hợp đặc biệt (Điều 17 TT39/2015, hàng NK để gia công cho thương nhân nước ngoài)" },
];

/** Chỉ tiêu 1.47 ô 1 – Mã phân loại phí vận chuyển (TT39 Mẫu 01). */
export const FREIGHT_CLASSES: CodeEntry[] = [
  { code: "A", label: "Chứng từ vận tải ghi tổng cước phí chung cho tất cả hàng hóa trên chứng từ" },
  { code: "B", label: "Có cả hàng trả tiền và hàng FOC, tách riêng cước của hàng trả tiền (chỉ khai cước hàng trả tiền)" },
  { code: "C", label: "Tờ khai chỉ nhập khẩu một phần hàng hóa của lô hàng trên chứng từ vận tải" },
  { code: "D", label: "Phân bổ cước theo tỷ lệ trọng lượng, dung tích (phải khai tờ khai trị giá)" },
  { code: "E", label: "Giá hóa đơn đã có cước (CIF, C&F, CIP) nhưng cước thực tế vượt cước trên hóa đơn – khai số chênh lệch" },
  { code: "F", label: "Có cước vượt cước và chỉ nhập khẩu một phần hàng hóa của lô hàng" },
];

/** Chỉ tiêu 1.48 ô 1 – Mã phân loại bảo hiểm (TT39 Mẫu 01). Mã "B" bảo hiểm tổng hợp chưa áp dụng nên không có trong bảng. */
export const INSURANCE_CLASSES: CodeEntry[] = [
  { code: "A", label: "Bảo hiểm riêng" },
  { code: "D", label: "Không bảo hiểm" },
];

/** Mã tên khoản điều chỉnh kèm chiều điều chỉnh: AD cộng thêm, SB trừ đi; không có `kind` khi văn bản không quy định (mã N). */
export interface AdjustmentCodeEntry extends CodeEntry {
  kind?: "AD" | "SB";
}

/**
 * Chỉ tiêu 1.49 ô 1 – Mã tên khoản điều chỉnh (TT39 Mẫu 01). Giảm giá theo số lượng không khai "G", mà ghi rõ tại 1.50.
 */
export const ADJUSTMENT_CODES: AdjustmentCodeEntry[] = [
  { code: "A", label: "Phí hoa hồng bán hàng, phí môi giới", kind: "AD" },
  { code: "B", label: "Chi phí bao bì được coi là đồng nhất với hàng hóa nhập khẩu", kind: "AD" },
  { code: "C", label: "Chi phí đóng gói hàng hóa", kind: "AD" },
  { code: "D", label: "Khoản trợ giúp", kind: "AD" },
  { code: "E", label: "Phí bản quyền, phí giấy phép", kind: "AD" },
  { code: "P", label: "Khoản tiền người NK phải trả từ số tiền thu được sau khi bán lại, định đoạt, sử dụng hàng NK", kind: "AD" },
  { code: "Q", label: "Khoản người mua phải thanh toán chưa tính vào giá hóa đơn: trả trước, ứng trước, đặt cọc", kind: "AD" },
  { code: "K", label: "Khoản người mua thanh toán cho người thứ ba theo yêu cầu của người bán", kind: "AD" },
  { code: "M", label: "Khoản tiền được thanh toán bằng cách bù trừ nợ", kind: "AD" },
  { code: "U", label: "Chi phí hoạt động phát sinh sau nhập khẩu: xây dựng, lắp đặt, bảo dưỡng, trợ giúp/tư vấn kỹ thuật, giám sát…", kind: "SB" },
  { code: "V", label: "Phí vận tải phát sinh sau khi hàng đến cửa khẩu nhập đầu tiên", kind: "SB" },
  { code: "H", label: "Phí bảo hiểm phát sinh sau khi hàng đến cửa khẩu nhập đầu tiên", kind: "SB" },
  { code: "T", label: "Thuế, phí, lệ phí phải nộp ở Việt Nam đã nằm trong giá mua", kind: "SB" },
  { code: "G", label: "Khoản giảm giá", kind: "SB" },
  { code: "S", label: "Chi phí người mua chịu liên quan đến tiếp thị hàng hóa nhập khẩu", kind: "SB" },
  { code: "L", label: "Tiền lãi theo thỏa thuận tài chính của người mua liên quan đến việc mua hàng NK", kind: "SB" },
  { code: "N", label: "Khác" },
];

/** Chỉ tiêu 1.49 ô 2 – Mã phân loại điều chỉnh trị giá (TT39 Mẫu 01). */
export const ADJUSTMENT_KINDS: CodeEntry[] = [
  { code: "AD", label: "Cộng thêm số tiền điều chỉnh" },
  { code: "SB", label: "Trừ đi số tiền điều chỉnh" },
  { code: "IP", label: "Trị giá tính thuế là trị giá hóa đơn" },
  { code: "DP", label: "Nhập tổng trị giá tính thuế tính bằng tay" },
];

/** Chỉ tiêu 1.52 / 2.43 – Người nộp thuế (TT39 Mẫu 01, Mẫu 02; Mẫu 02 cũng ghi "người nhập khẩu" cho mã 1). */
export const TAX_PAYERS: CodeEntry[] = [
  { code: "1", label: "Người nộp thuế là người xuất khẩu/nhập khẩu" },
  { code: "2", label: "Người nộp thuế là đại lý hải quan" },
];

/** Chỉ tiêu 1.53 – Mã lý do đề nghị giải phóng hàng trên cơ sở bảo lãnh (TT39 Mẫu 01). */
export const BP_REASONS: CodeEntry[] = [
  { code: "A", label: "Chờ xác định mã số hàng hóa" },
  { code: "B", label: "Chờ xác định trị giá tính thuế" },
  { code: "C", label: "Trường hợp khác" },
];

/** Chỉ tiêu 1.28 / 2.26 ô 2 – Đơn vị tính trọng lượng Gross (danh mục VNACCS 29.DM_GANCODE, sheet DM_DVT_GROSS). */
export const GROSS_UNITS: CodeEntry[] = [
  { code: "KGM", label: "Kilogram" },
  { code: "TNE", label: "Tấn" },
  { code: "LBR", label: "Pound" },
];

/** Chỉ tiêu 1.36 – Mã kết quả kiểm tra nội dung khi xem hàng trước khai (danh mục VNACCS 29.DM_GANCODE, sheet DM_MA_PLKT). */
export const INSPECTION_RESULTS: CodeEntry[] = [
  { code: "A", label: "Không có bất thường" },
  { code: "B", label: "Có bất thường" },
  { code: "C", label: "Cần tham vấn ý kiến cơ quan Hải quan" },
];

/** Chỉ tiêu 1.58 / 2.48 – Mã xác định thời hạn nộp thuế (TT39 Mẫu 01, Mẫu 02). */
export const DUE_DATE_CODES: CodeEntry[] = [
  { code: "A", label: "Áp dụng thời hạn nộp thuế do sử dụng bảo lãnh riêng" },
  { code: "B", label: "Áp dụng thời hạn nộp thuế do sử dụng bảo lãnh chung" },
  { code: "C", label: "Áp dụng thời hạn nộp thuế không sử dụng bảo lãnh" },
  { code: "D", label: "Nộp thuế ngay (cả khi khai bổ sung để thông quan sau tạm giải phóng hàng)" },
];

/** Khai bổ sung sau thông quan (AMA) – Mã lý do khai bổ sung (TK_REC), theo hướng dẫn nhập của phần mềm khai báo. */
export const AMA_REASONS: CodeEntry[] = [
  { code: "1", label: "Sai sót về tính thuế" },
  { code: "2", label: "Sai sót về trị giá hải quan" },
  { code: "3", label: "Sai sót về thuế suất" },
  { code: "4", label: "Sai sót về mã HS" },
  { code: "5", label: "Sai sót về số lượng" },
  { code: "6", label: "Các lý do khác" },
];

/**
 * Chỉ tiêu 1.80 – Mã Biểu thuế nhập khẩu theo danh sách TT39 Mẫu 01. TT121 thay danh sách này bằng "Bảng mã Biểu thuế
 * nhập khẩu" trên website Cục Hải quan, nên mã của các FTA mới (EVFTA, CPTPP, RCEP, UKVFTA, VKFTA…) KHÔNG có trong văn bản
 * nguồn – không thêm theo trí nhớ; phải đồng bộ từ bảng mã của Cục Hải quan.
 */
export const TAX_TABLES: CodeEntry[] = [
  { code: "B01", label: "Biểu thuế nhập khẩu ưu đãi (thuế suất MFN)" },
  { code: "B02", label: "Chương 98 (1) Biểu thuế nhập khẩu ưu đãi" },
  { code: "B03", label: "Biểu thuế nhập khẩu thông thường (150% thuế suất MFN)" },
  { code: "B04", label: "Ưu đãi đặc biệt ATIGA (ASEAN)" },
  { code: "B05", label: "Ưu đãi đặc biệt ACFTA (ASEAN – Trung Quốc)" },
  { code: "B06", label: "Ưu đãi đặc biệt AKFTA (ASEAN – Hàn Quốc)" },
  { code: "B07", label: "Ưu đãi đặc biệt AANZFTA (ASEAN – Úc – Niu Di-lân)" },
  { code: "B08", label: "Ưu đãi đặc biệt AIFTA (ASEAN – Ấn Độ)" },
  { code: "B09", label: "Ưu đãi đặc biệt AJCEP (ASEAN – Nhật Bản)" },
  { code: "B10", label: "Ưu đãi đặc biệt VJEPA (Việt Nam – Nhật Bản)" },
  { code: "B11", label: "Ưu đãi thuế suất nhập khẩu Việt – Lào" },
  { code: "B12", label: "Hàng hóa có xuất xứ Campuchia" },
  { code: "B13", label: "Ưu đãi đặc biệt VCFTA (Việt Nam – Chi Lê)" },
  { code: "B14", label: "Biểu thuế nhập khẩu ngoài hạn ngạch" },
  { code: "B15", label: "Biểu thuế nhập khẩu tuyệt đối" },
  { code: "B16", label: "Biểu thuế nhập khẩu hỗn hợp" },
  { code: "B17", label: "Chương 98 (2) Biểu thuế nhập khẩu ưu đãi" },
  { code: "B30", label: "Đối tượng không chịu thuế nhập khẩu (thuế suất 0)" },
];

/** Chỉ tiêu 1.37 ô 1 – hàng chương 84, 85 trên tờ khai nhập khẩu (CV 2061/TCHQ-GSQL, từ 01/4/2020; sai thì hệ thống từ chối). */
export const MACHINERY_CONDITION_CODES: CodeEntry[] = [
  { code: "MO", label: "Máy móc, thiết bị chưa qua sử dụng" },
  { code: "CU", label: "Máy móc, thiết bị đã qua sử dụng" },
];

/**
 * 1.63 / 2.53 ô 1 – Phân loại đính kèm khai báo điện tử (TK_EA1..3, tối đa 3 ký tự). Nguồn: VNACCS_IDA v1.2.xlsx, cột Category
 * của TK_EA (INV, BOL, AWB, INS, CON, ALL, ETC); DM theo phần mềm FPT.VNACCS. Tên theo phần mềm FPT.
 * Khác A546 (A01…A99) – A546 là phân loại THỦ TỤC của bản khai HYS (TK_TSB), không điền vào 1.63/2.53.
 */
export const ATTACH_KIND_CODES = ["INV", "BOL", "AWB", "INS", "CON", "DM", "ALL", "ETC"] as const;
export type AttachKind = (typeof ATTACH_KIND_CODES)[number];
export const ATTACH_KINDS: CodeEntry[] = [
  { code: "INV", label: "Hóa đơn" },
  { code: "BOL", label: "B/L" },
  { code: "AWB", label: "AWB" },
  { code: "INS", label: "Bảo hiểm" },
  { code: "CON", label: "Hợp đồng" },
  { code: "DM", label: "Định mức nguyên vật liệu" },
  { code: "ALL", label: "Tất cả hồ sơ" },
  { code: "ETC", label: "Loại khác" },
];

/**
 * Tra bảng mã theo tên `codeTable` trong catalog. Bảng chỉ có trên danh mục VNACCS (A014, A016, A202, A519, A520, A528,
 * A546…) chưa có dữ liệu trong repo – nằm ở VNACCS_SYNCED_CODE_TABLES, không có trong map này.
 */
export const CODE_TABLES: Readonly<Partial<Record<CodeTable, readonly CodeEntry[]>>> = {
  A038: CUSTOMS_OFFICES,
  A501: UNITS,
  A527: CURRENCIES,
  CURRENCY: CURRENCIES,
  COUNTRY: COUNTRIES,
  UNIT: UNITS,
  PACKAGE_KIND: PACKAGE_UNITS,
  PAYMENT: PAYMENT_METHODS,
  INCOTERM: INCOTERMS,
  TRANSPORT_MODE: TRANSPORT_MODES,
  INVOICE_KIND: INVOICE_KINDS,
  PRICE_KIND: PRICE_KINDS,
  TYPE_CODE: [...TYPE_CODES_NK, ...TYPE_CODES_XK],
  TAX_TABLE: TAX_TABLES,
  CARGO_CLASS: CARGO_CLASSES,
  PARTY_CLASS: PARTY_CLASSES,
  VALUATION_METHOD: VALUATION_METHODS,
  FREIGHT_CLASS: FREIGHT_CLASSES,
  INSURANCE_CLASS: INSURANCE_CLASSES,
  ADJUSTMENT_CODE: ADJUSTMENT_CODES,
  ADJUSTMENT_KIND: ADJUSTMENT_KINDS,
  TAX_PAYER: TAX_PAYERS,
  BP_REASON: BP_REASONS,
  DUE_DATE: DUE_DATE_CODES,
  AMA_REASON: AMA_REASONS,
  GROSS_UNIT: GROSS_UNITS,
  INSPECTION_RESULT: INSPECTION_RESULTS,
  ATTACH_KIND: ATTACH_KINDS,
};

/**
 * Bảng mã chỉ có trên danh mục VNACCS/website Cục Hải quan, cần đồng bộ (FPT SyncCategory) – không có trong bảng mã gọn ở đây.
 * Bản danh mục đầy đủ (thư mục 02_DANHMUC_VNACCS) đã có ở code-lists/ cho tra cứu trên tờ khai (trừ A601, A620, LAW_CODE).
 */
export const VNACCS_SYNCED_CODE_TABLES: readonly CodeTable[] = [
  "A014", "A016", "A202", "A519", "A520", "A528", "A546", "A601", "A620", "LAW_CODE", "BANK", "OTHER_TAX", "ABS_TAX",
  "IMPORT_TAX_RATE_KIND", "TAX_KIND",
];

/** Bảng mã theo tên; `undefined` khi bảng phải đồng bộ từ VNACCS (VNACCS_SYNCED_CODE_TABLES). */
export function codeTableEntries(name: CodeTable): readonly CodeEntry[] | undefined {
  return CODE_TABLES[name];
}
