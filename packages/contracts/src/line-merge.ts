// Gộp dòng hàng cùng loại (bước OCR): cùng tên hàng gốc (phần trước dấu phẩy đầu tiên), ĐVT, đơn giá, xuất xứ (và mã HS, mã hàng nếu hóa đơn ghi)
// → đề xuất gộp thành một dòng; tên dòng gộp gom chi tiết khác nhau (SIZE 50/100, 100/200…). Người khai bấm Gộp mới gộp.
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

// Phần chỉ là số kiện của từng dòng ("10 CARTONS") – bỏ khỏi tên dòng gộp (tổng số kiện đã có ở chỉ tiêu số kiện).
const PACKAGE_COUNT = /^\d[\d.,]*\s*(CARTONS?|CTNS?|PKGS?|PACKAGES?|BOX(ES)?|BAGS?|PALLETS?|CASES?|ROLLS?|BALES?|DRUMS?|CRATES?)\.?$/i;
/** "LOT NO: A1" → nhãn "LOT NO" (cả phần trước dấu hai chấm, không chứa số – "10:30" là giờ; "://" không phải nhãn); không có ":" → chữ đầu ("SIZE 50/100" → "SIZE"); không có nhãn chữ → null. */
const labeled = (seg: string) => {
  const m = /^([^:\d]+?)(\s*:(?!\/\/)\s*)(.+)$/.exec(seg) ?? /^([^\s:\d][^\s:]*)(\s+)(.+)$/.exec(seg);
  return m ? { label: m[1]!.toUpperCase(), head: m[1]! + m[2]!, value: m[3]! } : null;
};
const uniq = (xs: string[]) => xs.filter((x, i) => xs.findIndex((y) => y.toUpperCase() === x.toUpperCase()) === i);

/**
 * Tên dòng gộp (cách hải quan khai): tên giống hệt → giữ nguyên dòng đầu. Khác → giữ phần mọi dòng đều có;
 * phần khác nhau cùng nhãn gom giá trị ("SIZE 50/100, 100/200"); bỏ số kiện từng dòng; phần khác còn lại nối "; " ở cuối.
 */
export function mergedDescription(descriptions: readonly (string | null)[]): string {
  const first = descriptions[0] ?? "";
  if (descriptions.every((d) => canon(d) === canon(first))) return first;
  const lines = descriptions.map(segments);
  const sets = lines.map((ss) => new Set(ss.map((x) => x.toUpperCase())));
  const common = (x: string) => sets.every((st) => st.has(x.toUpperCase()));
  const rest = lines.map((ss) => ss.filter((x) => !common(x) && !PACKAGE_COUNT.test(x)));
  const used = new Set<string>();
  const out: string[] = [];
  for (const seg of lines[0]!) {
    if (common(seg)) { out.push(seg); continue; }
    const l = labeled(seg);
    if (!l || used.has(l.label)) continue;
    const vals = rest.map((ss) => ss.map(labeled).filter((x) => x?.label === l.label).map((x) => x!.value));
    if (vals.some((v) => !v.length)) continue;
    used.add(l.label);
    out.push(l.head + uniq(vals.flat()).join(", "));
  }
  const left = uniq(rest.flat().filter((x) => !used.has(labeled(x)?.label ?? "\u0000")));
  if (left.length) out.push(left.join("; "));
  return out.join(", ");
}
