// Mẫu 01 – tờ khai nhập khẩu (IDA): bố cục đầy đủ chỉ tiêu theo ảnh mẫu CHITIEU_NHAPKHAU + Phụ lục II TT39/TT121 + VNACCS_IDA v1.2.
import { attachmentBlocks, billIdentFields, directivesBlock, fld, grp, hq, internalContractBlock, invoiceBlock, itemExtraFields, manualValueField, permitsBlock, rep, taxPaymentBlocks, transitBlock, typeGroupField } from "./shared.js";
import { withShortLabels } from "./short-labels.js";
import type { DeclarationLayout, LayoutBlock } from "./types.js";

/** Dòng hàng – phần người khai nhập (VN_IDA_HANG). */
const ITEM_DECLARANT: LayoutBlock[] = [
  {
    id: "hang", title: "Hàng hóa", items: [
      fld("HAG_CMD", "Mã số HS", "code", { no: "1.74", width: "sm" }),
      fld("HAG_GZC", "Mã quản lý riêng", "text", { no: "1.75", width: "sm" }),
      fld("HAG_MAHANG", "Mã hàng", "text", { width: "sm" }),
      fld("HAG_B29", "Mã phân loại tái xác nhận giá", "text", { width: "xs" }),
      fld("HAG_CMN", "Mô tả hàng hóa", "textarea", { no: "1.78", width: "full" }),
      grp("Số lượng (1)", "1.83", [fld("HAG_QN1", "Số lượng", "number", { width: "sm" }), fld("HAG_QT1", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" })]),
      grp("Số lượng (2)", "1.84", [fld("HAG_QN2", "Số lượng", "number", { width: "sm" }), fld("HAG_QT2", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" })]),
      fld("HAG_BPR", "Trị giá hóa đơn", "number", { no: "1.85", width: "md" }),
      ...itemExtraFields,
      grp("Đơn giá hóa đơn", "1.86", [fld("HAG_UPR", "Đơn giá", "number", { width: "sm" }), fld("HAG_UPC", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }), fld("HAG_TSC", "Đơn vị của đơn giá", "code", { codeTable: "UNIT", width: "xs" })]),
      rep("Số của mục khai khoản điều chỉnh", "1.88", 5, [fld("HAG_VN{n}", "Mục", "number", { width: "xs" })]),
    ],
  },
  {
    id: "thue-nk", title: "Thuế nhập khẩu", items: [
      fld("HAG_OR", "Mã nước xuất xứ", "code", { no: "1.79", codeTable: "COUNTRY", width: "xs" }),
      fld("HAG_ORS", "Mã biểu thuế nhập khẩu", "code", { no: "1.80", codeTable: "TAX_TABLE", width: "xs" }),
      fld("HAG_KWS", "Mã ngoài hạn ngạch", "text", { no: "1.81", width: "xs" }),
      fld("HAG_TXA", "Thuế suất (nhập tay khi hệ thống không tự xác định)", "number", { no: "1.76", width: "sm" }),
      fld("HAG_SPD", "Mã áp dụng mức thuế tuyệt đối", "code", { codeTable: "ABS_TAX", no: "1.82", width: "sm" }),
      grp("Mức thuế tuyệt đối", "1.77", [fld("HAG_TXB", "Mức thuế", "number", { width: "sm" }), fld("HAG_TXC", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" }), fld("HAG_TXD", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" })]),
      manualValueField,
      grp("Trị giá tính thuế (phân bổ thủ công)", "1.87", [fld("HAG_DPR", "Trị giá tính thuế", "number", { width: "md" }), fld("HAG_BPC", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" })], { condition: "MANUAL_VALUE" }),
      fld("HAG_TDL", "STT dòng hàng trên tờ khai TN-TX tương ứng", "number", { no: "1.89", width: "xs" }),
      fld("HAG_TXN", "Danh mục miễn thuế nhập khẩu", "text", { no: "1.90", width: "md" }),
      fld("HAG_TXR", "Số dòng trong danh mục miễn thuế", "number", { no: "1.91", width: "xs" }),
      fld("HAG_RE", "Mã miễn/giảm/không chịu thuế nhập khẩu", "code", { no: "1.92", codeTable: "A520", width: "sm" }),
      fld("HAG_REG", "Số tiền giảm thuế nhập khẩu", "number", { no: "1.93", width: "md" }),
    ],
  },
  {
    id: "thu-khac", title: "Thuế và thu khác", items: [
      rep("Khoản thuế và thu khác (1 chống bán phá giá · 2 chống phân biệt đối xử · 3 TTĐB · 4 BVMT · 5 GTGT)", undefined, 5, [
        fld("HAG_TX{n}", "Mã áp dụng thuế suất", "code", { codeTable: "OTHER_TAX", no: "1.94", width: "sm" }),
        fld("HAG_TR{n}", "Mã miễn/giảm/không chịu thuế", "code", { no: "1.95", codeTable: "A520", width: "sm" }),
        fld("HAG_TG{n}", "Số tiền giảm", "number", { no: "1.96", width: "sm" }),
      ]),
    ],
  },
];

/** Dòng hàng – phần Hải quan tính. */
const ITEM_CUSTOMS: LayoutBlock[] = [
  {
    id: "hq-thue-nk", title: "Hải quan tính – thuế nhập khẩu", emptyNote: "Có sau khi khai tạm (IDA).", items: [
      grp("Trị giá tính thuế", undefined, [hq("HAG_B36", "Trị giá tính thuế (S)", "number"), hq("HAG_B50", "Mã tiền", "text", { width: "xs" }), hq("HAG_B51", "Trị giá tính thuế (M)", "number")]),
      grp("Số lượng tính thuế", undefined, [hq("HAG_B37", "Số lượng", "number"), hq("HAG_B38", "Đơn vị tính", "text", { width: "xs" })]),
      grp("Đơn giá tính thuế", undefined, [hq("HAG_KKT", "Đơn giá", "number"), hq("HAG_KKS", "Mã tiền", "text", { width: "xs" })]),
      grp("Thuế suất", undefined, [hq("HAG_B42", "Mã phân loại thuế suất", "text", { width: "xs" }), hq("HAG_B43", "Thuế suất", "text", { width: "sm" }), hq("HAG_SKB", "Phân loại nhập thuế suất", "text", { width: "xs" })]),
      hq("HAG_B47", "Số tiền thuế nhập khẩu", "number"),
      hq("HAG_B49", "Số tiền miễn giảm", "number"),
      hq("HAG_B56", "Tên nơi xuất xứ", "text"),
      hq("HAG_B59", "Điều khoản miễn/giảm/không chịu thuế", "textarea", { width: "full" }),
    ],
  },
  {
    id: "hq-thu-khac", title: "Hải quan tính – thuế và thu khác", emptyNote: "Có sau khi khai tạm (IDA).", items: [
      rep("Khoản thu khác", undefined, 5, [
        hq("HAG_KQ{n}", "Tên", "text", { width: "sm" }),
        hq("HAG_KS{n}", "Trị giá tính thuế", "number"),
        hq("HAG_KT{n}", "Số lượng tính thuế", "number"),
        hq("HAG_KU{n}", "Đơn vị", "text", { width: "xs" }),
        hq("HAG_KY{n}", "Thuế suất", "text", { width: "sm" }),
        hq("HAG_KZ{n}", "Số tiền thuế", "number"),
        hq("HAG_LB{n}", "Số tiền miễn giảm", "number"),
        hq("HAG_LC{n}", "Điều khoản miễn giảm", "text", { width: "lg" }),
      ]),
    ],
  },
];

export const LAYOUT_IDA: DeclarationLayout = withShortLabels({
  kind: "IDA",
  summary: [
    hq("TK_ICN", "Số tờ khai", "text", { no: "1.1" }),
    hq("TK_LUONG", "Kết quả phân luồng", "code"),
    hq("TK_THONGQUAN", "Thông quan", "code"),
    hq("TK_A09", "Ngày đăng ký", "date"),
  ],
  declarant: [
    {
      id: "chung", title: "Thông tin chung", blocks: [
        {
          id: "to-khai", title: "Tờ khai", items: [
            typeGroupField,
            fld("TK_ICB", "Mã loại hình", "code", { no: "1.4", codeTable: "TYPE_CODE", width: "sm" }),
            fld("TK_CCC", "Mã phân loại hàng hóa", "code", { no: "1.5", codeTable: "CARGO_CLASS", width: "xs" }),
            fld("TK_MTC", "Mã phương thức vận chuyển", "code", { no: "1.6", codeTable: "TRANSPORT_MODE", width: "sm" }),
            fld("TK_SKB", "Phân loại cá nhân/tổ chức", "code", { no: "1.7", codeTable: "PARTY_CLASS", width: "sm" }),
            fld("TK_CH", "Cơ quan hải quan", "code", { no: "1.8", codeTable: "A038", width: "sm" }),
            fld("TK_CHB", "Bộ phận xử lý tờ khai", "code", { no: "1.9", codeTable: "A014", width: "xs" }),
            fld("TK_ICD", "Ngày khai báo (dự kiến)", "date", { no: "1.11", width: "sm" }),
          ],
        },
        {
          id: "chia-nho", title: "Tờ khai chia nhỏ, tạm nhập – tái xuất", items: [
            grp("Số tờ khai đầu tiên / số nhánh / tổng số", "1.2", [fld("TK_FIC", "Số tờ khai đầu tiên (tờ đầu ghi F)", "text", { width: "md" }), fld("TK_BNO", "Số nhánh", "number", { width: "xs" }), fld("TK_DNO", "Tổng số", "number", { width: "xs" })]),
            fld("TK_TDN", "Số tờ khai tạm xuất tương ứng", "text", { no: "1.3", width: "md", condition: "RE_IMPORT" }),
            fld("TK_RED", "Thời hạn tái xuất", "date", { no: "1.10", width: "sm", condition: "TEMP_IMPORT" }),
          ],
        },
      ],
    },
    {
      id: "cac-ben", title: "Đơn vị xuất nhập khẩu", blocks: [
        {
          id: "nguoi-nhap-khau", title: "Người nhập khẩu", items: [
            // Ô ngắn chung một hàng đầu khối, tên / địa chỉ (cả hàng) bên dưới.
            fld("TK_IMC", "Mã người nhập khẩu (MST)", "text", { no: "1.12", width: "sm" }),
            fld("TK_IMY", "Mã bưu chính", "text", { no: "1.14", width: "xs" }),
            fld("TK_IMT", "Số điện thoại", "text", { no: "1.16", width: "sm" }),
            fld("TK_IMN", "Tên người nhập khẩu", "textarea", { no: "1.13", width: "full" }),
            fld("TK_IMA", "Địa chỉ", "textarea", { no: "1.15", width: "full" }),
          ],
        },
        { id: "uy-thac-nk", title: "Người ủy thác nhập khẩu", items: [fld("TK_NMC", "Mã người ủy thác nhập khẩu", "text", { no: "1.17", width: "sm" }), fld("TK_NMN", "Tên người ủy thác nhập khẩu", "text", { no: "1.18", width: "lg" })] },
        {
          id: "nguoi-xuat-khau", title: "Người xuất khẩu", items: [
            fld("TK_EPC", "Mã người xuất khẩu", "text", { no: "1.19", width: "sm" }),
            fld("TK_EPY", "Mã bưu chính", "text", { no: "1.21", width: "xs" }),
            fld("TK_EPO", "Mã nước", "code", { no: "1.23", codeTable: "COUNTRY", width: "xs" }),
            fld("TK_EPN", "Tên người xuất khẩu", "text", { no: "1.20", width: "lg" }),
            grp("Địa chỉ (4 dòng × 35 ký tự)", "1.22", [fld("TK_EPA", "Dòng 1 – đường, số nhà", "text", { width: "lg" }), fld("TK_EP2", "Dòng 2", "text", { width: "lg" }), fld("TK_EP3", "Dòng 3 – thành phố", "text", { width: "lg" }), fld("TK_EP4", "Dòng 4 – tỉnh/bang, nước", "text", { width: "lg" })]),
          ],
        },
        { id: "uy-thac-xk", title: "Người ủy thác xuất khẩu", items: [fld("TK_ENM", "Tên người ủy thác xuất khẩu", "text", { no: "1.24", width: "lg" })] },
        { id: "dai-ly", title: "Đại lý hải quan", items: [fld("TK_ICC", "Mã đại lý hải quan", "text", { no: "1.25", width: "sm" })] },
      ],
    },
    {
      id: "van-chuyen", title: "Vận đơn & vận chuyển", blocks: [
        {
          id: "van-don", title: "Vận đơn", items: [
            ...billIdentFields,
            // Cạnh ô HAWB (hàng không) – cùng là ô theo tình huống của phương thức vận chuyển, đóng khung để dễ nhận ra.
            fld("VD_COC", "Số lượng container", "number", { no: "1.35", width: "xs", condition: "IN_CONTAINER", framed: true }),
            rep("Số vận đơn", "1.26", 5, [
              fld("VD_BL{n}", "Số vận đơn", "text", { width: "md" }),
              fld("APP_NGAY_VD{n}", "Ngày vận đơn", "date", { width: "sm" }),
              fld("APP_HAWB{n}", "Số HAWB", "text", { width: "md", condition: "HAS_HAWB" }),
            ]),
            grp("Số kiện", "1.27", [fld("VD_NO", "Số lượng kiện", "number", { width: "sm" }), fld("VD_NOT", "Loại kiện", "code", { codeTable: "PACKAGE_KIND", width: "xs" })]),
            grp("Tổng trọng lượng (Gross)", "1.28", [fld("VD_GW", "Trọng lượng", "number", { width: "sm" }), fld("VD_GWT", "Đơn vị", "code", { codeTable: "UNIT", width: "xs" })]),
            fld("VD_MRK", "Ký hiệu và số hiệu", "textarea", { no: "1.30", width: "full" }),
          ],
        },
        {
          id: "dia-diem", title: "Địa điểm và phương tiện", items: [
            fld("VD_ST", "Mã địa điểm lưu kho hàng chờ thông quan", "code", { no: "1.29", codeTable: "A202", width: "sm" }),
            grp("Địa điểm dỡ hàng", "1.33", [fld("VD_DST", "Mã", "code", { codeTable: "A016", width: "sm" }), fld("VD_DSN", "Tên", "text", { width: "md" })]),
            grp("Địa điểm xếp hàng", "1.34", [fld("VD_PSC", "Mã", "code", { codeTable: "A016", width: "sm" }), fld("VD_PSN", "Tên", "text", { width: "md" })]),
            grp("Phương tiện vận chuyển", "1.31", [fld("VD_VSC", "Hô hiệu (call sign)", "text", { width: "sm", condition: "BY_WATER" }), fld("VD_VSN", "Tên phương tiện / chuyến", "text", { width: "md" })]),
            fld("VD_ARR", "Ngày hàng đến", "date", { no: "1.32", width: "sm" }),
            fld("TK_N4", "Mã kết quả kiểm tra nội dung", "code", { no: "1.36", width: "xs" }),
            fld("VD_ISD", "Ngày được phép nhập kho đầu tiên", "date", { no: "1.64", width: "sm" }),
          ],
        },
        transitBlock("IDA"),
      ],
    },
    {
      id: "giay-phep", title: "Văn bản & giấy phép", blocks: [
        { id: "van-ban", title: "Văn bản pháp quy khác", items: [rep("Mã văn bản pháp quy khác (hàng chương 84/85: ô 1 là MO hoặc CU)", "1.37", 5, [fld("TK_OL{n}", "Mã", "code", { codeTable: "A519", width: "xs" })])] },
        permitsBlock("IDA"),
      ],
    },
    {
      id: "hoa-don-tri-gia", title: "Hóa đơn, hợp đồng & trị giá", blocks: [
        invoiceBlock("IDA"),
        internalContractBlock,
        {
          id: "to-khai-tri-gia", title: "Tờ khai trị giá", items: [
            fld("KTG_VD1", "Mã phân loại khai trị giá", "code", { no: "1.45", codeTable: "VALUATION_METHOD", width: "sm" }),
            grp("Khai trị giá tổng hợp (chưa sử dụng)", "1.46", [fld("KTG_VD2", "Số tiếp nhận", "text", { width: "sm" }), fld("KTG_A93", "Công thức chuẩn", "text", { width: "xs" }), fld("KTG_A94", "Mã điều chỉnh", "text", { width: "xs" }), fld("KTG_A95", "Phương pháp điều chỉnh", "text", { width: "xs" }), fld("KTG_VCC", "Mã tiền giá cơ sở", "text", { width: "xs" }), fld("KTG_VPC", "Giá cơ sở", "number", { width: "sm" })]),
            fld("TK_TP", "Tổng hệ số phân bổ trị giá", "number", { no: "1.51", width: "sm" }),
            fld("KTG_VLD", "Chi tiết khai trị giá", "textarea", { no: "1.50", width: "full" }),
          ],
        },
        {
          id: "phi", title: "Phí vận chuyển và bảo hiểm", items: [
            grp("Phí vận chuyển", "1.47", [fld("KTG_FR1", "Phân loại", "code", { codeTable: "FREIGHT_CLASS", width: "xs" }), fld("KTG_FR2", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }), fld("KTG_FR3", "Số tiền", "number", { width: "md" })]),
            grp("Phí bảo hiểm", "1.48", [fld("KTG_IN1", "Phân loại", "code", { codeTable: "INSURANCE_CLASS", width: "xs" }), fld("KTG_IN2", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }), fld("KTG_IN3", "Số tiền", "number", { width: "md" }), fld("KTG_IN4", "Số đăng ký bảo hiểm", "text", { width: "md" })]),
          ],
        },
        {
          id: "dieu-chinh", title: "Các khoản điều chỉnh", items: [
            rep("Khoản điều chỉnh", "1.49", 5, [
              fld("KTG_VR{n}", "Mã tên", "code", { codeTable: "ADJUSTMENT_CODE", width: "xs" }),
              fld("KTG_VI{n}", "Mã phân loại", "code", { codeTable: "ADJUSTMENT_KIND", width: "xs" }),
              fld("KTG_VC{n}", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }),
              fld("KTG_VP{n}", "Trị giá khoản điều chỉnh", "number", { width: "md" }),
              fld("KTG_VT{n}", "Tổng hệ số phân bổ", "number", { width: "md" }),
              fld("APP_PB{n}", "Phân bổ phí", "choice", { options: [{ value: "1", label: "Cho tất cả dòng hàng" }] }),
            ]),
          ],
        },
      ],
    },
    { id: "thue-bao-lanh", title: "Thuế & bảo lãnh", blocks: taxPaymentBlocks("IDA") },
    { id: "dinh-kem", title: "Đính kèm & ghi chú", blocks: attachmentBlocks("IDA") },
  ],
  customs: [
    {
      id: "dang-ky", title: "Đăng ký tờ khai", blocks: [
        {
          id: "dang-ky", title: "Đăng ký", emptyNote: "Có sau khi khai tạm (IDA): số tờ khai; sau khai chính thức (IDC): ngày giờ đăng ký, phân luồng.", items: [
            hq("TK_ICN", "Số tờ khai", "text", { no: "1.1" }),
            grp("Ngày giờ đăng ký", undefined, [hq("TK_A09", "Ngày", "date"), hq("TK_AD11", "Giờ", "time")]),
            grp("Ngày giờ thay đổi đăng ký", undefined, [hq("TK_AD21", "Ngày", "date"), hq("TK_AD31", "Giờ", "time")]),
            hq("TK_A06", "Mã phân loại kiểm tra", "code", { width: "xs" }),
            hq("TK_A07", "Tên cơ quan hải quan", "text"),
            hq("TK_A00", "Mã số hàng hóa đại diện", "text", { width: "sm" }),
            grp("Tổng số trang / dòng hàng", undefined, [hq("TK_B12", "Số trang", "number", { width: "xs" }), hq("TK_B13", "Số dòng", "number", { width: "xs" })]),
            hq("TK_JKN", "Phân loại xuất báo cáo sửa đổi", "text", { width: "xs" }),
            hq("TK_AAA", "Biểu thị trường hợp hết hạn", "text", { width: "xs" }),
            grp("Đại lý hải quan (hệ thống ghi nhận)", undefined, [hq("TK_A37", "Mã đại lý", "text", { width: "sm" }), hq("TK_A38", "Tên đại lý", "text"), hq("TK_A39", "Mã nhân viên", "text", { width: "sm" })]),
            hq("TK_TRANGTHAI", "Trạng thái khai báo", "code", { width: "sm" }),
            hq("TK_LUONG", "Kết quả phân luồng", "code", { width: "sm" }),
            hq("TK_THONGQUAN", "Thông quan", "code", { width: "sm" }),
            hq("VD_A51", "Tên địa điểm lưu kho (hệ thống hiện theo mã)", "text"),
          ],
        },
      ],
    },
    {
      id: "thue", title: "Thuế tờ khai", blocks: [
        {
          id: "sac-thue", title: "Thuế theo sắc thuế", emptyNote: "Có sau khi khai tạm (IDA) – Hải quan tính thuế chính thức.", items: [
            rep("Sắc thuế", undefined, 6, [hq("THUE_KF{n}", "Mã", "text", { width: "xs" }), hq("THUE_KG{n}", "Tên sắc thuế", "text", { width: "sm" }), hq("THUE_KH{n}", "Tổng tiền thuế (VND)", "number"), hq("THUE_KI{n}", "Số dòng", "number", { width: "xs" })]),
            hq("THUE_B02", "Tổng tiền thuế phải nộp (VND)", "number"),
            hq("THUE_B03", "Số tiền bảo lãnh (VND)", "number"),
            rep("Tỷ giá tính thuế", undefined, 3, [hq("THUE_KJ{n}", "Mã tiền", "text", { width: "xs" }), hq("THUE_KK{n}", "Tỷ giá", "number")]),
            hq("TK_A86", "Tổng trị giá tính thuế", "number"),
            hq("TK_A97", "Mã phân loại nhập liệu tổng giá cơ bản", "text", { width: "xs" }),
            hq("TK_B08", "Phân loại nộp thuế", "text", { width: "xs" }),
          ],
        },
        {
          id: "an-han", title: "Ân hạn thuế", emptyNote: "Có khi tờ khai được ân hạn nộp thuế.", items: [
            rep("Sắc thuế được ân hạn", undefined, 6, [hq("TK_KN{n}", "Mã", "text", { width: "xs" }), hq("TK_KO{n}", "Tên sắc thuế", "text"), hq("TK_KP{n}", "Hạn nộp sau ân hạn", "date")]),
          ],
        },
      ],
    },
    { id: "chi-thi", title: "Chỉ thị Hải quan", blocks: [directivesBlock("IDA")] },
    {
      id: "thong-quan", title: "Thông quan", blocks: [
        {
          id: "thong-quan", title: "Cấp phép và kiểm tra", emptyNote: "Có khi Hải quan cấp phép thông quan / hoàn thành kiểm tra.", items: [
            grp("Cấp phép", undefined, [hq("TK_C21", "Ngày cấp phép", "date"), hq("TK_AD4", "Giờ", "time"), hq("TK_C20", "Trưởng đơn vị Hải quan", "text")]),
            grp("Hoàn thành kiểm tra", undefined, [hq("TK_C22", "Ngày", "date"), hq("TK_AD5", "Giờ", "time")]),
            grp("Giải phóng hàng (BP)", undefined, [hq("TK_C24", "Ngày phê duyệt BP", "date"), hq("TK_AD6", "Giờ", "time"), hq("TK_C25", "Ngày hoàn thành kiểm tra BP", "date"), hq("TK_AD7", "Giờ", "time")]),
            hq("TK_C23", "Phân loại thẩm tra sau thông quan", "text", { width: "xs" }),
            grp("Hủy / chuyển thủ công", undefined, [hq("TK_B31", "Ngày hủy", "date"), hq("TK_AD8", "Giờ hủy", "time"), hq("TK_B32", "Ngày chuyển thủ công", "date"), hq("TK_AD9", "Giờ", "time")]),
          ],
        },
      ],
    },
  ],
  item: { columns: ["HAG_CMD", "HAG_CMN", "HAG_QN1", "HAG_QT1", "HAG_BPR", "HAG_OR"], declarant: ITEM_DECLARANT, customs: ITEM_CUSTOMS },
});
