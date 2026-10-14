/**
 * Danh mục mã nhỏ dùng khi khai tờ khai IDA/EDA.
 * Nguồn: Phụ lục II TT39/2018 (sửa đổi TT121/2025) cho các bảng mã ghi ngay trong hướng dẫn chỉ tiêu.
 * "DANH MUC CHUAN VNACCS.xlsx" (FPT) chỉ mô tả cấu trúc bảng (API SyncCategory), không chứa dữ liệu,
 * nên các mã không có trong tài liệu được đánh dấu `unverified: true` – cần đồng bộ lại từ danh mục VNACCS.
 */
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

/** Chỉ tiêu 1.44 ô 1 / 2.39 ô 4 – Mã phân loại giá hóa đơn. */
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
 * Incoterms 2020. Ô điều kiện giá trên VNACCS còn chấp nhận mã cũ: C&F (CNF), DAT, C&I, DAF, DDU, DES, DEQ
 * (Phụ lục II); TT121 bổ sung DPU cho 1.44.
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
];

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

/** Mã loại kiện cho ô 2 chỉ tiêu 1.27 / 2.25 (UN/ECE Rec 21; ví dụ CS, BX ghi trong Phụ lục II). */
export const PACKAGE_UNITS: CodeEntry[] = [
  { code: "CS", label: "Thùng (case)" },
  { code: "BX", label: "Hộp" },
  { code: "PK", label: "Kiện (package)" },
  { code: "CT", label: "Thùng carton", unverified: true },
  { code: "BG", label: "Bao/túi", unverified: true },
  { code: "PX", label: "Pallet", unverified: true },
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

/** Mã loại hình nhập khẩu (VN_A_ICB) hay gặp. Không có bảng mã trong business/ – đồng bộ lại từ danh mục VNACCS. */
export const TYPE_CODES_NK: CodeEntry[] = [
  { code: "A11", label: "Nhập kinh doanh tiêu dùng", unverified: true },
  { code: "A12", label: "Nhập kinh doanh sản xuất", unverified: true },
  { code: "A21", label: "Chuyển tiêu thụ nội địa từ nguồn tạm nhập", unverified: true },
  { code: "A31", label: "Nhập khẩu hàng xuất khẩu bị trả lại", unverified: true },
  { code: "A41", label: "Nhập kinh doanh của doanh nghiệp thực hiện quyền nhập khẩu", unverified: true },
  { code: "A42", label: "Chuyển tiêu thụ nội địa khác", unverified: true },
  { code: "E11", label: "Nhập nguyên liệu của doanh nghiệp chế xuất từ nước ngoài", unverified: true },
  { code: "E21", label: "Nhập nguyên liệu, vật tư để gia công cho thương nhân nước ngoài", unverified: true },
  { code: "E31", label: "Nhập nguyên liệu sản xuất xuất khẩu", unverified: true },
  { code: "G11", label: "Tạm nhập hàng kinh doanh tạm nhập tái xuất", unverified: true },
  { code: "G12", label: "Tạm nhập máy móc, thiết bị phục vụ dự án có thời hạn", unverified: true },
  { code: "G13", label: "Tạm nhập miễn thuế", unverified: true },
  { code: "G51", label: "Tái nhập hàng hóa đã tạm xuất", unverified: true },
  { code: "H11", label: "Hàng nhập khẩu khác", unverified: true },
];

/** Mã loại hình xuất khẩu (VN_A_ECB) hay gặp. Không có bảng mã trong business/ – đồng bộ lại từ danh mục VNACCS. */
export const TYPE_CODES_XK: CodeEntry[] = [
  { code: "B11", label: "Xuất kinh doanh, xuất khẩu của doanh nghiệp đầu tư", unverified: true },
  { code: "B12", label: "Xuất sau khi đã tạm xuất", unverified: true },
  { code: "B13", label: "Xuất trả hàng đã nhập khẩu", unverified: true },
  { code: "E42", label: "Xuất khẩu sản phẩm của doanh nghiệp chế xuất", unverified: true },
  { code: "E52", label: "Xuất sản phẩm gia công cho thương nhân nước ngoài", unverified: true },
  { code: "E62", label: "Xuất sản phẩm sản xuất xuất khẩu", unverified: true },
  { code: "G21", label: "Tái xuất hàng kinh doanh tạm nhập tái xuất", unverified: true },
  { code: "G22", label: "Tái xuất máy móc, thiết bị đã tạm nhập phục vụ dự án có thời hạn", unverified: true },
  { code: "G23", label: "Tái xuất miễn thuế hàng tạm nhập", unverified: true },
  { code: "G61", label: "Tạm xuất hàng hóa", unverified: true },
  { code: "H21", label: "Xuất khẩu hàng khác", unverified: true },
];
