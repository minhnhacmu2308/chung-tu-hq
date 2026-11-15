// Gộp dòng hàng cùng loại (bước OCR): cùng tên hàng gốc (phần trước dấu phẩy đầu tiên), ĐVT, đơn giá, xuất xứ (và mã HS, mã hàng nếu hóa đơn ghi)
// → đề xuất gộp thành một dòng; chi tiết khác nhau (size, số carton…) bỏ khỏi tên dòng gộp. Người khai bấm Gộp mới gộp.
// Dùng chung: màn OCR tính nhóm để đề xuất, backend gộp khi dựng shipment (cờ mergeIdenticalLines của hồ sơ).

export type MergeableLine = { lineNo: number; description: string | null; unit: string | null; unitPrice: string | null; origin: string | null; hs: string | null; partNo?: string | null };

const canon = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
/** Đơn giá so theo giá trị số (1.50 = 1.5); không parse được thì so chuỗi. */
const price = (s: string | null) => {
  const t = (s ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? t.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : t;
};
// Dấu phẩy liền chữ số là dấu thập phân (M8X1,25) – không tách.
const segments = (s: string | null) => (s ?? "").split(/,(?!\d)/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean);

/** Khóa gộp; thiếu tên hàng hoặc đơn giá → null (không gộp). */
export function lineMergeKey(l: MergeableLine): string | null {
  const name = canon(segments(l.description)[0] ?? null);
  if (!name || !price(l.unitPrice)) return null;
  return [name, canon(l.unit), price(l.unitPrice), canon(l.origin), canon(l.hs).replace(/\D/g, ""), canon(l.partNo ?? null)].join("\u0000");
}

/** Các nhóm ≥ 2 dòng cùng loại, theo thứ tự dòng đầu; mỗi nhóm là danh sách số dòng tăng dần. */
export function identicalLineGroups(lines: readonly MergeableLine[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const l of [...lines].sort((a, b) => a.lineNo - b.lineNo)) {
    const k = lineMergeKey(l);
    if (k !== null) groups.set(k, [...(groups.get(k) ?? []), l.lineNo]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Tên dòng gộp: tên giống hệt → giữ nguyên dòng đầu; khác → các phần (tách theo dấu phẩy) của dòng đầu mà mọi dòng đều có. */
export function mergedDescription(descriptions: readonly (string | null)[]): string {
  const first = descriptions[0] ?? "";
  if (descriptions.every((d) => canon(d) === canon(first))) return first;
  const rest = descriptions.slice(1).map((d) => new Set(segments(d).map((x) => x.toUpperCase())));
  return segments(first).filter((x) => rest.every((r) => r.has(x.toUpperCase()))).join(", ");
}
