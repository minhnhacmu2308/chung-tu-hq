import { Decimal } from "decimal.js";

// Độ chính xác cao; nhân giữ nguyên, chia (sang đơn vị không phải gốc) giữ 40 chữ số có nghĩa.
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

// Chỉ nhận số không âm dạng 123 hoặc 1.5: từ chối số âm, dạng mũ (1e3) và dấu "," ngăn cách.
const toDec = (s: string | undefined): InstanceType<typeof D> | null => (s !== undefined && /^\d+(\.\d+)?$/.test(s.trim()) ? new D(s.trim()) : null);
const plain = (d: InstanceType<typeof D>) => d.toFixed();

export type ItemUnitConversionTable = { base: string; factors: Record<string, string> };

/** Chuẩn hóa mã ĐVT để so sánh (bỏ khoảng trắng đầu/cuối, viết hoa) – dùng chung cho ghép và quy đổi. */
export const itemUnitKey = (u: string): string => u.trim().toUpperCase();

/**
 * Quy đổi `qty` từ `fromUnit` sang `toUnit` qua đơn vị gốc: 1 `unit` = `factor` đơn vị gốc.
 * `lotFactor` (hệ số theo lô) thắng hệ số mặc định của `fromUnit`. Thiếu hệ số hoặc số sai → null (không tự nhân 1).
 */
export function convertItemQty(qty: string, fromUnit: string, toUnit: string, conv: ItemUnitConversionTable, lotFactor?: string): { qty: string; factor: string } | null {
  const q = toDec(qty);
  if (!q) return null;
  const from0 = itemUnitKey(fromUnit);
  const to0 = itemUnitKey(toUnit);
  const base = itemUnitKey(conv.base);
  const factors = new Map(Object.entries(conv.factors).map(([k, v]) => [itemUnitKey(k), v]));
  if (from0 === to0) return { qty: plain(q), factor: "1" };
  const from = from0 === base ? new D(1) : toDec(lotFactor ?? factors.get(from0));
  const to = to0 === base ? new D(1) : toDec(factors.get(to0));
  if (!from || !to || from.isZero() || to.isZero()) return null;
  const factor = from.div(to);
  return { qty: plain(q.mul(factor)), factor: plain(factor) };
}

/** ĐVT số lượng 2 của mặt hàng (spec 2026-11-14 số lượng 2): `factor` = số ĐVT 2 trong 1 ĐVT gốc; null khi ĐVT 2 = ĐVT gốc (tỷ lệ 1). */
export type ItemQty2 = { unit: string; factor: string | null };

/** Số chữ số thập phân của Số lượng (2) trên tờ khai (1.84 IDA / 2.73 EDA – HAG_QN2 tối đa 2 số lẻ). */
export const QTY2_SCALE = 2;
/** Số chữ số thập phân của tỷ lệ ĐVT 2 (numeric(24,9) như hệ số quy đổi). */
export const QTY2_FACTOR_SCALE = 9;

/** Tỷ lệ "số ĐVT 2 trong 1 ĐVT gốc" đã chuẩn hóa: ĐVT 2 = gốc → "1"; thiếu tỷ lệ (ĐVT 2 khác gốc) / số sai → null. */
export function itemQty2Factor(qty2: ItemQty2 | null | undefined, baseUnit: string | null | undefined): string | null {
  if (!qty2?.unit.trim()) return null;
  if (baseUnit && itemUnitKey(qty2.unit) === itemUnitKey(baseUnit)) return "1";
  const f = toDec(qty2.factor ?? undefined);
  return f && !f.isZero() ? plain(f) : null;
}

/**
 * Số lượng (2) của dòng tờ khai (HAG_QN2/QT2) theo ĐVT 2 của mặt hàng: SL dòng × hệ số dòng→gốc × tỷ lệ ĐVT 2, làm tròn 2 số lẻ ROUND_HALF_UP.
 * Hệ số dòng→gốc: ĐVT dòng = gốc → 1; không thì hệ số theo lô `lotFactor` (thắng) hoặc quy đổi danh mục. ĐVT 2 = ĐVT dòng → giữ nguyên lượng (tỷ lệ 1).
 * Không quy được về gốc / thiếu tỷ lệ / số sai → null (nơi gọi giữ mặc định cũ SL2 = SL1). `factor` = số ĐVT 2 trên 1 ĐVT dòng.
 */
export function itemQuantity2(
  line: { qty: string; unit: string; lotFactor?: string | null | undefined },
  conv: ItemUnitConversionTable | null | undefined,
  qty2: ItemQty2 | null | undefined,
): { qty: string; unit: string; factor: string } | null {
  const q = toDec(line.qty);
  if (!q || !qty2?.unit.trim()) return null;
  const unit = qty2.unit.trim();
  if (itemUnitKey(unit) === itemUnitKey(line.unit)) return { qty: q.toDecimalPlaces(QTY2_SCALE, D.ROUND_HALF_UP).toFixed(), unit, factor: "1" };
  if (!conv?.base.trim()) return null;
  const ratio = itemQty2Factor(qty2, conv.base);
  if (!ratio) return null;
  let toBase: InstanceType<typeof D> | null;
  if (itemUnitKey(line.unit) === itemUnitKey(conv.base)) toBase = new D(1);
  else {
    const def = Object.entries(conv.factors).find(([k]) => itemUnitKey(k) === itemUnitKey(line.unit))?.[1];
    toBase = toDec(line.lotFactor ?? def);
  }
  if (!toBase || toBase.isZero()) return null;
  const factor = toBase.mul(ratio);
  return { qty: q.mul(factor).toDecimalPlaces(QTY2_SCALE, D.ROUND_HALF_UP).toFixed(), unit, factor: plain(factor) };
}

/**
 * Đổi gốc (gốc cũ `oldBase` → mới `newBase`, 1 mới = `f` cũ): tỷ lệ ĐVT 2 mới = cũ × f (9 số lẻ ROUND_HALF_UP); ĐVT 2 = gốc mới → "1".
 * Tỷ lệ cũ trống mà ĐVT 2 = gốc cũ → coi là 1. Không có ĐVT 2 / không tính được → null (giữ nguyên).
 */
export function rebaseQty2Factor(qty2: ItemQty2 | null | undefined, oldBase: string, newBase: string, f: string): string | null {
  if (!qty2?.unit.trim()) return null;
  if (itemUnitKey(qty2.unit) === itemUnitKey(newBase)) return "1";
  const cur = itemQty2Factor(qty2, oldBase);
  const ff = toDec(f);
  if (!cur || !ff || ff.isZero()) return null;
  const v = new D(cur).mul(ff).toDecimalPlaces(QTY2_FACTOR_SCALE, D.ROUND_HALF_UP);
  return v.isZero() ? null : plain(v);
}

/** Hệ số lô lệch quá `tolerance` (mặc định 20%) so với hệ số mặc định → true (chỉ cảnh báo, không chặn). */
export function itemLotFactorDeviates(lotFactor: string, defaultFactor: string, tolerance = "0.2"): boolean {
  const l = toDec(lotFactor);
  const d = toDec(defaultFactor);
  if (!l || !d || d.isZero()) return false;
  return l.minus(d).abs().div(d).gt(tolerance);
}
