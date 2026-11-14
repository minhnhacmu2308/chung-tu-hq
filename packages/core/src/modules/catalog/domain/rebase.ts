// Đổi ĐVT gốc của một mặt hàng (spec 2026-11-14 §2) + so thông tin mặt hàng từ bộ nguồn gốc – code thuần, Decimal (bất biến 3).
import { itemUnitKey, type CatalogItemFields, type CatalogItemKind } from "@kb/contracts";
import { Decimal } from "../../../shared/decimal.js";

/** Số chữ số thập phân của hệ số (numeric(24,9)). */
export const CATALOG_FACTOR_SCALE = 9;

export type RebaseConversion = { unit: string; factor: string };
export type RebaseLineFactor = { id: string; factor: string };
export type RebaseInput = {
  baseUnit: string | null;
  /** ĐVT gốc mới (ĐVT của mã ở bộ nguồn gốc). */
  newBase: string;
  /** Quy đổi hiện có: "1 unit = factor baseUnit". */
  conversions: readonly RebaseConversion[];
  /** Hệ số theo lô trên dòng tờ khai (đơn vị = ĐVT gốc cũ). */
  lineFactors?: readonly RebaseLineFactor[];
  /** f = số ĐVT gốc cũ trong 1 ĐVT gốc mới – dùng khi chưa có quy đổi của `newBase`. */
  factor?: string;
};
export type RebaseChange = { unit: string; oldValue: string; newValue: string };
export type RebasePlan =
  | { kind: "SAME" }
  /** Mặt hàng chưa có ĐVT gốc → đặt luôn, không quy đổi gì. */
  | { kind: "SET_BASE" }
  /** Thiếu hệ số (hoặc hệ số sai / kết quả tròn về 0) → không đổi được. */
  | { kind: "NO_FACTOR" }
  | {
      kind: "REBASE";
      factor: string;
      /** Danh sách quy đổi mới đầy đủ (theo gốc mới), sắp theo ĐVT. */
      conversions: RebaseConversion[];
      /** Thay đổi từng ĐVT (thêm: oldValue ""; bỏ: newValue "") – cho field_audit `conv:<ĐVT>`. */
      changes: RebaseChange[];
      lineFactors: { id: string; oldValue: string; newValue: string }[];
    };

const positive = (s: string | undefined): Decimal | null => {
  if (!s || !/^\d+(\.\d+)?$/.test(s.trim())) return null;
  const d = new Decimal(s.trim());
  return d.gt(0) ? d : null;
};
const round = (d: Decimal) => d.toDecimalPlaces(CATALOG_FACTOR_SCALE, Decimal.ROUND_HALF_UP);
const plain = (s: string) => new Decimal(s).toFixed();

/**
 * Gốc cũ B, gốc mới N, f = số B trong 1 N. Mỗi quy đổi `1 X = x B` (X ≠ N) → `1 X = x / f N`; thêm `1 B = 1 / f N`; bỏ dòng của N.
 * Hệ số theo lô chia f. Làm tròn 9 chữ số thập phân ROUND_HALF_UP; một giá trị tròn về 0 → NO_FACTOR (không ghi hệ số 0).
 */
export function planRebase(input: RebaseInput): RebasePlan {
  const newKey = itemUnitKey(input.newBase);
  if (!input.baseUnit) return { kind: "SET_BASE" };
  const baseKey = itemUnitKey(input.baseUnit);
  if (baseKey === newKey) return { kind: "SAME" };
  const existing = input.conversions.find((c) => itemUnitKey(c.unit) === newKey);
  const f = positive(existing?.factor) ?? (existing ? null : positive(input.factor));
  if (!f) return { kind: "NO_FACTOR" };

  const next: RebaseConversion[] = [];
  const changes: RebaseChange[] = [];
  for (const c of input.conversions) {
    const k = itemUnitKey(c.unit);
    if (k === newKey) {
      changes.push({ unit: c.unit, oldValue: plain(c.factor), newValue: "" });
      continue;
    }
    if (k === baseKey) continue;
    const v = round(new Decimal(c.factor).div(f));
    if (v.isZero()) return { kind: "NO_FACTOR" };
    next.push({ unit: c.unit, factor: v.toFixed() });
    changes.push({ unit: c.unit, oldValue: plain(c.factor), newValue: v.toFixed() });
  }
  const back = round(new Decimal(1).div(f));
  if (back.isZero()) return { kind: "NO_FACTOR" };
  next.push({ unit: input.baseUnit, factor: back.toFixed() });
  changes.push({ unit: input.baseUnit, oldValue: "", newValue: back.toFixed() });

  const lineFactors: { id: string; oldValue: string; newValue: string }[] = [];
  for (const l of input.lineFactors ?? []) {
    const v = round(new Decimal(l.factor).div(f));
    if (v.isZero()) return { kind: "NO_FACTOR" };
    lineFactors.push({ id: l.id, oldValue: plain(l.factor), newValue: v.toFixed() });
  }
  const byUnit = <X extends { unit: string }>(a: X, b: X) => itemUnitKey(a.unit).localeCompare(itemUnitKey(b.unit));
  return { kind: "REBASE", factor: f.toFixed(), conversions: next.sort(byUnit), changes: changes.sort(byUnit), lineFactors };
}

/** Thông tin mặt hàng mà bộ nguồn gốc quyết định (ngoài ĐVT gốc). */
export type SourceItemFields = {
  name: string;
  hsCode: string | null;
  kind: CatalogItemKind;
  origin: string | null;
  tariffSchedule: string | null;
  importDutyRate: string | null;
  vatRate: string | null;
  envTaxRate: string | null;
  exciseRate: string | null;
  safeguardRate: string | null;
  antiDiscriminationRate: string | null;
  description: string | null;
  note: string | null;
};
const FIELD_KEYS = ["name", "hsCode", "kind", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate", "description", "note"] as const;
const RATE_KEYS = new Set<string>(["importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"]);

/** Các trường của `incoming` có giá trị và khác mặt hàng (thuế suất so theo giá trị: "5" = "5.0000") → patch + thay đổi cho field_audit. */
export function diffItemFields(item: SourceItemFields, incoming: CatalogItemFields): { patch: Partial<SourceItemFields>; changes: { key: string; oldValue: string; newValue: string }[] } {
  const patch: Partial<SourceItemFields> = {};
  const changes: { key: string; oldValue: string; newValue: string }[] = [];
  for (const k of FIELD_KEYS) {
    const v = incoming[k];
    if (v === undefined || v === "") continue;
    const cur = item[k];
    const same = cur !== null && (RATE_KEYS.has(k) ? new Decimal(cur).eq(new Decimal(v)) : cur === v);
    if (same) continue;
    (patch as Record<string, string>)[k] = v;
    changes.push({ key: k, oldValue: cur ?? "", newValue: v });
  }
  return { patch, changes };
}
