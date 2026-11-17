// Hàm dựng ô / dòng lặp dùng chung cho các bố cục in (ida-print.ts, eda-print.ts) – nội bộ, không xuất ra index.
import type { PrintCell, PrintRow } from "./types.js";

export const c = (key: string, label = "", span?: PrintCell["span"], align?: "end"): PrintCell => ({ key, label, ...(span ? { span } : {}), ...(align ? { align } : {}) });
export const rep = (count: number, cells: PrintCell[], label?: string): PrintRow => ({ kind: "repeat", ...(label ? { label } : {}), count, cells });
/** Ô chỉ in nhãn của mẫu (không có chỉ tiêu trong bố cục khai): `text` in ở chỗ giá trị, vd "/ /" cho ô ngày. */
export const fixed = (id: string, label: string, span?: PrintCell["span"], text = ""): PrintCell => ({ key: `~${id}`, label, fixed: text, ...(span ? { span } : {}) });
/** Chỗ trống của mẫu trong một dòng (giữ cột, không nhãn, không chữ) – vd nửa trái dòng "Số lượng (1)" của IDA. */
export const blank = (id: string, span: PrintCell["span"]): PrintCell => fixed(id, "", span);
