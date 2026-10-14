// Trị giá tính thuế (thuần, Decimal): trị giá hóa đơn + khoản điều chỉnh (mỗi khoản theo tiền tệ riêng) → VND → phân bổ theo trị giá dòng.
import type { ValueSource } from "@kb/contracts";
import { Decimal, dec } from "../../../shared/decimal.js";

export type Adjustment = { label: string; amount: string; currency: string; source: ValueSource; kind: "ADD" | "SUBTRACT"; /** VND / 1 đơn vị tiền tệ đã dùng khi dựng (để xem lại không cần tra tỷ giá). */ rate?: string };
/** `rates`: VND cho 1 đơn vị từng tiền tệ (VND → "1"); thiếu tiền tệ của khoản điều chỉnh → bỏ qua kèm cảnh báo. */
export type ValuationInput = { items: { id: string; amount: string }[]; adjustments: Adjustment[]; currency: string; rates: Record<string, string> };
export type Valuation = {
  invoiceTotal: string;
  /** Tổng khoản điều chỉnh đã quy đổi VND (dương cộng, âm trừ). */
  adjustmentsVnd: string;
  customsValueVnd: string;
  perItem: { id: string; customsValueVnd: string }[];
  /** Khoản điều chỉnh kèm tỷ giá đã dùng. */
  adjustments: Adjustment[];
  warnings: string[];
};

const vnd = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
export const rateOf = (rates: Record<string, string>, currency: string): string | null => (currency === "VND" ? "1" : (rates[currency] ?? null));

export function allocateCustomsValue(input: ValuationInput): Valuation {
  const amounts = input.items.map((i) => dec(i.amount));
  const invoiceTotal = amounts.reduce((a, b) => a.plus(b), dec(0));
  const warnings: string[] = [];
  const invoiceRate = rateOf(input.rates, input.currency);
  if (!invoiceRate) warnings.push(`Chưa có tỷ giá tính thuế cho ${input.currency}`);
  let adjVnd = dec(0);
  const adjustments: Adjustment[] = [];
  for (const a of input.adjustments) {
    const rate = a.rate ?? rateOf(input.rates, a.currency);
    if (!rate) {
      warnings.push(`Khoản điều chỉnh “${a.label}” (${a.currency}) chưa có tỷ giá – chưa cộng vào trị giá`);
      adjustments.push(a);
      continue;
    }
    const v = dec(a.amount).mul(rate);
    adjVnd = a.kind === "SUBTRACT" ? adjVnd.minus(v) : adjVnd.plus(v);
    adjustments.push({ ...a, rate });
  }
  const totalVnd = vnd(invoiceTotal.mul(invoiceRate ?? "0").plus(adjVnd));
  let allocated = dec(0);
  const perItem = input.items.map((it, idx) => {
    const last = idx === input.items.length - 1;
    const share = invoiceTotal.isZero() ? dec(0) : vnd(totalVnd.mul(amounts[idx]!).div(invoiceTotal));
    const value = last ? totalVnd.minus(allocated) : share;
    allocated = allocated.plus(value);
    return { id: it.id, customsValueVnd: value.toFixed(0) };
  });
  return { invoiceTotal: invoiceTotal.toString(), adjustmentsVnd: vnd(adjVnd).toFixed(0), customsValueVnd: totalVnd.toFixed(0), perItem, adjustments, warnings };
}
