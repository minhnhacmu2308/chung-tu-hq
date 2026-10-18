// Hàm dựng gọn + các khối giống nhau giữa Mẫu 01 (IDA) và Mẫu 02 (EDA): cùng tên trường VNACCS, khác số chỉ tiêu.
import type { FieldInput, LayoutBlock, LayoutField, LayoutGroup, LayoutRepeat } from "./types.js";

type Kind = "IDA" | "EDA";
type Extra = Partial<Omit<LayoutField, "kind" | "key" | "label" | "input">>;

export const fld = (key: string, label: string, input: FieldInput = "text", extra: Extra = {}): LayoutField => ({ kind: "field", key, label, input, ...extra });
/** Ô Hải quan cấp/tính – chỉ đọc. */
export const hq = (key: string, label: string, input: FieldInput = "text", extra: Extra = {}): LayoutField => fld(key, label, input, { ...extra, origin: "CUSTOMS" });
export const grp = (label: string, no: string | undefined, fields: LayoutField[], extra: Partial<Pick<LayoutGroup, "condition" | "fill">> = {}): LayoutGroup => ({ kind: "group", label, ...(no ? { no } : {}), fields, ...extra });
export const rep = (label: string, no: string | undefined, count: number, fields: LayoutField[], extra: Partial<Pick<LayoutRepeat, "condition">> = {}): LayoutRepeat => ({ kind: "repeat", label, ...(no ? { no } : {}), count, fields, ...extra });
/** Số chỉ tiêu theo mẫu: n("1.39", "2.34"). */
const n = (k: Kind) => (ida: string, eda: string) => (k === "IDA" ? ida : eda);

/** Ô riêng của phần mềm ở đầu khối Vận đơn: khai định danh theo đường biển / hàng không; hàng không → có phát hành HAWB không (có → ô số HAWB cạnh số vận đơn). Không bắt buộc → hiện checkbox, bỏ chọn được. */
export const billIdentFields: LayoutField[] = [
  fld("APP_DD_PT", "Khai báo định danh theo", "choice", { options: [{ value: "BIEN", label: "Đường biển" }, { value: "HANG_KHONG", label: "Hàng không" }] }),
  fld("APP_HAWB_CO", "Vận đơn thứ cấp (HAWB)", "choice", { condition: "AIR_IDENT", options: [{ value: "CO", label: "Có phát hành HAWB" }] }),
];

/** Ô riêng của phần mềm ở đầu khối Tờ khai: lọc mã loại hình theo nhóm. Phần mềm luôn chọn sẵn một nhóm → bắt buộc (radio). */
export const typeGroupField: LayoutField = fld("APP_NHOM_LH", "Nhóm loại hình", "choice", {
  required: true,
  options: [{ value: "KD", label: "Kinh doanh" }, { value: "SXXK", label: "Sản xuất xuất khẩu" }, { value: "GC", label: "Gia công" }, { value: "CX", label: "Chế xuất" }],
});

/** Ô riêng của phần mềm ở dòng hàng (ảnh tạo mới): số lượng thực tế, hàng khuyến mãi. */
export const itemExtraFields: LayoutField[] = [
  fld("APP_SL_THUC_TE", "Số lượng thực tế", "number", { width: "sm" }),
  fld("APP_FOC", "Hàng FOC", "choice", { options: [{ value: "1", label: "Hàng khuyến mãi (FOC)" }] }),
];
/** Bật nhập tay trị giá tính thuế của dòng (mở nhóm trị giá tính thuế phân bổ thủ công). */
export const manualValueField: LayoutField = fld("APP_TGTT_TAY", "Nhập trị giá tính thuế", "choice", { options: [{ value: "1", label: "Tự nhập trị giá tính thuế (Manual)" }] });

export function invoiceBlock(k: Kind): LayoutBlock {
  const no = n(k);
  return {
    id: "hoa-don", title: "Hóa đơn thương mại", items: [
      fld("TK_IV1", "Phân loại hình thức hóa đơn", "code", { no: no("1.39", "2.34"), codeTable: "INVOICE_KIND", width: "sm" }),
      fld("TK_IV3", "Số hóa đơn", "text", { no: no("1.41", "2.36"), width: "md" }),
      fld("TK_IV2", "Số tiếp nhận hóa đơn điện tử", "text", { no: no("1.40", "2.35"), width: "md" }),
      fld("TK_IVD", "Ngày phát hành", "date", { no: no("1.42", "2.37"), width: "sm" }),
      fld("TK_IVP", "Phương thức thanh toán", "code", { no: no("1.43", "2.38"), codeTable: "PAYMENT", width: "sm" }),
      grp(k === "IDA" ? "Tổng trị giá hóa đơn" : "Trị giá hóa đơn", no("1.44", "2.39"), [
        fld("TK_IP1", "Mã phân loại giá hóa đơn", "code", { codeTable: "PRICE_KIND", width: "xs" }),
        fld("TK_IP2", "Điều kiện giao hàng", "code", { codeTable: "INCOTERM", width: "xs" }),
        fld("TK_IP4", "Tổng trị giá hóa đơn", "number", { width: "md" }),
        fld("TK_IP3", "Mã nguyên tệ", "code", { codeTable: "CURRENCY", width: "xs" }),
      ]),
    ],
  };
}

/** Thông tin riêng của phần mềm khai báo (không có trong Phụ lục II / VNACCS) – theo ảnh mẫu, chưa lưu. */
export const internalContractBlock: LayoutBlock = {
  id: "hop-dong-noi-bo", title: "Hợp đồng quản lý nội bộ", items: [
    fld("APP_HD_SO", "Số hợp đồng", "text", { width: "md" }),
    fld("APP_HD_NGAY", "Ngày ký", "date", { width: "sm" }),
    fld("APP_HD_HET_HAN", "Ngày hết hạn", "date", { width: "sm" }),
  ],
};

export function permitsBlock(k: Kind): LayoutBlock {
  return {
    id: "giay-phep", title: k === "IDA" ? "Giấy phép nhập khẩu" : "Giấy phép xuất khẩu", items: [
      rep("Giấy phép", n(k)("1.38", "2.33"), 5, [
        fld("TK_SS{n}", "Mã phân loại giấy phép", "code", { codeTable: "A528", width: "xs" }),
        fld("TK_SN{n}", "Số giấy phép", "text", { width: "md" }),
      ]),
      grp("Hợp đồng gia công", undefined, [fld("APP_HDGC_SO", "Số hợp đồng gia công", "text", { width: "md" }), fld("APP_HDGC_NGAY", "Ngày", "date", { width: "sm" })]),
    ],
  };
}

export function taxPaymentBlocks(k: Kind): LayoutBlock[] {
  const no = n(k);
  return [
    {
      id: "nop-thue", title: "Nộp thuế", items: [
        fld("TK_TPM", "Người nộp thuế", "code", { no: no("1.52", "2.43"), codeTable: "TAX_PAYER", width: "sm" }),
        fld("TK_ENC", "Mã xác định thời hạn nộp thuế", "code", { no: no("1.58", "2.48"), codeTable: "DUE_DATE", width: "sm" }),
        ...(k === "IDA" ? [fld("TK_BP", "Mã lý do đề nghị BP", "code", { no: "1.53", codeTable: "BP_REASON", width: "sm" })] : []),
      ],
    },
    {
      id: "han-muc", title: "Hạn mức ngân hàng trả thuế thay", items: [
        fld("TK_BRC", "Mã ngân hàng trả thuế thay", "code", { codeTable: "BANK", no: no("1.54", "2.44"), width: "sm" }),
        fld("TK_BYA", "Năm phát hành hạn mức", "number", { no: no("1.55", "2.45"), width: "xs" }),
        fld("TK_BCM", "Ký hiệu chứng từ hạn mức", "text", { no: no("1.56", "2.46"), width: "sm" }),
        fld("TK_BCN", "Số chứng từ hạn mức", "text", { no: no("1.57", "2.47"), width: "sm" }),
      ],
    },
    {
      id: "bao-lanh", title: "Bảo lãnh", items: [
        fld("TK_SBC", "Mã ngân hàng bảo lãnh", "code", { codeTable: "BANK", no: no("1.59", "2.49"), width: "sm" }),
        fld("TK_RYA", "Năm phát hành bảo lãnh", "number", { no: no("1.60", "2.50"), width: "xs" }),
        fld("TK_SCM", "Ký hiệu chứng từ bảo lãnh", "text", { no: no("1.61", "2.51"), width: "sm" }),
        fld("TK_SCN", "Số chứng từ bảo lãnh", "text", { no: no("1.62", "2.52"), width: "sm" }),
      ],
    },
  ];
}

export function attachmentBlocks(k: Kind): LayoutBlock[] {
  const no = n(k);
  return [
    { id: "dinh-kem", title: "Số đính kèm khai báo điện tử", items: [rep("Đính kèm", no("1.63", "2.53"), 3, [fld("TK_EA{n}", "Phân loại đính kèm", "code", { codeTable: "A546", width: "xs" }), fld("TK_EB{n}", "Số đính kèm (HYS)", "text", { width: "md" })])] },
    {
      id: "ghi-chu", title: "Ghi chú và quản lý nội bộ", items: [
        fld("TK_NT2", "Phần ghi chú", "textarea", { no: no("1.68", "2.57"), width: "full" }),
        fld("TK_REF", "Số quản lý của nội bộ doanh nghiệp", "text", { no: no("1.69", "2.58"), width: "md" }),
      ],
    },
  ];
}

/** Vận chuyển kết hợp (bảo thuế): ngày khởi hành, 3 điểm trung chuyển, điểm đích. */
export function transitBlock(k: Kind): LayoutBlock {
  const no = n(k);
  return {
    id: "trung-chuyen", title: "Thông tin địa điểm trung chuyển", items: [
      fld("TK_DPD", "Ngày khởi hành vận chuyển", "date", { no: no("1.65", "2.54"), width: "sm" }),
      rep("Địa điểm trung chuyển", no("1.66", "2.55"), 3, [
        fld("TK_ST{n}", "Địa điểm", "code", { codeTable: "A202", width: "sm" }),
        fld("TK_AD{n}", "Ngày đến", "date", { width: "sm" }),
        fld("TK_SD{n}", "Ngày khởi hành", "date", { width: "sm" }),
      ]),
      grp("Địa điểm đích cho vận chuyển bảo thuế", no("1.67", "2.56"), [fld("TK_ARP", "Mã địa điểm đích", "code", { codeTable: "A202", width: "sm" }), fld("TK_ADT", "Ngày dự kiến đến", "date", { width: "sm" })]),
    ],
  };
}

export function directivesBlock(k: Kind): LayoutBlock {
  const no = n(k);
  return {
    id: "chi-thi", title: "Chỉ thị của Hải quan", emptyNote: "Có khi công chức Hải quan ra chỉ thị (hướng dẫn sửa đổi, yêu cầu bổ sung).",
    items: [
      hq("CTHQ_CCM", "Phân loại chỉ thị của Hải quan", "code", { no: no("1.70", "2.61"), width: "xs" }),
      rep("Chỉ thị", undefined, 10, [
        hq("CTHQ_D{nn}", "Ngày ra chỉ thị", "date", { no: no("1.71", "2.62"), width: "sm" }),
        hq("CTHQ_T{nn}", "Người ra chỉ thị / tên chỉ thị", "text", { no: no("1.72", "2.63"), width: "md" }),
        hq("CTHQ_I{nn}", "Nội dung chỉ thị", "textarea", { no: no("1.73", "2.64"), width: "full" }),
      ]),
    ],
  };
}
