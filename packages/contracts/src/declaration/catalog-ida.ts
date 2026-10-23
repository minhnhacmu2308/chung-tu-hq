import { CATALOG_IDA_ITEMS } from "./catalog-ida-items.js";
import { fieldBuilder, type DeclarationFieldDef } from "./catalog-types.js";

/**
 * Mẫu số 01 – Tờ khai điện tử nhập khẩu (VNACCS IDA), Phụ lục II TT38/2015 sửa đổi TT39/2018, cập nhật TT121/2025.
 * Phần A (thông tin chung) 1.1–1.73 ở file này; phần B (chi tiết hàng) 1.74–1.96 ở catalog-ida-items.ts.
 * maxLen/required lấy theo "1001-2 IDA Input Data Element" (VNACCS); tên trường FPT theo "VNACCS_IDA v1.2".
 * Quy ước required: VNACCS M→M, C→C, F (tùy chọn, hệ thống tự xuất)→O; X (phần công chức HQ)/hệ thống cấp→F.
 */
const f = fieldBuilder("01");

const CATALOG_IDA_GENERAL: DeclarationFieldDef[] = [
  // ── A. Thông tin chung ─────────────────────────────────────────────
  f("1.1", "GENERAL", "Số tờ khai", "text", "F", {
    maxLen: 12, fptField: "VN_IDA.TK_ICN",
    legalNote: "Không nhập, hệ thống tự cấp. 11 ký tự đầu là số tờ khai, ký tự thứ 12 là số lần khai bổ sung.",
  }),
  f("1.2", "GENERAL", "Số tờ khai đầu tiên", "text", "C", {
    maxLen: 12, fptField: "VN_IDA.TK_FIC", manual: true,
    legalNote: "Chỉ khai khi lô hàng > 50 dòng hoặc phải tách tờ khai: ô 1 tờ đầu nhập \"F\", tờ sau nhập số tờ khai đầu tiên; ô 2 số thứ tự (TK_BNO); ô 3 tổng số tờ khai (TK_DNO).",
  }),
  f("1.3", "GENERAL", "Số tờ khai TN-TX tương ứng", "text", "C", {
    maxLen: 12, fptField: "VN_IDA.TK_TDN", manual: true,
    legalNote: "Tái nhập hàng tạm xuất: số tờ khai tạm xuất; chuyển tiêu thụ nội địa hàng tạm nhập: số tờ khai tạm nhập. Tờ khai ban đầu phải còn hiệu lực.",
  }),
  f("1.4", "GENERAL", "Mã loại hình", "code", "M", {
    maxLen: 3, codeTable: "TYPE_CODE", fptField: "VN_IDA.TK_ICB",
    legalNote: "Căn cứ hồ sơ, mục đích nhập khẩu để chọn mã loại hình theo bảng mã của TCHQ (ví dụ A11, A12, E31, G11).",
  }),
  f("1.5", "GENERAL", "Mã phân loại hàng hóa", "code", "C", {
    maxLen: 1, codeTable: "CARGO_CLASS", fptField: "VN_IDA.TK_CCC",
    legalNote: "Bắt buộc với hàng đặc thù: A quà biếu, B an ninh quốc phòng, C cứu trợ khẩn cấp, D phòng chống thiên tai/dịch bệnh, E viện trợ, F bưu chính/CPN, G tài sản di chuyển, H PTVT XNC, I ngoại giao, J khác theo CP, K bảo quản đặc biệt.",
  }),
  f("1.6", "GENERAL", "Mã hiệu phương thức vận chuyển", "code", "M", {
    maxLen: 1, codeTable: "TRANSPORT_MODE", fptField: "VN_IDA.TK_MTC",
    legalNote: "1 hàng không, 2 biển (container), 3 biển (hàng rời, lỏng; cả hàng LCL vào kho CFS), 4 bộ, 5 sắt, 6 sông, 9 khác (đường ống, NK tại chỗ, hàng vào kho ngoại quan).",
  }),
  f("1.7", "GENERAL", "Phân loại cá nhân/tổ chức", "code", "M", {
    maxLen: 1, codeTable: "PARTY_CLASS", fptField: "VN_IDA.TK_SKB",
    legalNote: "1 cá nhân gửi cá nhân; 2 tổ chức gửi cá nhân; 3 cá nhân gửi tổ chức; 4 tổ chức gửi tổ chức; 5 khác.",
  }),
  f("1.8", "GENERAL", "Cơ quan Hải quan", "code", "O", {
    assist: true,
    maxLen: 6, codeTable: "A038", fptField: "VN_IDA.TK_CH",
    legalNote: "Mã Chi cục HQ nơi đăng ký tờ khai. Không nhập thì hệ thống tự xác định theo địa điểm lưu giữ hàng chờ thông quan.",
  }),
  f("1.9", "GENERAL", "Mã bộ phận xử lý tờ khai", "code", "O", {
    assist: true,
    maxLen: 2, codeTable: "A014", fptField: "VN_IDA.TK_CHB",
    legalNote: "Mã Đội thủ tục xử lý tờ khai. Không nhập thì hệ thống tự xác định dựa trên mã HS.",
  }),
  f("1.10", "GENERAL", "Thời hạn tái xuất khẩu", "date", "C", {
    fptField: "VN_IDA.TK_RED", manual: true,
    legalNote: "Chỉ khai với loại hình tạm nhập: ngày hết hạn hàng tạm nhập được lưu tại Việt Nam.",
  }),
  f("1.11", "GENERAL", "Ngày khai báo (dự kiến)", "date", "O", {
    assist: true,
    fptField: "VN_IDA.TK_ICD",
    legalNote: "Ngày dự kiến thực hiện nghiệp vụ IDC; không nhập thì hệ thống lấy ngày thực hiện nghiệp vụ.",
  }),

  // ── Người nhập khẩu / ủy thác / xuất khẩu / đại lý ─────────────────
  f("1.12", "PARTIES", "Mã người nhập khẩu", "text", "M", {
    maxLen: 13, fptField: "VN_IDA.TK_IMC", amendedBy121: true,
    legalNote: "MST người nhập khẩu (hệ thống tự xuất nếu người NK thực hiện IDA). Kho ngoại quan: mã chủ kho/đại lý. NK tại chỗ: MST người được chỉ định nhận hàng tại VN (TT121). VNACCS ghi F vì có thể tự xuất.",
  }),
  f("1.13", "PARTIES", "Tên người nhập khẩu", "text", "M", {
    maxLen: 100, fptField: "VN_IDA.TK_IMN", amendedBy121: true,
    legalNote: "Tên người nhập khẩu; hệ thống tự xuất nếu đã có mã. NK tại chỗ: tên người được chỉ định nhận hàng tại VN (TT121).",
  }),
  f("1.14", "PARTIES", "Mã bưu chính", "text", "O", {
    maxLen: 7, fptField: "VN_IDA.TK_IMY",
    legalNote: "Mã bưu chính của người nhập khẩu (nếu có).",
  }),
  f("1.15", "PARTIES", "Địa chỉ người nhập khẩu", "text", "O", {
    assist: true,
    maxLen: 100, fptField: "VN_IDA.TK_IMA",
    legalNote: "Không cần nhập nếu hệ thống tự hiển thị; nhập lại nếu hệ thống hiển thị sai.",
  }),
  f("1.16", "PARTIES", "Số điện thoại người nhập khẩu", "text", "O", {
    assist: true,
    maxLen: 20, fptField: "VN_IDA.TK_IMT",
    legalNote: "Không dùng dấu gạch ngang; không cần nhập nếu hệ thống tự hiển thị đúng.",
  }),
  f("1.17", "PARTIES", "Mã người ủy thác nhập khẩu", "text", "C", {
    maxLen: 13, fptField: "VN_IDA.TK_NMC",
    legalNote: "MST người ủy thác nhập khẩu (khi nhập khẩu ủy thác).",
  }),
  f("1.18", "PARTIES", "Tên người ủy thác nhập khẩu", "text", "C", {
    maxLen: 100, fptField: "VN_IDA.TK_NMN",
    legalNote: "Tên người ủy thác nhập khẩu.",
  }),
  f("1.19", "PARTIES", "Mã người xuất khẩu", "text", "O", {
    maxLen: 13, fptField: "VN_IDA.TK_EPC", amendedBy121: true,
    legalNote: "Mã người xuất khẩu/chủ hàng nước ngoài gửi kho ngoại quan (nếu có). NK tại chỗ: MST người được chỉ định giao hàng (TT121).",
  }),
  f("1.20", "PARTIES", "Tên người xuất khẩu", "text", "M", {
    maxLen: 70, fptField: "VN_IDA.TK_EPN", amendedBy121: true,
    legalNote: "Tên người bán theo hợp đồng (kể cả mua qua bên thứ ba); gia công: bên đặt gia công; NK tại chỗ: người được chỉ định giao hàng. Chấp nhận tên viết tắt.",
  }),
  f("1.21", "PARTIES", "Mã bưu chính người xuất khẩu", "text", "O", {
    maxLen: 9, fptField: "VN_IDA.TK_EPY",
    legalNote: "Mã bưu chính của người xuất khẩu (nếu có).",
  }),
  f("1.22", "PARTIES", "Địa chỉ", "text", "C", {
    maxLen: 35, fptField: "VN_IDA.TK_EPA",
    legalNote: "Địa chỉ người xuất khẩu, 4 ô × 35 ký tự: ô 1–2 đường, số nhà/P.O.BOX (TK_EPA, TK_EP2); ô 3 thành phố (TK_EP3); ô 4 tên nước (TK_EP4). Chỉ nhập khi hệ thống không tự hỗ trợ.",
  }),
  f("1.23", "PARTIES", "Mã nước", "code", "M", {
    maxLen: 2, codeTable: "COUNTRY", fptField: "VN_IDA.TK_EPO",
    legalNote: "Mã nước gửi hàng, 2 ký tự UN/LOCODE: vận chuyển thẳng hoặc qua nước trung gian không có mua bán, gia công, chế biến, thông quan → nước xuất khẩu; có các hoạt động đó → nước trung gian cuối cùng trước khi đến VN; không xác định được → mã nước của người xuất khẩu.",
  }),
  f("1.24", "PARTIES", "Tên người ủy thác xuất khẩu", "text", "O", {
    maxLen: 70, fptField: "VN_IDA.TK_ENM", amendedBy121: true,
    legalNote: "Tên người ủy thác xuất khẩu (nếu có). NK tại chỗ: tên người nước ngoài chỉ định giao hàng tại VN (TT121).",
  }),
  f("1.25", "PARTIES", "Mã đại lý hải quan", "text", "O", {
    assist: true,
    maxLen: 5, fptField: "VN_IDA.TK_ICC", manual: true,
    legalNote: "Không nhập nếu đại lý thực hiện IDA và nghiệp vụ tiếp theo; nhập mã người sử dụng khi người khai IDA khác người khai IDC.",
  }),

  // ── Vận tải ─────────────────────────────────────────────────────────
  f("1.26", "TRANSPORT", "Số vận đơn (Số B/L, số AWB v.v.)", "text", "M", {
    maxLen: 35, fptField: "VN_IDA_VANDON.VD_BL1",
    legalNote: "Vận đơn có người nhận là người NK. Tối đa 5 số (VD_BL1..5) cùng người gửi, người nhận, phương tiện, chuyến, ngày đến. AWB ≤ 20 ký tự. Một vận đơn nhiều tờ khai: tách vận đơn (mẫu 12), khai số vận đơn nhánh; không có vận đơn: số quản lý hàng hóa hệ thống cấp (mẫu 13).",
  }),
  f("1.27", "TRANSPORT", "Số lượng", "int", "M", {
    maxLen: 8, codeTable: "PACKAGE_KIND", fptField: "VN_IDA_VANDON.VD_NO",
    legalNote: "Số lượng kiện: ô 1 tổng số kiện, không thập phân, hàng không thể hiện bằng kiện, thùng nhập \"1\" (VD_NO); ô 2 mã loại kiện theo bảng \"Mã loại kiện\", ví dụ CS thùng, BX hộp (VD_NOT).",
  }),
  f("1.28", "TRANSPORT", "Tổng trọng lượng hàng (Gross)", "decimal", "C", {
    maxLen: 10, codeTable: "GROSS_UNIT", fptField: "VN_IDA_VANDON.VD_GW",
    legalNote: "Ô 1 tổng trọng lượng gross (VD_GW): đường không 8+1 số, khác 6+3 số; ô 2 mã đơn vị KGM/TNE/LBR (VD_GWT), LBR tự quy đổi KGM. Không nhập khi PTVC mã 9.",
  }),
  f("1.29", "TRANSPORT", "Mã địa điểm lưu kho hàng chờ thông quan dự kiến", "code", "M", {
    maxLen: 7, codeTable: "A202", fptField: "VN_IDA_VANDON.VD_ST",
    legalNote: "Mã kho/bãi/cảng nơi hàng chờ thông quan theo thông báo hàng đến (A202 địa điểm lưu kho); CV 4613/TCHQ-VNACCS, ví dụ 03CCS03.",
  }),
  f("1.30", "TRANSPORT", "Ký hiệu và số hiệu", "text", "O", {
    maxLen: 140, fptField: "VN_IDA_VANDON.VD_MRK",
    legalNote: "Ký hiệu và số hiệu bao bì đóng gói (shipping marks trên kiện, thùng).",
  }),
  f("1.31", "TRANSPORT", "Phương tiện vận chuyển", "text", "C", {
    maxLen: 9, fptField: "VN_IDA_VANDON.VD_VSC",
    legalNote: "Ô 1 hô hiệu tàu (call sign), chưa đăng ký nhập 9999 (VD_VSC); ô 2 tên phương tiện (VD_VSN): tên tàu; hàng không mã hãng+số chuyến/ngày, ví dụ AB0001/01JAN; đường bộ số xe; đường sắt số tàu.",
  }),
  f("1.32", "TRANSPORT", "Ngày hàng đến", "date", "M", {
    fptField: "VN_IDA_VANDON.VD_ARR",
    legalNote: "Ngày dự kiến hàng đến cửa khẩu theo chứng từ vận tải hoặc thông báo hàng đến (Arrival notice).",
  }),
  f("1.33", "TRANSPORT", "Địa điểm dỡ hàng", "code", "C", {
    maxLen: 6, codeTable: "A016", fptField: "VN_IDA_VANDON.VD_DST",
    legalNote: "Ô 1 mã cảng/sân bay dỡ hàng theo vận đơn, mã ga, mã cửa khẩu (VD_DST), bắt buộc trừ PTVC mã 9; ô 2 tên địa điểm (VD_DSN) hệ thống tự xuất theo mã.",
  }),
  f("1.34", "TRANSPORT", "Địa điểm xếp hàng", "code", "M", {
    maxLen: 5, codeTable: "A016", fptField: "VN_IDA_VANDON.VD_PSC",
    legalNote: "Ô 1 mã UN/LOCODE nơi xếp hàng (VD_PSC); không có mã: mã nước + \"ZZZ\"; NK tại chỗ \"VNZZZ\"; ô 2 tên địa điểm xếp hàng (VD_PSN).",
  }),
  f("1.35", "TRANSPORT", "Số lượng container", "int", "C", {
    assist: true,
    maxLen: 3, fptField: "VN_IDA_VANDON.VD_COC",
    legalNote: "Hệ thống tự xuất nếu đã đăng ký. Không nhập khi đường không, phương thức không dùng container, hàng đóng chung container từ kho CFS. Danh sách container (số hiệu, ký hiệu, số seal) khai bằng nghiệp vụ HYS, file Excel theo định dạng của cơ quan Hải quan.",
  }),
  f("1.36", "TRANSPORT", "Mã kết quả kiểm tra nội dung", "code", "O", {
    maxLen: 1, codeTable: "INSPECTION_RESULT", fptField: "VN_IDA.TK_N4", manual: true,
    legalNote: "Khi xem hàng trước khai: A không bất thường, B có bất thường, C cần tham vấn ý kiến cơ quan Hải quan.",
  }),

  // ── Giấy phép, hóa đơn, trị giá ────────────────────────────────────
  f("1.37", "VALUE", "Mã văn bản pháp quy khác", "code", "C", {
    maxLen: 2, codeTable: "A519", fptField: "VN_IDA.TK_OL1",
    legalNote: "Mã văn bản quản lý mặt hàng (giấy phép, kiểm dịch, ATTP, kiểm tra chất lượng…). Tối đa 5 mã không trùng (TK_OL1..5); hàng thuộc quản lý chuyên ngành bắt buộc nhập. Hàng chương 84, 85: ô 1 bắt buộc \"MO\" chưa qua sử dụng hoặc \"CU\" đã qua sử dụng, sai thì bị từ chối (CV 2061/TCHQ-GSQL).",
  }),
  f("1.38", "VALUE", "Giấy phép nhập khẩu", "code", "C", {
    maxLen: 4, codeTable: "A528", fptField: "VN_IDA.TK_SS1", amendedBy121: true,
    legalNote: "Tối đa 5: ô 1 mã phân loại giấy phép/mã xác định trước/danh mục trừ lùi (TK_SS1..5); ô 2 số giấy phép/văn bản KTCN/xác định trước/số tiếp nhận HĐ gia công (TK_SN1..5). ANQP (TT121): \"QPGP\" giấy phép NK, \"MTTB\" thông báo miễn thuế, kèm số và ngày, ví dụ \"MTTB 08TB18062025\".",
  }),
  f("1.39", "VALUE", "Phân loại hình thức hóa đơn", "code", "M", {
    maxLen: 1, codeTable: "INVOICE_KIND", fptField: "VN_IDA.TK_IV1",
    legalNote: "A hóa đơn thương mại; B chứng từ tương đương/bảng kê hóa đơn 02/BKHĐ/GSQL/không có hóa đơn; D hóa đơn điện tử đăng ký trên VNACCS.",
  }),
  f("1.40", "VALUE", "Số tiếp nhận hóa đơn điện tử", "text", "C", {
    maxLen: 12, fptField: "VN_IDA.TK_IV2",
    legalNote: "Bắt buộc khi Phân loại hình thức hóa đơn là \"D\"; không nhập được với mã khác.",
  }),
  f("1.41", "VALUE", "Số hóa đơn", "text", "C", {
    maxLen: 35, fptField: "VN_IDA.TK_IV3",
    legalNote: "Số hóa đơn thương mại hoặc chứng từ tương đương/bảng kê 02/BKHĐ/GSQL. Không có hóa đơn thương mại thì không nhập. Hàng gửi kho ngoại quan nhập nội địa nhiều lần: số hóa đơn do người bán nước ngoài phát hành.",
  }),
  f("1.42", "VALUE", "Ngày phát hành", "date", "M", {
    fptField: "VN_IDA.TK_IVD",
    legalNote: "Ngày phát hành hóa đơn thương mại (hoặc ngày lập chứng từ tương đương/bảng kê). Không có hóa đơn thương mại: nhập ngày thực hiện nghiệp vụ IDA.",
  }),
  f("1.43", "VALUE", "Phương thức thanh toán", "code", "M", {
    maxLen: 7, codeTable: "PAYMENT", fptField: "VN_IDA.TK_IVP",
    legalNote: "Mã BIENMAU, DA, CAD, CANTRU, CASH, CHEQUE, DP, GV, H-D-H, H-T-N, HPH, KHONGTT, LC, LDDT, OA, TTR, KC (KC gồm cả thanh toán TT). Hình thức khác/kết hợp: KC và ghi phương thức thực tế tại 1.50. Chủ hàng gửi kho ngoại quan: KHONGTT.",
  }),
  f("1.44", "VALUE", "Tổng trị giá hóa đơn", "decimal", "C", {
    maxLen: 20, codeTable: "PRICE_KIND", fptField: "VN_IDA.TK_IP4", amendedBy121: true,
    legalNote: "Ô 1 phân loại giá A–D (TK_IP1); ô 2 điều kiện giá, 18 mã gồm DPU, không khai được DPU thì khai DAT và ghi DPU ở 1.50 (TK_IP2); ô 3 mã tiền (TK_IP3); ô 4 tổng trị giá, VND không thập phân, ngoại tệ ≤ 4 số (TK_IP4). Gia công dùng HĐ bên thứ ba/không HĐ, mua từ phi thuế quan/kho NQ nhóm E, F: CIF.",
  }),
  f("1.45", "VALUE", "Mã phân loại khai trị giá", "code", "C", {
    maxLen: 1, codeTable: "VALUATION_METHOD", fptField: "VN_IDA_KTG.KTG_VD1",
    legalNote: "1 giống hệt; 2 tương tự; 3 khấu trừ; 4 tính toán; 6 trị giá giao dịch; 7 quan hệ đặc biệt không ảnh hưởng; 8 giao dịch, phân bổ thủ công; 9 suy luận; T đặc biệt (Đ17 TT39/2015, gia công cho NN). Nhiều phương pháp: mã dùng nhiều nhất; 6, 7 chỉ khi đủ điều kiện PP giao dịch; 0, 5, Z chưa dùng.",
  }),
  f("1.46", "VALUE", "Số tiếp nhận tờ khai trị giá tổng hợp", "text", "F", {
    unused: true,
    maxLen: 9, fptField: "VN_IDA_KTG.KTG_VD2",
    legalNote: "Cả 3 ô: không nhập dữ liệu cho đến khi có hướng dẫn mới.",
  }),
  f("1.47", "VALUE", "Phí vận chuyển", "decimal", "C", {
    maxLen: 18, codeTable: "FREIGHT_CLASS", fptField: "VN_IDA_KTG.KTG_FR3",
    legalNote: "Ô 1 mã A–F (KTG_FR1): A cước chung; B tách cước hàng FOC; C nhập một phần lô; D phân bổ theo trọng lượng/dung tích (tờ khai trị giá); E giá đã gồm cước nhưng cước thực tế vượt, khai phần chênh; F vượt cước và nhập một phần. Ô 2 mã tiền (KTG_FR2); ô 3 số tiền (KTG_FR3). Không hóa đơn: không khai.",
  }),
  f("1.48", "VALUE", "Phí bảo hiểm", "decimal", "C", {
    maxLen: 16, codeTable: "INSURANCE_CLASS", fptField: "VN_IDA_KTG.KTG_IN3",
    legalNote: "Ô 1 A bảo hiểm riêng, D không bảo hiểm, B chưa áp dụng (KTG_IN1); ô 2 mã tiền, ô 3 số tiền khi mã A (KTG_IN2, KTG_IN3); ô 4 chưa áp dụng (KTG_IN4). Không nhập được khi điều kiện giá là CIF, CIP, C&I, DDU, DDP, DAP, DAF, DAT. Không hóa đơn: không khai.",
  }),
  f("1.49", "VALUE", "Mã, tên khoản điều chỉnh", "code", "C", {
    maxLen: 1, codeTable: "ADJUSTMENT_CODE", fptField: "VN_IDA_KTG.KTG_VR1",
    legalNote: "Tối đa 5 khoản: ô 1 mã (KTG_VR1..5), cộng A, B, C, D, E, P, Q, K, M; trừ U, V, H, T, G, S, L; N khác; giảm giá theo số lượng không khai G mà ghi ở 1.50. Ô 2 AD/SB/IP/DP (KTG_VI); ô 3 mã tiền (KTG_VC); ô 4 trị giá (KTG_VP); ô 5 tổng hệ số phân bổ ≤ 1.51 (KTG_VT).",
  }),
  f("1.50", "VALUE", "Chi tiết khai trị giá", "text", "C", {
    maxLen: 280, fptField: "VN_IDA_KTG.KTG_VLD", amendedBy121: true,
    legalNote: "Ngày vận đơn DDMMYYYY#&; chi tiết khoản điều chỉnh; giá tạm tính; giảm giá chưa trừ; số hợp đồng; DPU khi khai DAT; dòng hàng FOC; PTTT thực tế khi khai KC. TT121: tham vấn 1 lần dùng nhiều lần (STT hàng, số/ngày Thông báo trị giá, mã Chi cục); \"tham vấn gián tiếp\".",
  }),
  f("1.51", "VALUE", "Tổng hệ số phân bổ trị giá tính thuế", "decimal", "C", {
    assist: true,
    maxLen: 20, fptField: "VN_IDA.TK_TP",
    legalNote: "Tổng trị giá hóa đơn trước điều chỉnh, tối đa 4 số thập phân; bắt buộc khi một hóa đơn khai nhiều tờ khai; không nhập thì hệ thống tự tính.",
  }),

  // ── Nộp thuế, hạn mức, bảo lãnh ─────────────────────────────────────
  f("1.52", "TAX", "Người nộp thuế", "code", "M", {
    maxLen: 1, codeTable: "TAX_PAYER", fptField: "VN_IDA.TK_TPM",
    legalNote: "1 người nộp thuế là người nhập khẩu; 2 là đại lý hải quan.",
  }),
  f("1.53", "TAX", "Mã lý do đề nghị BP", "code", "C", {
    maxLen: 1, codeTable: "BP_REASON", fptField: "VN_IDA.TK_BP", manual: true,
    legalNote: "Giải phóng hàng trên cơ sở bảo lãnh: A chờ xác định mã số, B chờ xác định trị giá tính thuế, C khác. Giải phóng hàng trên cơ sở nộp thuế: không nhập ô này, ghi đề nghị tại 1.50.",
  }),
  f("1.54", "TAX", "Mã ngân hàng trả thuế thay", "code", "C", {
    maxLen: 11, fptField: "VN_IDA.TK_BRC", manual: true,
    legalNote: "Mã ngân hàng do NHNN cấp, khi dùng hạn mức ngân hàng nộp thuế thay.",
  }),
  f("1.55", "TAX", "Năm phát hành hạn mức", "int", "C", {
    maxLen: 4, fptField: "VN_IDA.TK_BYA", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("1.56", "TAX", "Ký hiệu chứng từ hạn mức", "text", "C", {
    maxLen: 10, fptField: "VN_IDA.TK_BCM", manual: true,
    legalNote: "Ký hiệu chứng từ hạn mức (tối đa 10 ký tự); bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("1.57", "TAX", "Số chứng từ hạn mức", "text", "C", {
    maxLen: 10, fptField: "VN_IDA.TK_BCN", manual: true,
    legalNote: "Số chứng từ hạn mức (tối đa 10 ký tự); bắt buộc nếu đã nhập Mã ngân hàng trả thuế thay.",
  }),
  f("1.58", "TAX", "Mã xác định thời hạn nộp thuế", "code", "C", {
    maxLen: 1, codeTable: "DUE_DATE", fptField: "VN_IDA.TK_ENC", manual: true,
    legalNote: "A thời hạn nộp thuế do bảo lãnh riêng; B do bảo lãnh chung; C có thời hạn nộp thuế, không bảo lãnh; D nộp thuế ngay – cũng nhập D khi khai bổ sung để thông quan sau tạm giải phóng hàng.",
  }),
  f("1.59", "TAX", "Mã ngân hàng bảo lãnh", "code", "C", {
    maxLen: 11, fptField: "VN_IDA.TK_SBC", manual: true,
    legalNote: "Mã ngân hàng bảo lãnh do NHNN cấp.",
  }),
  f("1.60", "TAX", "Năm phát hành bảo lãnh", "int", "C", {
    maxLen: 4, fptField: "VN_IDA.TK_RYA", manual: true,
    legalNote: "4 ký tự; bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),
  f("1.61", "TAX", "Ký hiệu chứng từ bảo lãnh", "text", "C", {
    maxLen: 10, fptField: "VN_IDA.TK_SCM", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),
  f("1.62", "TAX", "Số chứng từ bảo lãnh", "text", "C", {
    maxLen: 10, fptField: "VN_IDA.TK_SCN", manual: true,
    legalNote: "Bắt buộc nếu đã nhập Mã ngân hàng bảo lãnh.",
  }),

  // ── Đính kèm, vận chuyển kết hợp, ghi chú, chỉ thị HQ ──────────────
  f("1.63", "GENERAL", "Số đính kèm khai báo điện tử", "code", "C", {
    maxLen: 3, codeTable: "A546", fptField: "VN_IDA.TK_EA1", manual: true,
    legalNote: "Tối đa 3: ô 1 mã phân loại đính kèm khai báo điện tử HYS (TK_EA1..3); ô 2 số đính kèm do HYS cấp (TK_EB1..3).",
  }),
  f("1.64", "TRANSPORT", "Ngày được phép nhập kho đầu tiên", "date", "C", {
    fptField: "VN_IDA_VANDON.VD_ISD", manual: true,
    legalNote: "Ngày được phép đưa hàng vào kho (nhiều ngày thì ngày đầu tiên); loại hình A41 nhập ngày thực hiện IDC.",
  }),
  f("1.65", "TRANSPORT", "Ngày khởi hành vận chuyển", "date", "C", {
    fptField: "VN_IDA.TK_DPD", manual: true,
    legalNote: "Chỉ nhập khi khai vận chuyển kết hợp (hàng chịu sự giám sát hải quan).",
  }),
  f("1.66", "TRANSPORT", "Thông tin trung chuyển", "code", "C", {
    maxLen: 7, codeTable: "A202", fptField: "VN_IDA.TK_ST1", manual: true,
    legalNote: "Tối đa 3 địa điểm trung chuyển cho vận chuyển bảo thuế: mã địa điểm (TK_ST1..3), ngày đến (TK_AD1..3), ngày khởi hành (TK_SD1..3).",
  }),
  f("1.67", "TRANSPORT", "Địa điểm đích cho vận chuyển bảo thuế (khai báo gộp)", "code", "C", {
    maxLen: 7, codeTable: "A202", fptField: "VN_IDA.TK_ARP", manual: true,
    legalNote: "Khai vận chuyển kết hợp: ô 1 mã địa điểm đích (TK_ARP); ô 2 ngày dự kiến đến (TK_ADT).",
  }),
  f("1.68", "GENERAL", "Phần ghi chú", "text", "O", {
    maxLen: 100, fptField: "VN_IDA.TK_NT2", amendedBy121: true,
    legalNote: "Nhiều nội dung ngăn cách \";\", ≤ 100 ký tự, vượt thì ghi tiếp ở 1.30/1.50/1.78 hoặc HYS. Gồm: #&số TK NK khi chuyển tiêu thụ nội địa; số/ngày C/O ưu đãi đặc biệt; HĐ GTGT khi mua bán với DNCX; NK tại chỗ: tên, địa chỉ người NN chỉ định nhận hàng; \"đề nghị giải phóng hàng… đang chờ KQPTPL\" (TT121).",
  }),
  f("1.69", "GENERAL", "Số quản lý của nội bộ doanh nghiệp", "text", "O", {
    maxLen: 20, fptField: "VN_IDA.TK_REF", amendedBy121: true,
    legalNote: "#&NKTC#&số TK XK tại chỗ (11 ký tự); #&GCPTQ gia công với DNCX; #&NKPTQ#&số TK XK tương ứng (DNCX – nội địa); #&1 tạm nhập cá nhân miễn thuế, #&2 dụng cụ nghề nghiệp, #&3 PT quay vòng, #&4 quà từ nước ngoài, #&5 ngoại giao, #&6 viện trợ, #&7 hàng mẫu, #&8 tài sản di chuyển, #&9 hành lý (TT121).",
  }),
  f("1.70", "GENERAL", "Phân loại chỉ thị của Hải quan", "code", "F", {
    maxLen: 1, fptField: "VN_IDA_CTHQ.CTHQ_CCM",
    legalNote: "Phần dành cho công chức hải quan: A hướng dẫn sửa đổi, B thay đổi khai báo nhập khẩu.",
  }),
  f("1.71", "GENERAL", "Ngày", "date", "F", {
    fptField: "VN_IDA_CTHQ.CTHQ_D01",
    legalNote: "Phần dành cho công chức hải quan: ngày thông báo chỉ thị tới người khai.",
  }),
  f("1.72", "GENERAL", "Tên", "text", "F", {
    maxLen: 40, fptField: "VN_IDA_CTHQ.CTHQ_T01",
    legalNote: "Phần dành cho công chức hải quan: trích yếu nội dung chỉ thị.",
  }),
  f("1.73", "GENERAL", "Nội dung", "text", "F", {
    maxLen: 140, fptField: "VN_IDA_CTHQ.CTHQ_I01",
    legalNote: "Phần dành cho công chức hải quan: nội dung chỉ thị.",
  }),
];

/** Toàn bộ chỉ tiêu Mẫu 01 (1.1–1.96) theo thứ tự Phụ lục II. */
export const CATALOG_IDA: DeclarationFieldDef[] = [...CATALOG_IDA_GENERAL, ...CATALOG_IDA_ITEMS];
