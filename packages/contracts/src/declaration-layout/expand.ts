import type { DeclarationLayout, LayoutBlock, LayoutField, LayoutItem, LayoutRepeat } from "./types.js";

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Thay "{nn}" (01, 02…) / "{n}" (1, 2…) trong khóa ô lặp bằng số dòng `i` (bắt đầu từ 1). */
export const fillIndex = (key: string, i: number): string => key.replaceAll("{nn}", pad2(i)).replaceAll("{n}", String(i));

/** Nhóm lặp → các dòng ô đã thay {n}/{nn} theo số dòng. */
export function expandRepeat(r: LayoutRepeat): LayoutField[][] {
  return Array.from({ length: r.count }, (_, i) => r.fields.map((f) => ({ ...f, key: fillIndex(f.key, i + 1) })));
}

/** Ô phẳng của một mục bố cục (nhóm lặp đã expand). */
export function itemFields(item: LayoutItem): LayoutField[] {
  if (item.kind === "field") return [item];
  if (item.kind === "group") return item.fields;
  return expandRepeat(item).flat();
}

const blockFields = (blocks: LayoutBlock[]) => blocks.flatMap((b) => b.items.flatMap(itemFields));

/** Mọi ô của bố cục: đầu trang, hai tab, dòng hàng. */
export function layoutFields(l: DeclarationLayout): LayoutField[] {
  return [...l.summary, ...l.declarant.flatMap((s) => blockFields(s.blocks)), ...l.customs.flatMap((s) => blockFields(s.blocks)), ...blockFields(l.item.declarant), ...blockFields(l.item.customs)];
}

/** Mọi số chỉ tiêu có trên bố cục (của ô, nhóm và nhóm lặp). */
export function layoutNumbers(l: DeclarationLayout): Set<string> {
  const blocks = [...l.declarant, ...l.customs].flatMap((s) => s.blocks).concat(l.item.declarant, l.item.customs);
  const nos = blocks.flatMap((b) => b.items.flatMap((it) => [it.no, ...(it.kind === "field" ? [] : it.fields.map((f) => f.no))]));
  return new Set([...nos, ...l.summary.map((f) => f.no)].filter((n): n is string => !!n));
}
