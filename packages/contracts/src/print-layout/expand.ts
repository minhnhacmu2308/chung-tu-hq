import { fillIndex } from "../declaration-layout/expand.js";
import { itemFields, layoutFor, type LayoutBlock } from "../declaration-layout/index.js";
import { printLayoutFor } from "./layout-for.js";
import type { PrintCell, PrintLayout, PrintPage, PrintRow } from "./types.js";

/** Dòng in → các dòng ô; dòng lặp thay {n}/{nn} theo số dòng (giống expandRepeat). */
export function expandPrintRow(row: PrintRow): PrintCell[][] {
  if (Array.isArray(row)) return [row];
  return Array.from({ length: row.count }, (_, i) => row.cells.map((c) => ({ ...c, key: fillIndex(c.key, i + 1) })));
}

const rowKeys = (rows: PrintRow[]) => rows.flatMap(expandPrintRow).flat().map((c) => c.key);
const regionKeys = (regions: PrintPage["regions"]) => regions.flat().flatMap((r) => rowKeys(r.rows));

/** Khóa trên bản in theo thứ tự in: decl = đầu trang + các trang chung; item = khối dòng hàng. */
export function printKeys(p: PrintLayout): { decl: string[]; item: string[] } {
  return { decl: [...rowKeys(p.header), ...regionKeys(p.pages.flatMap((pg) => pg.regions))], item: regionKeys(p.item) };
}

const declarantKeys = (blocks: LayoutBlock[]) => blocks.flatMap((b) => b.items.flatMap(itemFields)).filter((f) => f.origin !== "CUSTOMS").map((f) => f.key);

/** Ô người khai nhập không có chỗ trên mẫu in (khối "Chỉ tiêu khác"), giữ thứ tự bố cục Phụ lục II. */
export function otherFieldKeys(kind: "IDA" | "EDA"): { decl: string[]; item: string[] } {
  const l = layoutFor(kind);
  const printed = printKeys(printLayoutFor(kind));
  const decl = new Set(printed.decl);
  const item = new Set(printed.item);
  return { decl: declarantKeys(l.declarant.flatMap((s) => s.blocks)).filter((k) => !decl.has(k)), item: declarantKeys(l.item.declarant).filter((k) => !item.has(k)) };
}
