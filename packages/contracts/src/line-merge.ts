// Gộp dòng hàng giống nhau (bước OCR): cùng tên hàng, ĐVT, đơn giá, xuất xứ (và mã HS, mã hàng nếu hóa đơn ghi) → đề xuất gộp thành một dòng.
// Dùng chung: màn OCR tính nhóm để đề xuất, backend gộp khi dựng shipment (cờ mergeIdenticalLines của hồ sơ).

export type MergeableLine = { lineNo: number; description: string | null; unit: string | null; unitPrice: string | null; origin: string | null; hs: string | null; partNo?: string | null };

const canon = (s: string | null) => (s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
/** Đơn giá so theo giá trị số (1.50 = 1.5); không parse được thì so chuỗi. */
const price = (s: string | null) => {
  const t = (s ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? t.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : t;
};

/** Khóa gộp; thiếu tên hàng hoặc đơn giá → null (không gộp). */
export function lineMergeKey(l: MergeableLine): string | null {
  if (!canon(l.description) || !price(l.unitPrice)) return null;
  return [canon(l.description), canon(l.unit), price(l.unitPrice), canon(l.origin), canon(l.hs).replace(/\D/g, ""), canon(l.partNo ?? null)].join("\u0000");
}

/** Các nhóm ≥ 2 dòng giống nhau, theo thứ tự dòng đầu; mỗi nhóm là danh sách số dòng tăng dần. */
export function identicalLineGroups(lines: readonly MergeableLine[]): number[][] {
  const groups = new Map<string, number[]>();
  for (const l of [...lines].sort((a, b) => a.lineNo - b.lineNo)) {
    const k = lineMergeKey(l);
    if (k !== null) groups.set(k, [...(groups.get(k) ?? []), l.lineNo]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
