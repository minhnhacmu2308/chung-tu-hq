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

/** Hệ số lô lệch quá `tolerance` (mặc định 20%) so với hệ số mặc định → true (chỉ cảnh báo, không chặn). */
export function itemLotFactorDeviates(lotFactor: string, defaultFactor: string, tolerance = "0.2"): boolean {
  const l = toDec(lotFactor);
  const d = toDec(defaultFactor);
  if (!l || !d || d.isZero()) return false;
  return l.minus(d).abs().div(d).gt(tolerance);
}
