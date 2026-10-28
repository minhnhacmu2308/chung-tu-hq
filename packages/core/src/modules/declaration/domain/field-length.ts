// Độ dài tối đa của chỉ tiêu văn bản theo catalog Phụ lục II (VNACCS cắt bỏ phần thừa). Thuần.
import { CATALOG_EDA, CATALOG_IDA, type DeclarationFieldDef } from "@kb/contracts";
import { mappingsFor } from "./mapping/registry.js";

/** Định nghĩa Phụ lục II của chỉ tiêu khi số chỉ tiêu ứng với đúng một mnemonic (ô ghép như 1.44 có 4 mnemonic → bỏ qua). */
export function fieldDef(kind: "IDA" | "EDA", code: string): DeclarationFieldDef | undefined {
  const mappings = mappingsFor(kind);
  const m = mappings.find((x) => x.code === code);
  if (!m?.no || mappings.filter((x) => x.no === m.no).length !== 1) return undefined;
  return (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === m.no);
}

/**
 * Chỉ tiêu văn bản một ô mà maxLen của catalog đúng là độ dài của ô người khai nhập. Chỉ tiêu nhiều ô (1.31 hô hiệu + tên tàu, địa chỉ 4 ô…)
 * có maxLen của ô 1 nên không xét; ô mã/số/ngày cũng không xét (giá trị hiển thị kèm tên).
 */
const LENGTH_CHECKED = new Set(["GHI_CHU", "SO_QLNB", "NXK_TEN", "NNK_TEN", "SO_HD", "SO_VD"]);

/** Độ dài tối đa của chỉ tiêu văn bản được kiểm (null: không kiểm). */
export function maxLenOf(kind: "IDA" | "EDA", code: string): number | undefined {
  if (!LENGTH_CHECKED.has(code)) return undefined;
  const def = fieldDef(kind, code);
  return def && def.type === "text" && def.maxLen ? def.maxLen : undefined;
}

/** Ô văn bản vượt độ dài tối đa của chỉ tiêu → thông báo; trong giới hạn → undefined. */
export function lengthIssue(kind: "IDA" | "EDA", code: string, value: string): string | undefined {
  if (!LENGTH_CHECKED.has(code)) return undefined;
  const def = fieldDef(kind, code);
  if (!def || def.type !== "text" || !def.maxLen || value.length <= def.maxLen) return undefined;
  return `Dài ${value.length} ký tự, vượt giới hạn ${def.maxLen} ký tự của chỉ tiêu ${def.no} – rút gọn${code === "GHI_CHU" ? ", phần còn lại khai qua HYS" : ""}`;
}
