// Thuế và thu khác của dòng hàng (VNACCS 1.94–1.96: HAG_TX/TR/TG 1..5) theo LOẠI thuế: mỗi ô n ứng với một nhóm cố định, không theo thứ tự nhập.
// Nhóm: 1 CBPG (B/C/G) · 2 PBĐX (P) · 3 TTĐB (T) · 4 BVMT (M) · 5 GTGT (V). Mã miễn/giảm (TR) cùng chữ cái đầu với mã thuế cùng dòng. Thuần – FE, backend, mock dùng chung.
type Values = Record<string, string>;

export type OtherTaxGroupKey = "CBPG" | "PBDX" | "TTDB" | "BVMT" | "GTGT";
export const OTHER_TAX_GROUPS: readonly { group: 1 | 2 | 3 | 4 | 5; key: OtherTaxGroupKey; taxPrefixes: readonly string[] }[] = [
  { group: 1, key: "CBPG", taxPrefixes: ["B", "C", "G"] },
  { group: 2, key: "PBDX", taxPrefixes: ["P"] },
  { group: 3, key: "TTDB", taxPrefixes: ["T"] },
  { group: 4, key: "BVMT", taxPrefixes: ["M"] },
  { group: 5, key: "GTGT", taxPrefixes: ["V"] },
];
const SLOTS = [1, 2, 3, 4, 5] as const;

const clean = (v: string | null | undefined): string => (v ?? "").trim().toUpperCase();

export function otherTaxGroupOf(code: string | null | undefined): 1 | 2 | 3 | 4 | 5 | null {
  const c = clean(code);
  if (!c) return null;
  return OTHER_TAX_GROUPS.find((g) => g.taxPrefixes.includes(c[0]!))?.group ?? null;
}

export const otherTaxKeys = (n: number): { tx: string; tr: string; tg: string } => ({ tx: `HAG_TX${n}`, tr: `HAG_TR${n}`, tg: `HAG_TG${n}` });

const SLOT_KEY = /^HAG_(TX|TR|TG)[1-5]$/;

/**
 * Gộp tự điền + người khai: {...auto, ...own}; nếu own có mã thuế nhóm g ở dòng khác → bỏ bộ ba tự điền của dòng g.
 * Người khai xóa trống mã thuế ở dòng n (own TX = "") → bỏ cả bộ ba tự điền của dòng n (không để sót TR/TG tự điền, vd TR5 VK…).
 */
export function mergeOtherTaxes(auto: Values, own: Values): Values {
  const out: Values = { ...auto };
  for (const n of SLOTS) {
    const ownTx = own[otherTaxKeys(n).tx];
    if (ownTx !== undefined && !ownTx.trim()) {
      const k = otherTaxKeys(n);
      delete out[k.tx]; delete out[k.tr]; delete out[k.tg];
      continue;
    }
    const g = otherTaxGroupOf(ownTx);
    if (g === null) continue;
    const own_ = otherTaxKeys(n);
    delete out[own_.tx]; delete out[own_.tr]; delete out[own_.tg];
    if (g !== n) {
      const k = otherTaxKeys(g);
      delete out[k.tx]; delete out[k.tr]; delete out[k.tg];
    }
  }
  return { ...out, ...own };
}

/** Bộ ba (TX/TR/TG) của dòng n; chỉ khóa có giá trị. TX/TR chuẩn hóa viết hoa, bỏ khoảng trắng. */
function triple(values: Values, n: number): Values {
  const k = otherTaxKeys(n);
  const t: Values = {};
  const tx = clean(values[k.tx]); if (tx) t[k.tx] = tx;
  const tr = clean(values[k.tr]); if (tr) t[k.tr] = tr;
  const tg = (values[k.tg] ?? "").trim(); if (tg) t[k.tg] = tg;
  return t;
}
const retarget = (t: Values, from: number, to: number): Values => {
  const a = otherTaxKeys(from), b = otherTaxKeys(to);
  const out: Values = {};
  if (t[a.tx]) out[b.tx] = t[a.tx]!;
  if (t[a.tr]) out[b.tr] = t[a.tr]!;
  if (t[a.tg]) out[b.tg] = t[a.tg]!;
  return out;
};

/** Chuẩn hóa: bộ ba có TX được chuyển về dòng otherTaxGroupOf(TX). Xung đột (2 bộ cùng nhóm) → bộ ở đúng dòng giữ chỗ, bộ kia giữ dòng cũ. */
export function normalizeOtherTaxes(values: Values): Values {
  const rest: Values = {};
  for (const [k, v] of Object.entries(values)) if (!SLOT_KEY.test(k)) rest[k] = v;
  const slots = new Map<number, Values>();
  const taken = new Set<number>();
  const movers: { n: number; g: number; t: Values }[] = [];
  for (const n of SLOTS) {
    const t = triple(values, n);
    if (Object.keys(t).length === 0) continue;
    const g = otherTaxGroupOf(t[otherTaxKeys(n).tx]);
    if (g !== null && g !== n) movers.push({ n, g, t });
    else { slots.set(n, t); taken.add(n); }
  }
  for (const { n, g, t } of movers) {
    if (!taken.has(g)) { slots.set(g, retarget(t, n, g)); taken.add(g); }
    else if (!taken.has(n)) { slots.set(n, t); taken.add(n); }
    else {
      const free = SLOTS.find((s) => !taken.has(s));
      if (free === undefined) throw new Error("other-tax: không còn ô trống");
      slots.set(free, retarget(t, n, free)); taken.add(free);
    }
  }
  const out: Values = { ...rest };
  for (const n of SLOTS) Object.assign(out, slots.get(n) ?? {});
  return out;
}

/** Dồn ô từ giá trị đã chuẩn hóa: bỏ dòng trống, dòng sau lên trước. slotToGroup[k-1] = nhóm của ô k. */
export function compactOtherTaxes(values: Values): { values: Values; slotToGroup: number[] } {
  const out: Values = {};
  for (const [k, v] of Object.entries(values)) if (!SLOT_KEY.test(k)) out[k] = v;
  const slotToGroup: number[] = [];
  for (const g of SLOTS) {
    const t: Values = {};
    for (const key of Object.values(otherTaxKeys(g))) if ((values[key] ?? "") !== "") t[key] = values[key]!;
    if (Object.keys(t).length === 0) continue;
    slotToGroup.push(g);
    Object.assign(out, retarget(t, g, slotToGroup.length));
  }
  return { values: out, slotToGroup };
}

export type OtherTaxIssueReason = "OTHER_TAX_WRONG_GROUP" | "OTHER_TAX_DUPLICATE_GROUP" | "OTHER_TAX_EXEMPT_MISMATCH" | "OTHER_TAX_EXEMPT_WITHOUT_CODE";
export type OtherTaxIssue = { group: number; key: string; reason: OtherTaxIssueReason };

/** Lỗi chặn truyền; nhận giá trị đã normalize. */
export function otherTaxIssues(values: Values): OtherTaxIssue[] {
  const issues: OtherTaxIssue[] = [];
  for (const n of SLOTS) {
    const k = otherTaxKeys(n);
    const tx = clean(values[k.tx]);
    const tr = clean(values[k.tr]);
    const tg = (values[k.tg] ?? "").trim();
    if (tx) {
      const g = otherTaxGroupOf(tx);
      if (g === null) issues.push({ group: n, key: k.tx, reason: "OTHER_TAX_WRONG_GROUP" });
      // Lệch dòng: "trùng loại" chỉ khi dòng khác đang có mã cùng loại; không thì mã nằm sai dòng (không có mã nào khác của loại đó).
      else if (g !== n) issues.push({ group: n, key: k.tx, reason: SLOTS.some((m) => m !== n && otherTaxGroupOf(values[otherTaxKeys(m).tx]) === g) ? "OTHER_TAX_DUPLICATE_GROUP" : "OTHER_TAX_WRONG_GROUP" });
      else if (tr && otherTaxGroupOf(tr) !== g) issues.push({ group: n, key: k.tr, reason: "OTHER_TAX_EXEMPT_MISMATCH" });
    } else if (tr || tg) {
      issues.push({ group: n, key: tr ? k.tr : k.tg, reason: "OTHER_TAX_EXEMPT_WITHOUT_CODE" });
    }
  }
  return issues;
}

/** Các lệnh sửa để lưu dữ liệu người khai cũ về dạng chuẩn hóa: xóa khóa lệch (value "") rồi ghi khóa đúng dòng. Đã chuẩn → []. */
export function normalizationEdits(own: Values): { key: string; value: string }[] {
  const norm = normalizeOtherTaxes(own);
  const removals: { key: string; value: string }[] = [];
  const writes: { key: string; value: string }[] = [];
  for (const n of SLOTS) for (const key of Object.values(otherTaxKeys(n))) {
    const before = own[key] ?? "";
    const after = norm[key] ?? "";
    if (before === after) continue;
    if (after === "") removals.push({ key, value: "" });
    else writes.push({ key, value: after });
  }
  return [...removals, ...writes];
}

/** Mã thuế (TX) đang có trên dòng hàng theo thứ tự nhóm 1..5: gộp tự điền + người khai rồi chuẩn hóa (dùng cho AMA lấy từ tờ khai gốc). */
export function otherTaxCodes(auto: Values, own: Values): { group: 1 | 2 | 3 | 4 | 5; code: string }[] {
  const norm = normalizeOtherTaxes(mergeOtherTaxes(auto, own));
  return OTHER_TAX_GROUPS.flatMap((g) => {
    const code = clean(norm[otherTaxKeys(g.group).tx]);
    return code ? [{ group: g.group, code }] : [];
  });
}
