import { fieldBuilder, type DeclarationFieldDef } from "./catalog-types.js";

/**
 * Mẫu số 02 – Tờ khai điện tử đối với hàng hóa xuất khẩu (VNACCS EDA), Phụ lục II TT38/2015 sửa đổi TT39/2018, cập nhật TT121/2025.
 * maxLen/required theo "1013-2 EDA Input Data Element"; tên trường FPT theo "VNACCS_EDA v1.2" (VN_EDA, VN_EDA_HANG, VN_EDA_CON).
 * Quy ước required giống catalog-ida.ts. Tờ khai xuất khẩu không có chỉ tiêu riêng cho nước xuất xứ, phí vận chuyển,
 * phí bảo hiểm, khoản điều chỉnh, mã biểu thuế: xuất xứ khai trong 2.69 "Mô tả hàng hóa" (mô tả#&mã nước).
 */
const f = fieldBuilder("02");

export const CATALOG_EDA: DeclarationFieldDef[] = [
  // ── A. Thông tin chung ─────────────────────────────────────────────
  f("2.1", "GENERAL", "Số tờ khai", "text", "F", {
    maxLen: 12, fptField: "VN_EDA.TK_ECN",
    legalNote: "Không nhập, hệ thống tự cấp. 11 ký tự đầu là số tờ khai, ký tự thứ 12 là số lần khai bổ sung.",
  }),
  f("2.2", "GENERAL", "Số tờ khai đầu tiên", "text", "C", {
    maxLen: 12, fptField: "VN_EDA.TK_FIC", manual: true,
    legalNote: "Chỉ khai khi lô hàng > 50 dòng hoặc phải tách tờ khai: ô 1 tờ đầu nhập \"F\", tờ sau nhập số tờ khai đầu tiên; ô 2 số thứ tự (TK_BNO); ô 3 tổng số tờ khai (TK_DNO).",
  }),
  f("2.3", "GENERAL", "Số tờ khai tạm nhập tái xuất tương ứng", "text", "C", {
    maxLen: 12, fptField: "VN_EDA.TK_TDN", manual: true,
    legalNote: "Tái xuất hàng tạm nhập: số tờ khai tạm nhập; xuất khẩu lô hàng tạm xuất: số tờ khai tạm xuất. Cùng người mở tờ khai, tờ khai ban đầu còn hiệu lực.",
  }),
  f("2.4", "GENERAL", "Mã loại hình", "code", "M", {
    maxLen: 3, codeTable: "TYPE_CODE", fptField: "VN_EDA.TK_ECB",
    legalNote: "Căn cứ hồ sơ, mục đích xuất khẩu để chọn mã loại hình theo bảng mã của TCHQ (ví dụ B11, E52, E62, G21).",
  }),
  f("2.5", "GENERAL", "Mã phân loại hàng hóa", "code", "C", {
    maxLen: 1, codeTable: "CARGO_CLASS", fptField: "VN_EDA.TK_CCC",
    legalNote: "Chỉ bắt buộc với hàng đặc thù: A quà biếu, B an ninh quốc phòng, C cứu trợ, D phòng chống thiên tai/dịch bệnh, E viện trợ, F bưu chính/CPN, G tài sản di chuyển, H PTVT XNC, I ngoại giao, J khác theo CP, K bảo quản đặc biệt.",
  }),
  f("2.6", "GENERAL", "Mã hiệu phương thức vận chuyển", "code", "M", {
    maxLen: 1, codeTable: "TRANSPORT_MODE", fptField: "VN_EDA.TK_MTC",
    legalNote: "1 hàng không, 2 biển (container), 3 biển (hàng rời, lỏng), 4 bộ, 5 sắt, 6 sông, 9 khác: ống, cáp…, XK tại chỗ, hàng từ kho ngoại quan vào khu phi thuế quan. Hàng vào kho CFS đóng chung container XK đường biển: \"3\". Hàng mang theo người xuất cảnh: hàng không \"1\", đường biển \"3\".",
  }),
  f("2.7", "GENERAL", "Thời hạn tái nhập khẩu", "date", "C", {
    fptField: "VN_EDA.TK_RID", manual: true,
    legalNote: "Chỉ khai với loại hình tạm xuất: ngày hết hạn tạm xuất.",
  }),
  f("2.8", "GENERAL", "Cơ quan Hải quan", "code", "O", {
    assist: true,
    maxLen: 6, codeTable: "A038", fptField: "VN_EDA.TK_CH",
    legalNote: "Mã Chi cục HQ nơi đăng ký tờ khai. Không nhập thì hệ thống tự xác định theo địa điểm lưu giữ hàng chờ thông quan.",
  }),
  f("2.9", "GENERAL", "Mã bộ phận xử lý tờ khai", "code", "O", {
    assist: true,
    maxLen: 2, codeTable: "A014", fptField: "VN_EDA.TK_CHB",
    legalNote: "Mã Đội thủ tục xử lý tờ khai. Không nhập thì hệ thống tự xác định dựa trên mã HS.",
  }),
  f("2.10", "GENERAL", "Ngày khai báo (dự kiến)", "date", "O", {
    assist: true,
    fptField: "VN_EDA.TK_ECD",
    legalNote: "Ngày dự kiến thực hiện nghiệp vụ EDC; không nhập thì hệ thống lấy ngày thực hiện nghiệp vụ.",
  }),

  // ── Người xuất khẩu / ủy thác / nhập khẩu / đại lý ─────────────────
  f("2.11", "PARTIES", "Mã người xuất khẩu", "text", "M", {
    maxLen: 13, fptField: "VN_EDA.TK_EPC", amendedBy121: true,
    legalNote: "MST người xuất khẩu (hệ thống tự xuất nếu người XK thực hiện EDA). Kho ngoại quan: mã chủ kho/đại lý. XK tại chỗ: MST người xuất khẩu tại chỗ (TT121).",
  }),
  f("2.12", "PARTIES", "Tên người xuất khẩu", "text", "M", {
    maxLen: 100, fptField: "VN_EDA.TK_EPN", amendedBy121: true,
    legalNote: "Tên người xuất khẩu; hệ thống tự xuất nếu đã có mã. XK tại chỗ: tên người XK tại chỗ/người nước ngoài chỉ định giao hàng tại VN (TT121).",
  }),
  f("2.13", "PARTIES", "Mã bưu chính", "text", "O", {
    maxLen: 7, fptField: "VN_EDA.TK_EPP",
    legalNote: "Mã bưu chính của người xuất khẩu (nếu có).",
  }),
  f("2.14", "PARTIES", "Địa chỉ người xuất khẩu", "text", "O", {
    assist: true,
    maxLen: 100, fptField: "VN_EDA.TK_EPA",
    legalNote: "Không cần nhập nếu hệ thống tự hiển thị; nhập lại nếu hệ thống hiển thị sai.",
  }),
  f("2.15", "PARTIES", "Số điện thoại người xuất khẩu", "text", "O", {
    assist: true,
    maxLen: 20, fptField: "VN_EDA.TK_EPT",
    legalNote: "Không dùng dấu gạch ngang; không cần nhập nếu hệ thống tự hiển thị đúng.",
  }),
  f("2.16", "PARTIES", "Mã người ủy thác xuất khẩu", "text", "C", {
    maxLen: 13, fptField: "VN_EDA.TK_EXC",
    legalNote: "MST người ủy thác xuất khẩu (khi xuất khẩu ủy thác).",
  }),
  f("2.17", "PARTIES", "Tên người ủy thác xuất khẩu", "text", "C", {
    maxLen: 100, fptField: "VN_EDA.TK_EXN",
    legalNote: "Tên người ủy thác xuất khẩu.",
  }),
  f("2.18", "PARTIES", "Mã người nhập khẩu", "text", "O", {
    maxLen: 13, fptField: "VN_EDA.TK_CGC", amendedBy121: true,
    legalNote: "Mã người nhập khẩu (nếu có). XK tại chỗ: MST người được chỉ định nhận hàng tại VN (TT121).",
  }),
  f("2.19", "PARTIES", "Tên người nhập khẩu", "text", "M", {
    maxLen: 70, fptField: "VN_EDA.TK_CGN", amendedBy121: true,
    legalNote: "Tên người mua theo hợp đồng (kể cả qua bên thứ ba); gửi kho ngoại quan: tên chủ hàng nước ngoài; XK tại chỗ: người được chỉ định nhận hàng tại VN, tên, địa chỉ người nước ngoài chỉ định ghi ở Phần ghi chú 2.57; gia công: bên đặt gia công/người được chỉ định nhận hàng. Chấp nhận tên viết tắt (TT121).",
  }),
  f("2.20", "PARTIES", "Mã bưu chính người nhập khẩu", "text", "O", {
    maxLen: 9, fptField: "VN_EDA.TK_CGP",
    legalNote: "Mã bưu chính của người nhập khẩu (nếu có).",
  }),
  f("2.21", "PARTIES", "Địa chỉ", "text", "C", {
    maxLen: 35, fptField: "VN_EDA.TK_CGA",
    legalNote: "Địa chỉ người nhập khẩu, 4 ô × 35 ký tự: ô 1–2 đường, số nhà/P.O.BOX (TK_CGA, TK_CAT); ô 3 thành phố (TK_CAC); ô 4 tên nước (TK_CAS).",
  }),
  f("2.22", "PARTIES", "Mã nước", "code", "C", {
    maxLen: 2, codeTable: "COUNTRY", fptField: "VN_EDA.TK_CGK",
    legalNote: "Mã nước nhận hàng, 2 ký tự UN/LOCODE: vận chuyển thẳng hoặc qua nước trung gian không có mua bán, gia công, chế biến, thông quan → nước nhập khẩu; có các hoạt động đó → nước trung gian đầu tiên sau khi rời VN biết được khi khai; không xác định được → mã nước của người nhập khẩu.",
  }),
  f("2.23", "PARTIES", "Mã đại lý Hải quan", "text", "O", {
    assist: true,
    maxLen: 5, fptField: "VN_EDA.TK_ECC", manual: true,
    legalNote: "Không nhập nếu đại lý thực hiện EDA và nghiệp vụ tiếp theo; nhập mã người sử dụng khi người khai EDA khác người khai EDC.",
  }),

  // ── Vận tải ─────────────────────────────────────────────────────────
  f("2.24", "TRANSPORT", "Số vận đơn (Số B/L, số AWB v.v....)", "text", "C", {
    maxLen: 35, fptField: "VN_EDA.TK_EKN",
    legalNote: "Khai số quản lý hàng hóa do hệ thống cấp sau khi thông báo hàng dự kiến đưa vào khu vực giám sát (mẫu số 14).",
  }),
  f("2.25", "TRANSPORT", "Số lượng", "int", "M", {
    maxLen: 8, codeTable: "PACKAGE_KIND", fptField: "VN_EDA.TK_NO",
    legalNote: "Số lượng kiện: ô 1 tổng số kiện, không thập phân, hàng không thể hiện bằng kiện, thùng nhập \"1\" (TK_NO); ô 2 mã loại kiện theo bảng \"Mã loại kiện\", ví dụ CS thùng, BX hộp; nhiều loại kiện thì nhập 1 mã đại diện (TK_NOT).",
  }),
  f("2.26", "TRANSPORT", "Tổng trọng lượng hàng (Gross)", "decimal", "M", {
    maxLen: 10, codeTable: "UNIT", fptField: "VN_EDA.TK_GW",
    legalNote: "Ô 1 tổng trọng lượng gross (TK_GW): đường không 8+1 số, vượt 1 số thập phân thì ghi trọng lượng chính xác ở Phần ghi chú 2.57; phương thức khác 6+3 số; ô 2 mã đơn vị KGM/TNE/LBR (TK_GWT), LBR tự quy đổi KGM.",
  }),
  f("2.27", "TRANSPORT", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", "code", "M", {
    maxLen: 7, codeTable: "A202", fptField: "VN_EDA.TK_ST",
    legalNote: "Mã địa điểm tập kết hàng XK đã mã hóa (kho DN, kho thuê, ICD…) hoặc của Chi cục (vd 47NBCNB). Chưa mã hóa: mã dùng chung của Chi cục (…OZZ, vd 47NBOZZ) và ghi địa điểm tập kết, thời gian dự kiến đóng container/xếp hàng ở ô Địa chỉ của 2.59.",
  }),
  f("2.28", "TRANSPORT", "Địa điểm nhận hàng cuối cùng", "code", "M", {
    maxLen: 5, codeTable: "A016", fptField: "VN_EDA.TK_DSC",
    legalNote: "Ô 1 mã UN/LOCODE (TK_DSC): không có trong bảng mã nhập \"ZZZ\"; không xác định được (UNKNOWN) thì không nhập; XK tại chỗ \"VNZZZ\"; từ khu phi thuế quan/nội địa vào kho ngoại quan \"ZZZZZ\". Ô 2 tên địa điểm (TK_DSN), bắt buộc khi địa điểm chưa mã hóa.",
  }),
  f("2.29", "TRANSPORT", "Địa điểm xếp hàng", "code", "C", {
    maxLen: 6, codeTable: "A016", fptField: "VN_EDA.TK_PSC",
    legalNote: "Ô 1 mã cảng/sân bay (biển, không), ga (sắt), cửa khẩu (bộ, sông) xếp hàng trong nước (TK_PSC), bắt buộc trừ PTVC mã 9; ô 2 tên (TK_PSN): XK tại chỗ, nội địa vào kho ngoại quan: tên kho công ty XK; khu phi thuế quan vào kho ngoại quan: tên khu.",
  }),
  f("2.30", "TRANSPORT", "Phương tiện vận chuyển dự kiến", "text", "C", {
    maxLen: 9, fptField: "VN_EDA.TK_VSC",
    legalNote: "Ô 1 hô hiệu tàu, chưa đăng ký nhập 9999 (TK_VSC); ô 2 tên phương tiện (TK_VSN): tên tàu; hàng không AB0001/01JAN, chưa có chuyến bay 000000/ngày; đường bộ số xe.",
  }),
  f("2.31", "TRANSPORT", "Ngày hàng đi dự kiến", "date", "M", {
    fptField: "VN_EDA.TK_SYM",
    legalNote: "Ngày hàng đi dự kiến.",
  }),
  f("2.32", "TRANSPORT", "Ký hiệu và số hiệu", "text", "O", {
    maxLen: 140, fptField: "VN_EDA.TK_MRK",
    legalNote: "Ký hiệu và số hiệu bao bì đóng gói (shipping marks).",
  }),

  // ── Giấy phép, hóa đơn, trị giá ────────────────────────────────────
  f("2.33", "VALUE", "Giấy phép xuất khẩu", "code", "C", {
    maxLen: 4, codeTable: "A528", fptField: "VN_EDA.TK_SS1", amendedBy121: true,
    legalNote: "Tối đa 5: ô 1 mã phân loại giấy phép/mã xác định trước/danh mục trừ lùi (TK_SS1..5); ô 2 số giấy phép, số văn bản KTCN, số tiếp nhận HĐ gia công, số văn bản xác định trước mã số (TK_SN1..5).",
  }),
  f("2.34", "VALUE", "Phân loại hình thức hóa đơn", "code", "M", {
    maxLen: 1, codeTable: "INVOICE_KIND", fptField: "VN_EDA.TK_IV1",
    legalNote: "A hóa đơn thương mại; B chứng từ tương đương/bảng kê hóa đơn/không có hóa đơn; D hóa đơn điện tử đăng ký trên VNACCS.",
  }),
  f("2.35", "VALUE", "Số tiếp nhận hóa đơn điện tử", "text", "C", {
    maxLen: 12, fptField: "VN_EDA.TK_IV2",
    legalNote: "Bắt buộc khi Phân loại hình thức hóa đơn là \"D\"; không nhập được với mã khác.",
  }),
  f("2.36", "VALUE", "Số hóa đơn", "text", "C", {
    maxLen: 35, fptField: "VN_EDA.TK_IV3",
    legalNote: "Số hóa đơn thương mại hoặc chứng từ tương đương/bảng kê 02/BKHĐ/GSQL. Không có hóa đơn thương mại thì không nhập.",
  }),
  f("2.37", "VALUE", "Ngày phát hành", "date", "C", {
    fptField: "VN_EDA.TK_IVD",
    legalNote: "Ngày phát hành hóa đơn thương mại (hoặc ngày lập chứng từ tương đương/bảng kê). Không có hóa đơn thương mại: nhập ngày thực hiện nghiệp vụ EDA.",
  }),
  f("2.38", "VALUE", "Phương thức thanh toán", "code", "C", {
    maxLen: 7, codeTable: "PAYMENT", fptField: "VN_EDA.TK_IVP",
    legalNote: "Cùng bộ mã với 1.43 (BIENMAU, DA, CAD, CANTRU, CASH, CHEQUE, DP, GV, H-D-H, H-T-N, HPH, KHONGTT, LC, LDDT, OA, TTR, KC). KC gồm cả thanh toán TT; hình thức khác/kết hợp: KC và ghi phương thức thực tế ở Phần ghi chú 2.57.",
  }),
  f("2.39", "VALUE", "Trị giá hóa đơn", "decimal", "M", {
    maxLen: 20, codeTable: "INCOTERM", fptField: "VN_EDA.TK_IP4",
    legalNote: "Ô 1 điều kiện giá, 17 mã, không có DPU (TK_IP2); mua bán với DNCX/khu phi thuế quan: DAP; ô 2 mã đồng tiền (TK_IP3); ô 3 tổng trị giá, VND không thập phân, ngoại tệ ≤ 4 số (TK_IP4); ô 4 mã phân loại giá A–D (TK_IP1), không có hóa đơn thì không khai ô 4.",
  }),
  f("2.40", "VALUE", "Trị giá tính thuế", "decimal", "C", {
    maxLen: 20, fptField: "VN_EDA.TK_FKK",
    legalNote: "Bắt buộc khi điều kiện giá khác FOB, DAP, DAF hoặc không có hóa đơn: ô 1 mã đồng tiền (TK_FCD), ô 2 tổng trị giá tính thuế (TK_FKK), VND không thập phân, ngoại tệ ≤ 4 số. Điều kiện giá FOB, DAP, DAF: không nhập.",
  }),
  f("2.41", "VALUE", "Phân loại không cần quy đổi VND", "code", "O", {
    maxLen: 1, fptField: "VN_EDA.TK_CNV",
    legalNote: "Nhập \"N\" nếu số tiền thuế và trị giá hải quan không cần quy đổi sang VND.",
  }),
  f("2.42", "VALUE", "Tổng hệ số phân bổ trị giá tính thuế", "decimal", "C", {
    assist: true,
    maxLen: 20, fptField: "VN_EDA.TK_TP",
    legalNote: "Tổng trị giá hóa đơn trước điều chỉnh; bắt buộc khi một hóa đơn nhiều tờ khai; không nhập thì hệ thống cộng trị giá các dòng hàng.",
  }),

  // ── Nộp thuế, hạn mức, bảo lãnh ─────────────────────────────────────
  f("2.43", "TAX", "Người nộp thuế", "code", "C", {
    maxLen: 1, codeTable: "TAX_PAYER", fptField: "VN_EDA.TK_TPM",
    legalNote: "1 người nộp thuế là người xuất/nhập khẩu; 2 là đại lý hải quan.",
  }),
  f("2.44", "TAX", "Mã ngân hàng trả thuế thay", "code", "C", {
    maxLen: 11, fptField: "VN_EDA.TK_BRC", manual: true,
    legalNote: "Mã ngân hàng do NHNN cấp, khi dùng hạn mức ngân hàng nộp thuế thay.",
  }),
  f("2.45", "TAX", "Năm phát hành hạn mức", "int", "C", {
    maxLen: 4, fptField: "VN_EDA.TK_BYA", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("2.46", "TAX", "Ký hiệu chứng từ hạn mức", "text", "C", {
    maxLen: 10, fptField: "VN_EDA.TK_BCM", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("2.47", "TAX", "Số chứng từ hạn mức", "text", "C", {
    maxLen: 10, fptField: "VN_EDA.TK_BCN", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("2.48", "TAX", "Mã xác định thời hạn nộp thuế", "code", "C", {
    maxLen: 1, codeTable: "DUE_DATE", fptField: "VN_EDA.TK_ENC", manual: true,
    legalNote: "A áp dụng thời hạn nộp thuế do bảo lãnh riêng; B do bảo lãnh chung; C có thời hạn nộp thuế, không sử dụng bảo lãnh; D nộp thuế ngay.",
  }),
  f("2.49", "TAX", "Mã ngân hàng bảo lãnh", "code", "C", {
    maxLen: 11, fptField: "VN_EDA.TK_SBC", manual: true,
    legalNote: "Mã ngân hàng bảo lãnh do NHNN cấp.",
  }),
  f("2.50", "TAX", "Năm phát hành bảo lãnh", "int", "C", {
    maxLen: 4, fptField: "VN_EDA.TK_RYA", manual: true,
    legalNote: "4 ký tự; bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),
  f("2.51", "TAX", "Ký hiệu chứng từ bảo lãnh", "text", "C", {
    maxLen: 10, fptField: "VN_EDA.TK_SCM", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),
  f("2.52", "TAX", "Số chứng từ bảo lãnh", "text", "C", {
    maxLen: 10, fptField: "VN_EDA.TK_SCN", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),

  // ── Đính kèm, vận chuyển kết hợp, ghi chú, Vanning, container ─────
  f("2.53", "GENERAL", "Số đính kèm khai báo điện tử", "code", "C", {
    maxLen: 3, codeTable: "A546", fptField: "VN_EDA.TK_EA1", manual: true,
    legalNote: "Tối đa 3: ô 1 mã phân loại đính kèm HYS (TK_EA1..3); ô 2 số đính kèm do HYS cấp (TK_EB1..3).",
  }),
  f("2.54", "TRANSPORT", "Ngày khởi hành vận chuyển", "date", "C", {
    fptField: "VN_EDA.TK_DPD", manual: true,
    legalNote: "Chỉ nhập khi khai vận chuyển kết hợp.",
  }),
  f("2.55", "TRANSPORT", "Thông tin trung chuyển", "code", "C", {
    maxLen: 7, codeTable: "A202", fptField: "VN_EDA.TK_ST1", manual: true,
    legalNote: "Tối đa 3 địa điểm trung chuyển (TK_ST1..3), ngày đến (TK_AD1..3), ngày khởi hành (TK_SD1..3) khi vận chuyển kết hợp.",
  }),
  f("2.56", "TRANSPORT", "Địa điểm đích cho vận chuyển bảo thuế", "code", "C", {
    maxLen: 7, codeTable: "A202", fptField: "VN_EDA.TK_ARP", manual: true,
    legalNote: "Khai vận chuyển kết hợp: ô 1 mã địa điểm đích (TK_ARP); ô 2 ngày dự kiến đến (TK_ADT).",
  }),
  f("2.57", "GENERAL", "Phần ghi chú", "text", "O", {
    maxLen: 100, fptField: "VN_EDA.TK_NT2", amendedBy121: true,
    legalNote: "Ngăn cách \";\", ≤ 100 ký tự, vượt: ghi tiếp 2.32/mô tả, HYS. Số TK xuất gia công ban đầu; số TK NK ban đầu (ODA); lộ trình khi loại hình không hỗ trợ VCKH; số hợp đồng; TT121: tham vấn 1 lần (STT hàng, số/ngày TB trị giá, mã Chi cục), \"tham vấn gián tiếp\", đề nghị giải phóng hàng chờ KQPTPL.",
  }),
  f("2.58", "GENERAL", "Số quản lý của nội bộ doanh nghiệp", "text", "O", {
    maxLen: 20, fptField: "VN_EDA.TK_REF", amendedBy121: true,
    legalNote: "#&XKTC xuất khẩu tại chỗ (cả PTVT bán sau xuất cảnh); #&GCPTQ gia công với DNCX; #&XKPTQ mua bán DNCX – nội địa; #&1 tạm xuất cá nhân miễn thuế, #&2 dụng cụ nghề nghiệp, #&3 PT chứa hàng quay vòng, #&4 quà biếu, #&5 ngoại giao, #&6 viện trợ, #&7 hàng mẫu, #&8 tài sản di chuyển, #&9 hành lý (TT121).",
  }),
  f("2.59", "TRANSPORT", "Địa điểm xếp hàng lên xe chở hàng (Vanning)", "code", "C", {
    maxLen: 7, fptField: "VN_EDA_CON.CON_VC1", manual: true,
    legalNote: "Mã (5 ô, CON_VC1..5): địa điểm đóng hàng/xếp hàng lên xe, là khu vực giám sát thì nhập mã khu vực; tên (CON_VN); địa chỉ (CON_VA).",
  }),
  f("2.60", "TRANSPORT", "Số container", "text", "C", {
    maxLen: 12, fptField: "VN_EDA_CON.CON_C01",
    legalNote: "Số container khi hàng vận chuyển đường biển đóng container; tối đa 50 số (CON_C01..C50).",
  }),
  f("2.61", "GENERAL", "Phân loại chỉ thị của Hải quan", "code", "F", {
    maxLen: 1, fptField: "VN_EDA_CTHQ.CTHQ_CCM",
    legalNote: "Phần dành cho công chức hải quan: A hướng dẫn sửa đổi, B thay đổi khai báo xuất khẩu.",
  }),
  f("2.62", "GENERAL", "Ngày chỉ thị của Hải quan", "date", "F", {
    fptField: "VN_EDA_CTHQ.CTHQ_D01",
    legalNote: "Phần dành cho công chức hải quan.",
  }),
  f("2.63", "GENERAL", "Tên chỉ thị của Hải quan", "text", "F", {
    maxLen: 40, fptField: "VN_EDA_CTHQ.CTHQ_T01",
    legalNote: "Phần dành cho công chức hải quan: trích yếu nội dung.",
  }),
  f("2.64", "GENERAL", "Nội dung chỉ thị của Hải quan", "text", "F", {
    maxLen: 140, fptField: "VN_EDA_CTHQ.CTHQ_I01",
    legalNote: "Phần dành cho công chức hải quan.",
  }),

  // ── B. Chi tiết hàng hóa (lặp theo dòng hàng) ──────────────────────
  f("2.65", "ITEMS", "Mã số hàng hóa", "code", "M", {
    maxLen: 12, fptField: "VN_EDA_HANG.HAG_CMD", amendedBy121: true,
    legalNote: "Mã HS đầy đủ theo Danh mục hàng hóa XNK VN và các Biểu thuế XK, Biểu thuế NK ưu đãi do Chính phủ ban hành (TT121). Dầu thô khai riêng, không chung tờ khai với hàng khác; không khai chung hàng nộp thuế/phí bằng đồng tiền khác nhau.",
  }),
  f("2.66", "ITEMS", "Mã quản lý riêng", "text", "O", {
    maxLen: 7, fptField: "VN_EDA_HANG.HAG_COC", manual: true,
    legalNote: "Mã quản lý hàng hóa (nếu có).",
  }),
  f("2.67", "ITEMS", "Thuế suất", "decimal", "C", {
    assist: true,
    maxLen: 10, fptField: "VN_EDA_HANG.HAG_TXA", amendedBy121: true,
    legalNote: "Hệ thống tự xác định thuế suất XK theo mã HS; không xác định được thì nhập tay. Hàng không có tên trong Biểu thuế XK, không thuộc STT 211 thì không khai (TT121).",
  }),
  f("2.68", "ITEMS", "Mức thuế tuyệt đối", "decimal", "C", {
    assist: true,
    maxLen: 10, fptField: "VN_EDA_HANG.HAG_TXB",
    legalNote: "Ô 1 mức thuế tuyệt đối (HAG_TXB); ô 2 mã đơn vị tính (HAG_TXC); ô 3 mã đồng tiền (HAG_TXD).",
  }),
  f("2.69", "ITEMS", "Mô tả hàng hóa", "text", "M", {
    maxLen: 200, fptField: "VN_EDA_HANG.HAG_CMN", amendedBy121: true,
    legalNote: "Bắt buộc dạng \"mô tả hàng hóa#&mã nước xuất xứ\" (TT121). Mô tả: tên hàng, quy cách, thông số, thành phần, hàm lượng, model, công dụng, quy cách đóng gói, nhà sản xuất… làm căn cứ mã số. GC/SXXK: mã SP#&tên hàng. Dùng KQ PTPL: số/ngày thông báo. Số lượng > 2 số thập phân: thêm \"#&số lượng\".",
  }),
  f("2.70", "ITEMS", "Mã miễn/Giảm/Không chịu thuế xuất khẩu", "code", "C", {
    maxLen: 5, codeTable: "A520", fptField: "VN_EDA_HANG.HAG_RE",
    legalNote: "Khi hàng thuộc đối tượng miễn, giảm, không chịu thuế XK; nếu phải đăng ký DMMT trên VNACCS thì khai kèm 2.78, 2.79.",
  }),
  f("2.71", "ITEMS", "Số tiền giảm thuế xuất khẩu", "decimal", "C", {
    maxLen: 16, fptField: "VN_EDA_HANG.HAG_REG",
    legalNote: "Số tiền thuế xuất khẩu được giảm.",
  }),
  f("2.72", "ITEMS", "Số lượng (1)", "decimal", "M", {
    maxLen: 12, codeTable: "A501", fptField: "VN_EDA_HANG.HAG_QN1",
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK VN, ≤ 2 số thập phân; vượt thì làm tròn, ghi số lượng thực tế, đơn giá ở 2.69 \"mô tả#&số lượng\", không khai 2.75 (HAG_QN1); ô 2 mã ĐVT (HAG_QT1). Thuế tuyệt đối: ĐVT tính thuế; phí cà phê, hồ tiêu, hạt điều: ĐVT tính phí.",
  }),
  f("2.73", "ITEMS", "Số lượng (2)", "decimal", "C", {
    maxLen: 12, codeTable: "A501", fptField: "VN_EDA_HANG.HAG_QN2",
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK VN, tối đa 2 số thập phân (HAG_QN2); ô 2 mã ĐVT (HAG_QT2).",
  }),
  f("2.74", "ITEMS", "Trị giá hóa đơn", "decimal", "C", {
    maxLen: 20, fptField: "VN_EDA_HANG.HAG_BPR",
    legalNote: "Trị giá hóa đơn từng dòng hàng, tối đa 4 số thập phân; phần nguyên vượt 12 chữ số thì tách dòng (tổng lượng không đổi). Không có hóa đơn: không khai. Sản phẩm gia công cho thương nhân nước ngoài: trị giá đến cửa khẩu xuất (FOB hoặc tương đương).",
  }),
  f("2.75", "ITEMS", "Đơn giá hóa đơn", "decimal", "C", {
    maxLen: 9, fptField: "VN_EDA_HANG.HAG_UPR",
    legalNote: "Ô 1 đơn giá (HAG_UPR); ô 2 mã đồng tiền (HAG_UPC); ô 3 đơn vị tính (HAG_TSC). Đơn giá × số lượng = trị giá ± 1. Sản phẩm gia công: khai giá (phí) gia công.",
  }),
  f("2.76", "ITEMS", "Trị giá tính thuế", "decimal", "C", {
    assist: true,
    maxLen: 20, fptField: "VN_EDA_HANG.HAG_DPR",
    legalNote: "Chỉ nhập khi phân bổ thủ công: ô 1 mã đồng tiền (HAG_BPC); ô 2 trị giá tính thuế dòng hàng (HAG_DPR). Hệ thống ưu tiên trị giá nhập tay.",
  }),
  f("2.77", "ITEMS", "Số thứ tự của dòng hàng trên tờ khai tạm nhập tái xuất tương ứng", "text", "C", {
    maxLen: 2, fptField: "VN_EDA_HANG.HAG_TDL", manual: true,
    legalNote: "Số thứ tự dòng hàng trên tờ khai tạm nhập/tạm xuất tương ứng; số lượng ≤ số lượng còn lại.",
  }),
  f("2.78", "ITEMS", "Danh mục miễn thuế xuất khẩu", "text", "C", {
    maxLen: 12, fptField: "VN_EDA_HANG.HAG_TXN", manual: true,
    legalNote: "Số Danh mục miễn thuế XK đã thông báo trên hệ thống; nhập kèm mã miễn thuế tại 2.70.",
  }),
  f("2.79", "ITEMS", "Số dòng tương ứng trong Danh mục miễn thuế xuất khẩu", "text", "C", {
    maxLen: 3, fptField: "VN_EDA_HANG.HAG_TXR", manual: true,
    legalNote: "Số thứ tự dòng hàng trong Danh mục miễn thuế. Cần đối chiếu FPT: đặc tả FPT mô tả HAG_TXR là \"Danh mục miễn thuế\" (khớp theo mã VNACCS TXR).",
  }),
  f("2.80", "ITEMS", "Mã văn bản pháp luật khác", "code", "C", {
    maxLen: 2, codeTable: "A519", fptField: "VN_EDA_HANG.HAG_OL1",
    legalNote: "Mã văn bản quản lý XK, kiểm tra chuyên ngành (giấy phép, kiểm dịch, ATTP, chất lượng…), tối đa 5 mã không trùng (HAG_OL1..5); hàng thuộc quản lý chuyên ngành bắt buộc nhập. Mã MO/CU (CV 2061/TCHQ-GSQL) chỉ áp dụng cho tờ khai nhập khẩu.",
  }),
];
