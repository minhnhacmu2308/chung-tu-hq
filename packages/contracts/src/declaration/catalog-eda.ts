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
    maxLen: 1, fptField: "VN_EDA.TK_CCC",
    legalNote: "Chỉ bắt buộc với hàng đặc thù: A quà biếu, B an ninh quốc phòng, C cứu trợ, D phòng chống thiên tai/dịch bệnh, E viện trợ, F bưu chính/CPN, G tài sản di chuyển, H PTVT XNC, I ngoại giao, J khác theo CP, K bảo quản đặc biệt.",
  }),
  f("2.6", "GENERAL", "Mã hiệu phương thức vận chuyển", "code", "M", {
    maxLen: 1, codeTable: "TRANSPORT_MODE", fptField: "VN_EDA.TK_MTC",
    legalNote: "1 hàng không, 2 biển (container), 3 biển (hàng rời, lỏng), 4 bộ, 5 sắt, 6 sông, 9 khác (đường ống, XK tại chỗ, hàng vào kho ngoại quan).",
  }),
  f("2.7", "GENERAL", "Thời hạn tái nhập khẩu", "date", "C", {
    fptField: "VN_EDA.TK_RID", manual: true,
    legalNote: "Chỉ khai với loại hình tạm xuất: ngày hết hạn tạm xuất.",
  }),
  f("2.8", "GENERAL", "Cơ quan Hải quan", "code", "O", {
    maxLen: 6, codeTable: "A038", fptField: "VN_EDA.TK_CH",
    legalNote: "Mã Chi cục HQ nơi đăng ký tờ khai. Không nhập thì hệ thống tự xác định theo địa điểm lưu giữ hàng chờ thông quan.",
  }),
  f("2.9", "GENERAL", "Mã bộ phận xử lý tờ khai", "code", "O", {
    maxLen: 2, codeTable: "A014", fptField: "VN_EDA.TK_CHB",
    legalNote: "Mã Đội thủ tục xử lý tờ khai. Không nhập thì hệ thống tự xác định dựa trên mã HS.",
  }),
  f("2.10", "GENERAL", "Ngày khai báo (dự kiến)", "date", "O", {
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
    maxLen: 100, fptField: "VN_EDA.TK_EPA",
    legalNote: "Không cần nhập nếu hệ thống tự hiển thị; nhập lại nếu hệ thống hiển thị sai.",
  }),
  f("2.15", "PARTIES", "Số điện thoại người xuất khẩu", "text", "O", {
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
    legalNote: "Tên người mua theo hợp đồng (kể cả mua bán qua bên thứ ba); XK tại chỗ: người được chỉ định nhận hàng; gia công: bên đặt gia công. Chấp nhận tên viết tắt (TT121).",
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
    legalNote: "Mã nước của người nhập khẩu, 2 ký tự theo UN/LOCODE.",
  }),
  f("2.23", "PARTIES", "Mã đại lý Hải quan", "text", "O", {
    maxLen: 5, fptField: "VN_EDA.TK_ECC", manual: true,
    legalNote: "Không nhập nếu đại lý thực hiện EDA và nghiệp vụ tiếp theo; nhập mã người sử dụng khi người khai EDA khác người khai EDC.",
  }),

  // ── Vận tải ─────────────────────────────────────────────────────────
  f("2.24", "TRANSPORT", "Số vận đơn (Số B/L, số AWB v.v....)", "text", "C", {
    maxLen: 35, fptField: "VN_EDA.TK_EKN",
    legalNote: "Khai số quản lý hàng hóa do hệ thống cấp sau khi thông báo hàng dự kiến đưa vào khu vực giám sát (mẫu số 14).",
  }),
  f("2.25", "TRANSPORT", "Số lượng", "int", "M", {
    maxLen: 8, codeTable: "UNIT", fptField: "VN_EDA.TK_NO",
    legalNote: "Số lượng kiện: ô 1 tổng số kiện, không thập phân, hàng không đóng kiện nhập \"1\" (TK_NO); ô 2 mã loại kiện (TK_NOT).",
  }),
  f("2.26", "TRANSPORT", "Tổng trọng lượng hàng (Gross)", "decimal", "C", {
    maxLen: 10, codeTable: "UNIT", fptField: "VN_EDA.TK_GW",
    legalNote: "Ô 1 tổng trọng lượng gross (TK_GW): đường không 8+1 số, khác 6+3 số; ô 2 mã đơn vị KGM/TNE/LBR (TK_GWT). Không nhập khi PTVC mã 9.",
  }),
  f("2.27", "TRANSPORT", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", "code", "C", {
    maxLen: 7, codeTable: "A202", fptField: "VN_EDA.TK_ST",
    legalNote: "Mã địa điểm tập kết hàng XK đã mã hóa (kho DN, ICD…); chưa mã hóa dùng mã dùng chung của Chi cục (vd 47NBOZZ) và ghi địa điểm ở chỉ tiêu Vanning; CV 4613/TCHQ-VNACCS.",
  }),
  f("2.28", "TRANSPORT", "Địa điểm nhận hàng cuối cùng", "code", "M", {
    maxLen: 5, codeTable: "A016", fptField: "VN_EDA.TK_DSC",
    legalNote: "Ô 1 mã UN/LOCODE cảng/sân bay nước ngoài (TK_DSC); không có mã nhập \"ZZZ\"; XK tại chỗ \"VNZZZ\"; vào kho ngoại quan \"ZZZZZ\"; ô 2 tên địa điểm (TK_DSN).",
  }),
  f("2.29", "TRANSPORT", "Địa điểm xếp hàng", "code", "C", {
    maxLen: 6, codeTable: "A016", fptField: "VN_EDA.TK_PSC",
    legalNote: "Ô 1 mã cảng/sân bay/ga/cửa khẩu xếp hàng trong nước (TK_PSC), bắt buộc trừ PTVC mã 9; ô 2 tên địa điểm xếp hàng (TK_PSN).",
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
  f("2.34", "VALUE", "Phân loại hình thức hóa đơn", "code", "C", {
    maxLen: 1, codeTable: "INVOICE_KIND", fptField: "VN_EDA.TK_IV1",
    legalNote: "A hóa đơn thương mại; B chứng từ tương đương/bảng kê hóa đơn/không có hóa đơn; D hóa đơn điện tử đăng ký trên VNACCS.",
  }),
  f("2.35", "VALUE", "Số tiếp nhận hóa đơn điện tử", "text", "C", {
    maxLen: 12, fptField: "VN_EDA.TK_IV2",
    legalNote: "Bắt buộc khi Phân loại hình thức hóa đơn là \"D\"; không nhập được với mã khác.",
  }),
  f("2.36", "VALUE", "Số hóa đơn", "text", "C", {
    maxLen: 35, fptField: "VN_EDA.TK_IV3",
    legalNote: "Số hóa đơn thương mại hoặc chứng từ tương đương/bảng kê hóa đơn.",
  }),
  f("2.37", "VALUE", "Ngày phát hành", "date", "C", {
    fptField: "VN_EDA.TK_IVD",
    legalNote: "Ngày phát hành hóa đơn thương mại (hoặc ngày lập chứng từ tương đương/bảng kê).",
  }),
  f("2.38", "VALUE", "Phương thức thanh toán", "code", "C", {
    maxLen: 7, codeTable: "PAYMENT", fptField: "VN_EDA.TK_IVP",
    legalNote: "Cùng bộ mã với 1.43 (BIENMAU, DA, CAD, CASH, DP, LC, TTR, KC…).",
  }),
  f("2.39", "VALUE", "Trị giá hóa đơn", "decimal", "M", {
    maxLen: 20, codeTable: "INCOTERM", fptField: "VN_EDA.TK_IP4",
    legalNote: "Ô 1 điều kiện giá Incoterms (TK_IP2), mua bán với DNCX nhập DAP; ô 2 mã đồng tiền (TK_IP3); ô 3 tổng trị giá hóa đơn (TK_IP4); ô 4 mã phân loại giá hóa đơn A–D (TK_IP1).",
  }),
  f("2.40", "VALUE", "Trị giá tính thuế", "decimal", "C", {
    maxLen: 20, fptField: "VN_EDA.TK_FKK",
    legalNote: "Điều kiện giá FOB, DAP, DAF thì không nhập; khác hoặc không có hóa đơn: ô 1 mã đồng tiền (TK_FCD), ô 2 tổng trị giá tính thuế (TK_FKK).",
  }),
  f("2.41", "VALUE", "Phân loại không cần quy đổi VND", "code", "O", {
    maxLen: 1, fptField: "VN_EDA.TK_CNV",
    legalNote: "Nhập \"N\" nếu số tiền thuế và trị giá hải quan không cần quy đổi sang VND.",
  }),
  f("2.42", "VALUE", "Tổng hệ số phân bổ trị giá tính thuế", "decimal", "C", {
    maxLen: 20, fptField: "VN_EDA.TK_TP",
    legalNote: "Tổng trị giá hóa đơn trước điều chỉnh; bắt buộc khi một hóa đơn nhiều tờ khai; không nhập thì hệ thống cộng trị giá các dòng hàng.",
  }),

  // ── Nộp thuế, hạn mức, bảo lãnh ─────────────────────────────────────
  f("2.43", "TAX", "Người nộp thuế", "code", "C", {
    maxLen: 1, fptField: "VN_EDA.TK_TPM",
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
    maxLen: 1, fptField: "VN_EDA.TK_ENC", manual: true,
    legalNote: "A bảo lãnh riêng; B bảo lãnh chung; C có thời hạn nộp thuế không cần bảo lãnh; D nộp thuế ngay.",
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
    legalNote: "Ví dụ: số tờ khai xuất gia công ban đầu; số tờ khai NK ban đầu (ODA); số hợp đồng mua bán (nếu có); đề nghị tham vấn (TT121). Nhiều nội dung ngăn cách bằng \";\".",
  }),
  f("2.58", "GENERAL", "Số quản lý của nội bộ doanh nghiệp", "text", "O", {
    maxLen: 20, fptField: "VN_EDA.TK_REF", amendedBy121: true,
    legalNote: "Mã quản lý nội bộ hoặc ký hiệu theo hướng dẫn: #&XKTC (XK tại chỗ), #&GCPTQ, #&XKPTQ, tạm xuất/quà biếu… #&1..#&5 (TT121 sửa).",
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
    maxLen: 1,
    legalNote: "Phần dành cho công chức hải quan: A hướng dẫn sửa đổi, B thay đổi khai báo xuất khẩu.",
  }),
  f("2.62", "GENERAL", "Ngày chỉ thị của Hải quan", "date", "F", {
    legalNote: "Phần dành cho công chức hải quan.",
  }),
  f("2.63", "GENERAL", "Tên chỉ thị của Hải quan", "text", "F", {
    maxLen: 40,
    legalNote: "Phần dành cho công chức hải quan: trích yếu nội dung.",
  }),
  f("2.64", "GENERAL", "Nội dung chỉ thị của Hải quan", "text", "F", {
    maxLen: 140,
    legalNote: "Phần dành cho công chức hải quan.",
  }),

  // ── B. Chi tiết hàng hóa (lặp theo dòng hàng) ──────────────────────
  f("2.65", "ITEMS", "Mã số hàng hóa", "code", "M", {
    maxLen: 12, fptField: "VN_EDA_HANG.HAG_CMD", amendedBy121: true,
    legalNote: "Mã HS đầy đủ theo Danh mục hàng hóa XNK VN và Biểu thuế. Không khai dầu thô chung với hàng khác; không khai chung hàng nộp thuế/phí bằng đồng tiền khác nhau.",
  }),
  f("2.66", "ITEMS", "Mã quản lý riêng", "text", "O", {
    maxLen: 7, fptField: "VN_EDA_HANG.HAG_COC", manual: true,
    legalNote: "Mã quản lý hàng hóa (nếu có).",
  }),
  f("2.67", "ITEMS", "Thuế suất", "decimal", "C", {
    maxLen: 10, fptField: "VN_EDA_HANG.HAG_TXA", amendedBy121: true,
    legalNote: "Hệ thống tự xác định thuế suất XK theo mã HS; không xác định được thì nhập tay. Hàng không có tên trong Biểu thuế XK, không thuộc STT 211 thì không khai (TT121).",
  }),
  f("2.68", "ITEMS", "Mức thuế tuyệt đối", "decimal", "C", {
    maxLen: 10, fptField: "VN_EDA_HANG.HAG_TXB",
    legalNote: "Ô 1 mức thuế tuyệt đối (HAG_TXB); ô 2 mã đơn vị tính (HAG_TXC); ô 3 mã đồng tiền (HAG_TXD).",
  }),
  f("2.69", "ITEMS", "Mô tả hàng hóa", "text", "M", {
    maxLen: 200, fptField: "VN_EDA_HANG.HAG_CMN", amendedBy121: true,
    legalNote: "Tên hàng, quy cách, thông số, thành phần, model, công dụng, nhà sản xuất… làm căn cứ xác định mã số; khai xuất xứ theo quy tắc: mô tả hàng hóa#&mã nước xuất xứ (TT121). GC/SXXK: mã SP#&tên hàng.",
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
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK VN (HAG_QN1); ô 2 mã ĐVT (HAG_QT1). Hàng chịu thuế tuyệt đối: theo ĐVT tính thuế.",
  }),
  f("2.73", "ITEMS", "Số lượng (2)", "decimal", "C", {
    maxLen: 12, codeTable: "A501", fptField: "VN_EDA_HANG.HAG_QN2",
    legalNote: "Ô 1 số lượng theo ĐVT trong Danh mục hàng hóa XNK VN, tối đa 2 số thập phân (HAG_QN2); ô 2 mã ĐVT (HAG_QT2).",
  }),
  f("2.74", "ITEMS", "Trị giá hóa đơn", "decimal", "C", {
    maxLen: 20, fptField: "VN_EDA_HANG.HAG_BPR",
    legalNote: "Trị giá hóa đơn từng dòng hàng, tối đa 4 số thập phân.",
  }),
  f("2.75", "ITEMS", "Đơn giá hóa đơn", "decimal", "C", {
    maxLen: 9, fptField: "VN_EDA_HANG.HAG_UPR",
    legalNote: "Ô 1 đơn giá (HAG_UPR); ô 2 mã đồng tiền (HAG_UPC); ô 3 đơn vị tính (HAG_TSC). Đơn giá × số lượng = trị giá ± 1. Sản phẩm gia công: khai giá (phí) gia công.",
  }),
  f("2.76", "ITEMS", "Trị giá tính thuế", "decimal", "C", {
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
    legalNote: "Mã văn bản quản lý XK, kiểm tra chuyên ngành (giấy phép, kiểm dịch, ATTP, chất lượng…), tối đa 5 mã không trùng (HAG_OL1..5); hàng thuộc quản lý chuyên ngành bắt buộc nhập.",
  }),
];
