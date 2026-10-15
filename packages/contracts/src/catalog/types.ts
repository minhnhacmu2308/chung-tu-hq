import type { DocKind } from "../common.js";

/** Kiểu hiển thị/so sánh của một trường chuẩn (schema Zod vẫn là nguồn kiểu dữ liệu). */
export type DocFieldType = "text" | "number" | "date" | "code" | "party" | "boolean";

/** Một trường chuẩn của loại chứng từ: nhãn tiếng Việt (như cột "TÊN TRƯỜNG" của bảng đọc chứng từ) + nhãn thường gặp trên chứng từ. */
export type DocFieldDef = {
  /** Key trong schema trích xuất – cố định giữa các phiên bản. */
  key: string;
  label: string;
  /** Nhãn in trên chứng từ (Anh/Việt) – dùng cho gợi ý đọc và đối chiếu bảng đáp án. */
  aliases: string[];
  type: DocFieldType;
  /** Phiên bản danh mục thêm trường này. */
  since: 1 | 2;
};

export type DocCatalog = {
  kind: DocKind;
  /** Trường phần đầu chứng từ, đúng thứ tự key của schema (trừ `uncertainties` và danh sách). */
  fields: DocFieldDef[];
  /** Danh sách lặp (dòng hàng, container, khoản phí…) nếu có. */
  items?: { key: string; label: string; fields: DocFieldDef[] };
};
