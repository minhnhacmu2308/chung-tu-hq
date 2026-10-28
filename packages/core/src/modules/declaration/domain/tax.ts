// Thuế dự kiến (thuần, Decimal) theo đặc tả VNACCS IDA (docs/tinhthue/1001-1_IDA_Service Specification.docx, mục 7 (4)–(14)):
// thuế NK = trị giá × thuế suất NK; TTĐB = (trị giá + thuế NK + thuế bổ sung) × thuế suất TTĐB;
// GTGT = (trị giá + thuế NK + thuế bổ sung + TTĐB + BVMT) × thuế suất GTGT. Làm tròn VND HALF_UP từng dòng
// (VNACCS làm tròn 4 số lẻ, tròn đồng ở tổng – lệch ≤ 0,5 đồng/dòng/sắc thuế; xem skill mapping-declaration-fields).
import { Decimal, dec } from "../../../shared/decimal.js";

export type TaxableItem = {
  id: string; customsValueVnd: string; importDutyRate: string | null; vatRate: string | null;
  /** Thuế bổ sung đã tính (chống bán phá giá, chống trợ cấp, tự vệ…), VND – vắng = 0. */
  additionalDutyVnd?: string | null;
  /** Thuế suất TTĐB (%) – vắng = không chịu TTĐB. */
  specialConsumptionRate?: string | null;
  /** Thuế BVMT đã tính theo lượng × mức thuế, VND – vắng = 0. */
  environmentTaxVnd?: string | null;
};
export type TaxResult = {
  perItem: { id: string; importDutyVnd: string; specialConsumptionVnd: string; vatVnd: string }[];
  importDutyVnd: string; specialConsumptionVnd: string; vatVnd: string;
};

const vnd = (d: Decimal) => d.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
const pct = (rate: string | null | undefined) => dec(rate ?? "0").div(100);

export function computeTaxes(items: TaxableItem[]): TaxResult {
  let duty = dec(0);
  let special = dec(0);
  let vat = dec(0);
  const perItem = items.map((it) => {
    const value = dec(it.customsValueVnd);
    const d = vnd(value.mul(pct(it.importDutyRate)));
    const additional = dec(it.additionalDutyVnd ?? "0");
    const s = vnd(value.plus(d).plus(additional).mul(pct(it.specialConsumptionRate)));
    const env = dec(it.environmentTaxVnd ?? "0");
    const v = vnd(value.plus(d).plus(additional).plus(s).plus(env).mul(pct(it.vatRate)));
    duty = duty.plus(d);
    special = special.plus(s);
    vat = vat.plus(v);
    return { id: it.id, importDutyVnd: d.toFixed(0), specialConsumptionVnd: s.toFixed(0), vatVnd: v.toFixed(0) };
  });
  return { perItem, importDutyVnd: duty.toFixed(0), specialConsumptionVnd: special.toFixed(0), vatVnd: vat.toFixed(0) };
}
