// Thuế dự kiến (thuần, Decimal): thuế NK = trị giá tính thuế × thuế suất; VAT = (trị giá + thuế NK) × VAT. Làm tròn VND HALF_UP.
import { Decimal, dec } from "../../../shared/decimal.js";

export type TaxableItem = { id: string; customsValueVnd: string; importDutyRate: string | null; vatRate: string | null };
export type TaxResult = { perItem: { id: string; importDutyVnd: string; vatVnd: string }[]; importDutyVnd: string; vatVnd: string };

const vnd = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const pct = (rate: string | null) => dec(rate ?? "0").div(100);

export function computeTaxes(items: TaxableItem[]): TaxResult {
  let duty = dec(0);
  let vat = dec(0);
  const perItem = items.map((it) => {
    const value = dec(it.customsValueVnd);
    const d = vnd(value.mul(pct(it.importDutyRate)));
    const v = vnd(value.plus(d).mul(pct(it.vatRate)));
    duty = duty.plus(d);
    vat = vat.plus(v);
    return { id: it.id, importDutyVnd: d.toFixed(0), vatVnd: v.toFixed(0) };
  });
  return { perItem, importDutyVnd: duty.toFixed(0), vatVnd: vat.toFixed(0) };
}
