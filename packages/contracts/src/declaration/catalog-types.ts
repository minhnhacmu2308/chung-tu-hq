import { z } from "zod";

/**
 * Catalog chỉ tiêu tờ khai hải quan (dữ liệu tĩnh) theo Phụ lục II TT38/2015, sửa đổi TT39/2018 và TT121/2025.
 * Mẫu 01 = tờ khai nhập khẩu (VNACCS IDA), Mẫu 02 = tờ khai xuất khẩu (VNACCS EDA).
 */
export const DeclarationSectionSchema = z.enum(["GENERAL", "PARTIES", "TRANSPORT", "VALUE", "ITEMS", "TAX"]);

export const CodeTableSchema = z.enum([
  "A014", "A038", "A016", "A202", "A501", "A519", "A520", "A527", "A528", "A546", "A601", "A620",
  "CURRENCY", "COUNTRY", "UNIT", "PAYMENT", "INCOTERM", "TRANSPORT_MODE", "INVOICE_KIND", "PRICE_KIND",
  "LAW_CODE", "TYPE_CODE", "TAX_TABLE",
]);

export const DeclarationFieldDefSchema = z.object({
  /** Số thứ tự chỉ tiêu trong Phụ lục II, ví dụ "1.26", "2.14". */
  no: z.string(),
  form: z.enum(["01", "02"]),
  section: DeclarationSectionSchema,
  /** Tên chỉ tiêu tiếng Việt đúng theo Phụ lục. */
  label: z.string(),
  type: z.enum(["text", "code", "date", "decimal", "int"]),
  maxLen: z.number().int().positive().optional(),
  /** M bắt buộc, C bắt buộc có điều kiện, O tùy chọn, F hệ thống/không khai. */
  required: z.enum(["M", "C", "O", "F"]),
  codeTable: CodeTableSchema.optional(),
  /** Tên trường FPT: "VN_IDA.TK_ICB", "VN_IDA_VANDON.VD_BL1", "VN_IDA_KTG.KTG_xxx", "VN_IDA_HANG.HAG_xxx", "VN_EDA.TK_ECB", "VN_EDA_HANG.HAG_xxx", "VN_EDA_CON.CON_xxx". Để trống khi không khớp chắc chắn. */
  fptField: z.string().optional(),
  /** Hệ thống không điền tự động – người khai nhập tay. */
  manual: z.boolean().optional(),
  /** Trích hướng dẫn khai ngắn gọn (≤ 300 ký tự) hoặc "cần đối chiếu" khi chưa chắc. */
  legalNote: z.string().optional(),
  /** true khi TT121/2025 sửa/thêm chỉ tiêu này. */
  amendedBy121: z.boolean().optional(),
});

export type DeclarationFieldDef = z.infer<typeof DeclarationFieldDefSchema>;
export type DeclarationSection = z.infer<typeof DeclarationSectionSchema>;
export type CodeTable = z.infer<typeof CodeTableSchema>;

type FieldExtra = Omit<DeclarationFieldDef, "no" | "form" | "section" | "label" | "type" | "required">;

/** Hàm dựng gọn phần tử catalog cho một mẫu tờ khai (dùng nội bộ trong các file catalog). */
export function fieldBuilder(form: DeclarationFieldDef["form"]) {
  return (
    no: string,
    section: DeclarationSection,
    label: string,
    type: DeclarationFieldDef["type"],
    required: DeclarationFieldDef["required"],
    extra: FieldExtra = {},
  ): DeclarationFieldDef => ({ no, form, section, label, type, required, ...extra });
}
