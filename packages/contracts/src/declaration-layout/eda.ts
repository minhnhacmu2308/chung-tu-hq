// Mẫu 02 – tờ khai xuất khẩu (EDA): bố cục đầy đủ chỉ tiêu theo ảnh mẫu CHITIEU_XUATKHAU + Phụ lục II TT39/TT121 + VNACCS_EDA v1.2.
import { attachmentBlocks, directivesBlock, fld, grp, hq, internalContractBlock, invoiceBlock, itemExtraFields, manualValueField, permitsBlock, rep, taxPaymentBlocks, transitBlock, typeGroupField } from "./shared.js";
import { withShortLabels } from "./short-labels.js";
import type { DeclarationLayout, LayoutBlock } from "./types.js";

/** Dòng hàng – phần người khai nhập (VN_EDA_HANG). */
const ITEM_DECLARANT: LayoutBlock[] = [
  {
    id: "hang", title: "Hàng hóa", items: [
      fld("HAG_CMD", "Mã số hàng hóa", "code", { no: "2.65", width: "sm" }),
      fld("HAG_COC", "Mã quản lý riêng", "text", { no: "2.66", width: "sm" }),
      fld("HAG_MAHANG", "Mã hàng", "text", { width: "sm" }),
      fld("APP_XUAT_XU", "Xuất xứ", "code", { codeTable: "COUNTRY", width: "xs" }),
      fld("HAG_R03", "Mã phân loại tái xác nhận giá", "text", { width: "xs" }),
      fld("HAG_CMN", "Mô tả hàng hóa (kèm #&mã nước xuất xứ)", "textarea", { no: "2.69", width: "full" }),
      grp("Số lượng (1)", "2.72", [fld("HAG_QN1", "Số lượng", "number", { width: "sm" }), fld("HAG_QT1", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" })]),
      grp("Số lượng (2)", "2.73", [fld("HAG_QN2", "Số lượng", "number", { width: "sm" }), fld("HAG_QT2", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" })]),
      fld("HAG_BPR", "Trị giá hóa đơn", "number", { no: "2.74", width: "md" }),
      ...itemExtraFields,
      grp("Đơn giá hóa đơn", "2.75", [fld("HAG_UPR", "Đơn giá", "number", { width: "sm" }), fld("HAG_UPC", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }), fld("HAG_TSC", "Đơn vị của đơn giá", "code", { codeTable: "UNIT", width: "xs" })]),
    ],
  },
  {
    id: "thue-xk", title: "Thuế xuất khẩu", items: [
      fld("HAG_TXA", "Thuế suất (nhập tay khi hệ thống không tự xác định)", "number", { no: "2.67", width: "sm" }),
      grp("Mức thuế tuyệt đối", "2.68", [fld("HAG_TXB", "Mức thuế", "number", { width: "sm" }), fld("HAG_TXC", "Đơn vị tính", "code", { codeTable: "UNIT", width: "xs" }), fld("HAG_TXD", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" })]),
      manualValueField,
      grp("Trị giá tính thuế (phân bổ thủ công)", "2.76", [fld("HAG_DPR", "Trị giá tính thuế", "number", { width: "md" }), fld("HAG_BPC", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" })], { condition: "MANUAL_VALUE" }),
      fld("HAG_TDL", "STT dòng hàng trên tờ khai TN-TX tương ứng", "number", { no: "2.77", width: "xs" }),
      fld("HAG_TXN", "Danh mục miễn thuế xuất khẩu", "text", { no: "2.78", width: "md" }),
      fld("HAG_ADE", "Số dòng trong danh mục miễn thuế", "number", { no: "2.79", width: "xs" }),
      fld("HAG_RE", "Mã miễn/giảm/không chịu thuế xuất khẩu", "code", { no: "2.70", codeTable: "A520", width: "sm" }),
      fld("HAG_REG", "Số tiền giảm thuế xuất khẩu", "number", { no: "2.71", width: "md" }),
      rep("Mã văn bản pháp luật khác", "2.80", 5, [fld("HAG_OL{n}", "Mã", "code", { codeTable: "A519", width: "xs" })]),
    ],
  },
  {
    id: "le-phi-bao-hiem", title: "Tiền lệ phí và tiền bảo hiểm", items: [
      grp("Tiền lệ phí", undefined, [fld("HAG_CUP", "Đơn giá", "number", { width: "sm" }), fld("HAG_CQU", "Số lượng", "number", { width: "sm" }), fld("HAG_CQC", "Đơn vị", "code", { codeTable: "UNIT", width: "xs" }), fld("HAG_CPR", "Khoản tiền (VND)", "number", { width: "md" })]),
      grp("Tiền bảo hiểm", undefined, [fld("HAG_IUP", "Đơn giá", "number", { width: "sm" }), fld("HAG_IQU", "Số lượng", "number", { width: "sm" }), fld("HAG_IQC", "Đơn vị", "code", { codeTable: "UNIT", width: "xs" }), fld("HAG_IPR", "Khoản tiền (VND)", "number", { width: "md" })]),
    ],
  },
];

/** Dòng hàng – phần Hải quan tính. */
const ITEM_CUSTOMS: LayoutBlock[] = [
  {
    id: "hq-thue-xk", title: "Hải quan tính – thuế xuất khẩu", emptyNote: "Có sau khi khai tạm (EDA).", items: [
      grp("Trị giá tính thuế (S)", undefined, [hq("HAG_R07", "Trị giá", "number"), hq("HAG_ADB", "Mã tiền thuế", "text", { width: "xs" })]),
      grp("Trị giá tính thuế (M)", undefined, [hq("HAG_R15", "Trị giá", "number"), hq("HAG_R14", "Mã tiền", "text", { width: "xs" })]),
      grp("Số lượng tính thuế", undefined, [hq("HAG_TSQ", "Số lượng", "number"), hq("HAG_TSU", "Đơn vị", "text", { width: "xs" })]),
      grp("Đơn giá tính thuế", undefined, [hq("HAG_CVU", "Đơn giá", "number"), hq("HAG_ADA", "Mã tiền", "text", { width: "xs" }), hq("HAG_QCV", "Đơn vị", "text", { width: "xs" })]),
      grp("Thuế suất", undefined, [hq("HAG_TRA", "Thuế suất", "text", { width: "sm" }), hq("HAG_TRM", "Phân loại nhập thuế suất", "text", { width: "xs" })]),
      grp("Số tiền thuế", undefined, [hq("HAG_TAX", "Số tiền thuế", "number"), hq("HAG_ADC", "Mã tiền số tiền giảm", "text", { width: "xs" })]),
      hq("HAG_TRL", "Điều khoản miễn/giảm/không chịu thuế", "textarea", { width: "full" }),
    ],
  },
];

export const LAYOUT_EDA: DeclarationLayout = withShortLabels({
  kind: "EDA",
  summary: [
    hq("TK_ECN", "Số tờ khai", "text", { no: "2.1" }),
    hq("TK_LUONG", "Kết quả phân luồng", "code"),
    hq("TK_THONGQUAN", "Thông quan", "code"),
    hq("TK_K10", "Ngày đăng ký", "date"),
  ],
  declarant: [
    {
      id: "chung", title: "Thông tin chung", blocks: [
        {
          id: "to-khai", title: "Tờ khai", items: [
            typeGroupField,
            fld("TK_ECB", "Mã loại hình", "code", { no: "2.4", codeTable: "TYPE_CODE", width: "sm" }),
            fld("TK_CCC", "Mã phân loại hàng hóa", "code", { no: "2.5", codeTable: "CARGO_CLASS", width: "xs" }),
            fld("TK_MTC", "Mã phương thức vận chuyển", "code", { no: "2.6", codeTable: "TRANSPORT_MODE", width: "sm" }),
            fld("TK_CH", "Cơ quan hải quan", "code", { no: "2.8", codeTable: "A038", width: "sm" }),
            fld("TK_CHB", "Bộ phận xử lý tờ khai", "code", { no: "2.9", codeTable: "A014", width: "xs" }),
            fld("TK_ECD", "Ngày khai báo (dự kiến)", "date", { no: "2.10", width: "sm" }),
          ],
        },
        {
          id: "chia-nho", title: "Tờ khai chia nhỏ, tạm xuất – tái nhập", items: [
            grp("Số tờ khai đầu tiên / số nhánh / tổng số", "2.2", [fld("TK_FIC", "Số tờ khai đầu tiên (tờ đầu ghi F)", "text", { width: "md" }), fld("TK_BNO", "Số nhánh", "number", { width: "xs" }), fld("TK_DNO", "Tổng số", "number", { width: "xs" })]),
            fld("TK_TDN", "Số tờ khai tạm nhập tương ứng", "text", { no: "2.3", width: "md", condition: "RE_EXPORT" }),
            fld("TK_RID", "Thời hạn tái nhập khẩu", "date", { no: "2.7", width: "sm", condition: "TEMP_EXPORT" }),
          ],
        },
      ],
    },
    {
      id: "cac-ben", title: "Đơn vị xuất nhập khẩu", blocks: [
        {
          id: "nguoi-xuat-khau", title: "Người xuất khẩu", items: [
            // Ô ngắn chung một hàng đầu khối, tên / địa chỉ (cả hàng) bên dưới.
            fld("TK_EPC", "Mã người xuất khẩu (MST)", "text", { no: "2.11", width: "sm" }),
            fld("TK_EPP", "Mã bưu chính", "text", { no: "2.13", width: "xs" }),
            fld("TK_EPT", "Số điện thoại", "text", { no: "2.15", width: "sm" }),
            fld("TK_EPN", "Tên người xuất khẩu", "textarea", { no: "2.12", width: "full" }),
            fld("TK_EPA", "Địa chỉ", "textarea", { no: "2.14", width: "full" }),
          ],
        },
        { id: "uy-thac-xk", title: "Người ủy thác xuất khẩu", items: [fld("TK_EXC", "Mã người ủy thác xuất khẩu", "text", { no: "2.16", width: "sm" }), fld("TK_EXN", "Tên người ủy thác xuất khẩu", "text", { no: "2.17", width: "lg" })] },
        {
          id: "nguoi-nhap-khau", title: "Người nhập khẩu", items: [
            fld("TK_CGC", "Mã người nhập khẩu", "text", { no: "2.18", width: "sm" }),
            fld("TK_CGP", "Mã bưu chính", "text", { no: "2.20", width: "xs" }),
            fld("TK_CGK", "Mã nước", "code", { no: "2.22", codeTable: "COUNTRY", width: "xs" }),
            fld("TK_CGN", "Tên người nhập khẩu", "text", { no: "2.19", width: "lg" }),
            grp("Địa chỉ (4 dòng × 35 ký tự)", "2.21", [fld("TK_CGA", "Dòng 1 – đường, số nhà", "text", { width: "lg" }), fld("TK_CAT", "Dòng 2", "text", { width: "lg" }), fld("TK_CAC", "Dòng 3 – thành phố", "text", { width: "lg" }), fld("TK_CAS", "Dòng 4 – tỉnh/bang, nước", "text", { width: "lg" })]),
          ],
        },
        { id: "dai-ly", title: "Đại lý hải quan", items: [fld("TK_ECC", "Mã đại lý hải quan", "text", { no: "2.23", width: "sm" })] },
      ],
    },
    {
      id: "van-chuyen", title: "Vận đơn & vận chuyển", blocks: [
        {
          id: "van-don", title: "Vận đơn", items: [
            // Theo ảnh tạo mới: chỉ một ô số vận đơn; chọn định danh đường biển / hàng không nằm trong panel Khai mã định danh hàng hóa.
            fld("TK_EKN", "Số vận đơn / số quản lý hàng hóa", "text", { no: "2.24", width: "md" }),
            grp("Số kiện", "2.25", [fld("TK_NO", "Số lượng kiện", "number", { width: "sm" }), fld("TK_NOT", "Loại kiện", "code", { codeTable: "PACKAGE_KIND", width: "xs" })]),
            grp("Tổng trọng lượng (Gross)", "2.26", [fld("TK_GW", "Trọng lượng", "number", { width: "sm" }), fld("TK_GWT", "Đơn vị", "code", { codeTable: "UNIT", width: "xs" })]),
            fld("TK_MRK", "Ký hiệu và số hiệu", "textarea", { no: "2.32", width: "full" }),
          ],
        },
        {
          id: "dia-diem", title: "Địa điểm và phương tiện", items: [
            fld("TK_ST", "Mã địa điểm lưu kho hàng chờ thông quan", "code", { no: "2.27", codeTable: "A202", width: "sm" }),
            grp("Địa điểm nhận hàng cuối cùng", "2.28", [fld("TK_DSC", "Mã", "code", { codeTable: "A016", width: "sm" }), fld("TK_DSN", "Tên", "text", { width: "md" })]),
            grp("Địa điểm xếp hàng", "2.29", [fld("TK_PSC", "Mã", "code", { codeTable: "A016", width: "sm" }), fld("TK_PSN", "Tên", "text", { width: "md" })]),
            grp("Phương tiện vận chuyển dự kiến", "2.30", [fld("TK_VSC", "Hô hiệu (call sign)", "text", { width: "sm", condition: "BY_WATER" }), fld("TK_VSN", "Tên phương tiện / chuyến", "text", { width: "md" })]),
            fld("TK_SYM", "Ngày hàng đi dự kiến", "date", { no: "2.31", width: "sm" }),
          ],
        },
        {
          id: "container", title: "Container", condition: "IN_CONTAINER", actions: [{ id: "copy-cont", label: "Copy số cont từ tờ khai khác" }], items: [
            grp("Địa điểm xếp hàng lên xe chở hàng (vanning)", "2.59", [
              fld("CON_VC1", "Mã 1", "code", { width: "xs" }), fld("CON_VC2", "Mã 2", "code", { width: "xs" }), fld("CON_VC3", "Mã 3", "code", { width: "xs" }), fld("CON_VC4", "Mã 4", "code", { width: "xs" }), fld("CON_VC5", "Mã 5", "code", { width: "xs" }),
              fld("CON_VN", "Tên", "text", { width: "lg" }), fld("CON_VA", "Địa chỉ", "text", { width: "lg" }),
            ], { fill: "any" }),
            rep("Số container", "2.60", 50, [fld("CON_C{nn}", "Số container", "text", { width: "sm" })]),
          ],
        },
        transitBlock("EDA"),
      ],
    },
    { id: "giay-phep", title: "Văn bản & giấy phép", blocks: [permitsBlock("EDA")] },
    {
      id: "hoa-don-tri-gia", title: "Hóa đơn, hợp đồng & trị giá", blocks: [
        invoiceBlock("EDA"),
        internalContractBlock,
        {
          id: "tri-gia", title: "Trị giá tính thuế", items: [
            grp("Trị giá tính thuế", "2.40", [fld("TK_FCD", "Mã tiền", "code", { codeTable: "CURRENCY", width: "xs" }), fld("TK_FKK", "Trị giá tính thuế", "number", { width: "md" })], { condition: "EXPORT_VALUE" }),
            fld("TK_CNV", "Phân loại không cần quy đổi VND", "text", { no: "2.41", width: "xs" }),
            fld("TK_TP", "Tổng hệ số phân bổ trị giá tính thuế", "number", { no: "2.42", width: "sm" }),
          ],
        },
      ],
    },
    { id: "thue-bao-lanh", title: "Thuế & bảo lãnh", blocks: taxPaymentBlocks("EDA") },
    { id: "dinh-kem", title: "Đính kèm & ghi chú", blocks: attachmentBlocks("EDA") },
  ],
  customs: [
    {
      id: "dang-ky", title: "Đăng ký tờ khai", blocks: [
        {
          id: "dang-ky", title: "Đăng ký", emptyNote: "Có sau khi khai tạm (EDA): số tờ khai; sau khai chính thức (EDC): ngày giờ đăng ký, phân luồng.", items: [
            hq("TK_ECN", "Số tờ khai", "text", { no: "2.1" }),
            grp("Ngày giờ đăng ký", undefined, [hq("TK_K10", "Ngày", "date"), hq("TK_RT1", "Giờ", "time")]),
            grp("Ngày giờ thay đổi đăng ký", undefined, [hq("TK_AD21", "Ngày", "date"), hq("TK_AD31", "Giờ", "time")]),
            hq("TK_K07", "Mã phân loại kiểm tra", "code", { width: "xs" }),
            hq("TK_K08", "Tên cơ quan hải quan", "text"),
            hq("TK_K01", "Mã số hàng hóa đại diện", "text", { width: "sm" }),
            grp("Tổng số trang / dòng hàng", undefined, [hq("TK_K69", "Số trang", "number", { width: "xs" }), hq("TK_K70", "Số dòng", "number", { width: "xs" })]),
            hq("TK_JKN", "Phân loại xuất báo cáo sửa đổi", "text", { width: "xs" }),
            hq("TK_AAA", "Biểu thị trường hợp hết hạn", "text", { width: "xs" }),
            grp("Đại lý hải quan (hệ thống ghi nhận)", undefined, [hq("TK_K32", "Mã đại lý", "text", { width: "sm" }), hq("TK_K33", "Tên đại lý", "text"), hq("TK_K34", "Mã nhân viên", "text", { width: "sm" })]),
            hq("TK_TRANGTHAI", "Trạng thái khai báo", "code", { width: "sm" }),
            hq("TK_LUONG", "Kết quả phân luồng", "code", { width: "sm" }),
            hq("TK_THONGQUAN", "Thông quan", "code", { width: "sm" }),
            hq("TK_K42", "Tên địa điểm lưu kho (hệ thống hiện theo mã)", "text"),
          ],
        },
      ],
    },
    {
      id: "thue", title: "Thuế tờ khai", blocks: [
        {
          id: "thue-xk", title: "Thuế xuất khẩu và lệ phí", emptyNote: "Có sau khi khai tạm (EDA) – Hải quan tính thuế chính thức.", items: [
            grp("Tổng số tiền thuế xuất khẩu", undefined, [hq("TK_ETA", "Số tiền", "number"), hq("TK_AD7", "Mã tiền", "text", { width: "xs" })]),
            hq("TK_TCO", "Tổng số tiền lệ phí", "number"),
            grp("Số tiền bảo lãnh", undefined, [hq("TK_SAM", "Số tiền", "number"), hq("TK_AD8", "Mã tiền", "text", { width: "xs" })]),
            rep("Tỷ giá tính thuế", undefined, 2, [hq("TK_RC{n}", "Mã tiền", "text", { width: "xs" }), hq("TK_RD{n}", "Tỷ giá", "number")]),
            hq("TK_K68", "Mã phân loại nhập liệu tổng giá cơ bản", "text", { width: "xs" }),
            hq("TK_PAY", "Phân loại nộp thuế", "text", { width: "xs" }),
          ],
        },
      ],
    },
    { id: "chi-thi", title: "Chỉ thị Hải quan", blocks: [directivesBlock("EDA")] },
    {
      id: "thong-quan", title: "Thông quan", blocks: [
        {
          id: "thong-quan", title: "Cấp phép và kiểm tra", emptyNote: "Có khi Hải quan cấp phép thông quan / hoàn thành kiểm tra.", items: [
            grp("Cấp phép", undefined, [hq("TK_K86", "Ngày cấp phép", "date"), hq("TK_AD5", "Giờ", "time"), hq("TK_K87", "Trưởng đơn vị Hải quan", "text")]),
            grp("Hoàn thành kiểm tra", undefined, [hq("TK_CCD", "Ngày", "date"), hq("TK_AD4", "Giờ", "time")]),
          ],
        },
      ],
    },
  ],
  item: { columns: ["HAG_CMD", "HAG_CMN", "HAG_QN1", "HAG_QT1", "HAG_BPR"], declarant: ITEM_DECLARANT, customs: ITEM_CUSTOMS },
});
