// Bố cục bản khai bổ sung AMA theo giao diện phần mềm khai báo (CHIEUTIEU_AMA_NHAP_XUAT.docx): tab Thông tin tờ khai + chi tiết dòng hàng.
// Dùng chung renderer với form tờ khai (LayoutBlock). Ô có dấu * trên giao diện → required.
import { fld, grp, hq } from "../declaration-layout/shared.js";
import type { LayoutBlock, LayoutField } from "../declaration-layout/types.js";
import { OTHER_TAX_SLOTS } from "./rules.js";

const req = { required: true } as const;

export const AMA_HEADER_LAYOUT: LayoutBlock[] = [
  {
    id: "ama-to-khai", title: "Tờ khai cần bổ sung", items: [
      hq("TK_SYN", "Số tờ khai bổ sung", "text", { width: "md" }),
      fld("TK_YNK", "Phân loại", "choice", { ...req, options: [{ value: "I", label: "Nhập khẩu" }, { value: "E", label: "Xuất khẩu" }] }),
      fld("TK_ICN", "Số tờ khai muốn bổ sung", "text", { ...req, width: "md" }),
      fld("TK_ICB", "Mã loại hình", "code", { ...req, codeTable: "TYPE_CODE", width: "sm" }),
      fld("TK_CHS", "Cơ quan hải quan", "code", { ...req, codeTable: "A038", width: "sm" }),
      fld("TK_CHB", "Nhóm xử lý hồ sơ", "code", { ...req, codeTable: "A014", width: "xs" }),
      fld("TK_IDD", "Ngày khai báo", "date", { ...req, width: "sm" }),
      fld("TK_IPD", "Ngày cấp phép", "date", { ...req, width: "sm" }),
      fld("TK_RED", "Thời hạn tái nhập / tái xuất", "date", { width: "sm" }),
    ],
  },
  {
    id: "ama-nguoi-khai", title: "Người khai", items: [
      fld("TK_IMC", "Mã người khai", "text", { width: "sm" }),
      fld("TK_IMT", "Số điện thoại", "text", { width: "sm" }),
      fld("TK_IMY", "Mã bưu chính", "text", { width: "xs" }),
      fld("TK_IMN", "Tên người khai", "textarea", { width: "full" }),
      fld("TK_IMA", "Địa chỉ người khai", "textarea", { width: "full" }),
      fld("TK_REF", "Số quản lý của nội bộ doanh nghiệp", "text", { width: "md" }),
    ],
  },
  {
    id: "ama-ly-do", title: "Lý do khai bổ sung và nộp thuế", items: [
      fld("TK_REC", "Mã lý do khai bổ sung", "code", { ...req, codeTable: "AMA_REASON", width: "xs" }),
      fld("TK_TTC", "Mã tiền tệ của thuế", "code", { ...req, codeTable: "CURRENCY", width: "xs" }),
      fld("TK_ENC", "Mã xác định thời hạn nộp thuế", "code", { codeTable: "DUE_DATE", width: "xs" }),
      fld("TK_BRC", "Mã ngân hàng trả thuế thay", "code", { codeTable: "BANK", width: "sm" }),
      fld("TK_BYA", "Năm phát hành hạn mức", "number", { width: "xs" }),
      fld("TK_BCM", "Kí hiệu chứng từ hạn mức", "text", { width: "sm" }),
      fld("TK_BCN", "Số chứng từ hạn mức", "text", { width: "sm" }),
    ],
  },
  {
    id: "ama-bao-lanh", title: "Bảo lãnh", items: [
      fld("TK_SBC", "Mã ngân hàng bảo lãnh", "code", { codeTable: "BANK", width: "sm" }),
      fld("TK_RYA", "Năm phát hành bảo lãnh", "number", { width: "xs" }),
      fld("TK_SCM", "Kí hiệu chứng từ bảo lãnh", "text", { width: "sm" }),
      fld("TK_SCN", "Số chứng từ bảo lãnh", "text", { width: "sm" }),
    ],
  },
  {
    id: "ama-ty-gia", title: "Tỷ giá tính thuế", items: [
      grp("Trước khi khai bổ sung", undefined, [fld("TK_CDB", "Mã tiền tệ", "code", { codeTable: "CURRENCY", width: "xs" }), fld("TK_RTB", "Tỷ giá", "number", { width: "sm" })]),
      grp("Sau khi khai bổ sung", undefined, [fld("TK_CDA", "Mã tiền tệ", "code", { codeTable: "CURRENCY", width: "xs" }), fld("TK_RTA", "Tỷ giá", "number", { width: "sm" })]),
    ],
  },
  {
    id: "ama-ghi-chu", title: "Ghi chú", items: [
      fld("TK_NTB", "Phần ghi chú trước khi khai bổ sung", "textarea", { width: "full" }),
      fld("TK_NTA", "Phần ghi chú sau khi khai bổ sung", "textarea", { width: "full" }),
    ],
  },
];

/** Đầu chi tiết dòng hàng: số dòng gốc, mã hàng nội bộ, mô tả và xuất xứ trước / sau. */
export const AMA_LINE_LAYOUT: LayoutBlock[] = [
  {
    id: "ama-hang", title: "Hàng hóa", items: [
      fld("HAG_RAN", "Số thứ tự dòng hàng trên tờ khai gốc", "text", { ...req, width: "xs" }),
      fld("APP_MA_HANG_TRUOC", "Mã hàng (Trước)", "text", { width: "sm" }),
      fld("APP_MA_HANG_SAU", "Mã hàng (Sau)", "text", { width: "sm" }),
      fld("HAG_CMB", "Mô tả hàng hóa trước khi khai bổ sung", "textarea", { width: "full" }),
      fld("HAG_CMA", "Mô tả hàng hóa sau khi khai bổ sung", "textarea", { width: "full" }),
      fld("HAG_ORB", "Mã nước xuất xứ (Trước)", "code", { codeTable: "COUNTRY", width: "xs" }),
      fld("HAG_ORA", "Mã nước xuất xứ (Sau)", "code", { codeTable: "COUNTRY", width: "xs" }),
    ],
  },
];

/** Cột của khối thuế (Trước/Sau): trị giá tính thuế, số lượng tính thuế, ĐVT, mã HS / mã xác định thuế suất, thuế suất, số tiền thuế. */
export type AmaTaxColumn = { label: string; before: string; after: string; input: LayoutField["input"]; codeTable?: LayoutField["codeTable"]; numeric?: boolean };

export const AMA_IMPORT_TAX_COLUMNS: AmaTaxColumn[] = [
  { label: "Trị giá tính thuế", before: "HAG_MKB", after: "HAG_AKB", input: "number", numeric: true },
  { label: "Số lượng tính thuế", before: "HAG_MKQ", after: "HAG_AKQ", input: "number", numeric: true },
  { label: "Mã ĐVT", before: "HAG_MKC", after: "HAG_AKC", input: "code", codeTable: "UNIT" },
  { label: "Mã số hàng hóa", before: "HAG_MKT", after: "HAG_AKT", input: "text" },
  { label: "Thuế suất", before: "HAG_MKR", after: "HAG_AKR", input: "text" },
  { label: "Số tiền thuế phải nộp", before: "HAG_MKA", after: "HAG_AKA", input: "number", numeric: true },
];

export const amaOtherTaxColumns = (n: number): AmaTaxColumn[] => [
  { label: "Trị giá tính thuế", before: `HAG_MB${n}`, after: `HAG_AB${n}`, input: "number", numeric: true },
  { label: "Số lượng tính thuế", before: `HAG_MQ${n}`, after: `HAG_AQ${n}`, input: "number", numeric: true },
  { label: "Mã ĐVT", before: `HAG_MC${n}`, after: `HAG_AC${n}`, input: "code", codeTable: "UNIT" },
  { label: "Mã xác định thuế suất", before: `HAG_MK${n}`, after: `HAG_AK${n}`, input: "code", codeTable: "OTHER_TAX" },
  { label: "Thuế suất", before: `HAG_MR${n}`, after: `HAG_AR${n}`, input: "text" },
  { label: "Số tiền thuế phải nộp", before: `HAG_MA${n}`, after: `HAG_AA${n}`, input: "number", numeric: true },
];

export const AMA_OTHER_TAX_SLOTS = OTHER_TAX_SLOTS;

const taxField = (key: string, c: AmaTaxColumn) => fld(key, c.label, c.input, { width: "sm", ...(c.codeTable ? { codeTable: c.codeTable } : {}) });
const taxBlock = (id: string, title: string, cols: AmaTaxColumn[]): LayoutBlock => ({
  id, title,
  items: [grp("Trước", undefined, cols.map((c) => taxField(c.before, c))), grp("Sau", undefined, cols.map((c) => taxField(c.after, c)))],
});
/** Khối Thuế nhập khẩu và xuất khẩu: hàng Trước / hàng Sau. */
export const AMA_IMPORT_TAX_BLOCK: LayoutBlock = taxBlock("ama-thue-xnk", "Thuế nhập khẩu và xuất khẩu", AMA_IMPORT_TAX_COLUMNS);
/** Khối Thuế và thu khác n (1–5). */
export const amaOtherTaxBlock = (n: number): LayoutBlock => taxBlock(`ama-thu-khac-${n}`, `Thuế và thu khác ${n}`, amaOtherTaxColumns(n));
