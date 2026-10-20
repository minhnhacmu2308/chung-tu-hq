// Hàm dựng ô / dòng lặp dùng chung cho các bố cục in (ida-print.ts, eda-print.ts) – nội bộ, không xuất ra index.
import type { PrintCell, PrintRow } from "./types.js";

export const c = (key: string, label = "", span?: PrintCell["span"], align?: "end"): PrintCell => ({ key, label, ...(span ? { span } : {}), ...(align ? { align } : {}) });
export const rep = (count: number, cells: PrintCell[], label?: string): PrintRow => ({ kind: "repeat", ...(label ? { label } : {}), count, cells });
