// Dựng tờ khai nháp từ shipment + hồ sơ + tài khoản + dòng hàng (thuần): ánh xạ chỉ tiêu, khoản điều chỉnh, trị giá, thuế.
import type { Shipment } from "@kb/contracts";
import type { DossierInfo, OrgInfo, StoredField } from "./types.js";
import { planAdjustments } from "./adjustments.js";
import { EDA_MAPPINGS } from "./mapping/eda.js";
import { IDA_MAPPINGS } from "./mapping/ida.js";
import type { ExchangeInfo, FieldMapping, MappingInput } from "./mapping/types.js";
import { computeTaxes, type TaxResult } from "./tax.js";
import { allocateCustomsValue, type Adjustment, type Valuation } from "./valuation.js";
export type { ExchangeInfo } from "./mapping/types.js";

export type BuildInput = { shipment: Shipment; dossier: DossierInfo; org: OrgInfo; items: { id: string; amount: string; importDutyRate: string | null; vatRate: string | null }[]; now: Date; exchange: ExchangeInfo };
export type BuiltDeclaration = { kind: "IDA" | "EDA"; fields: Record<string, StoredField>; adjustments: Adjustment[]; valuation: Valuation; taxes: TaxResult; notes: string[]; suspectCount: number };

export function mappingsFor(kind: "IDA" | "EDA"): FieldMapping[] {
  return kind === "IDA" ? IDA_MAPPINGS : EDA_MAPPINGS;
}

export function buildDeclaration(input: BuildInput): BuiltDeclaration {
  const kind = input.dossier.direction === "NK" ? "IDA" : "EDA";
  const plan = kind === "IDA" ? planAdjustments(input.shipment) : { adjustments: [], notes: [] };
  const currency = input.shipment.invoice.currency.value ?? input.dossier.currency;
  const valuation = allocateCustomsValue({ items: input.items.map((i) => ({ id: i.id, amount: i.amount })), adjustments: plan.adjustments, currency, rates: input.exchange.rates });
  const taxes = computeTaxes(valuation.perItem.map((p) => {
    const it = input.items.find((x) => x.id === p.id)!;
    return { id: p.id, customsValueVnd: p.customsValueVnd, importDutyRate: it.importDutyRate, vatRate: it.vatRate };
  }));
  const ctx: MappingInput = { shipment: input.shipment, dossier: input.dossier, org: input.org, now: input.now, adjustments: valuation.adjustments, valuation, exchange: input.exchange };
  const fields: Record<string, StoredField> = {};
  for (const m of mappingsFor(kind)) {
    const v = m.from(ctx);
    const suspect = v.suspect === true || (m.required && v.value === null);
    const note = v.note ?? (m.required && v.value === null ? "Chỉ tiêu bắt buộc chưa có dữ liệu" : undefined);
    fields[m.code] = { no: m.no ?? "", label: m.label, section: m.section, value: v.value ?? "", source: v.source, ...(suspect ? { suspect: true } : {}), ...(note ? { note } : {}) };
  }
  return { kind, fields, adjustments: valuation.adjustments, valuation, taxes, notes: [...plan.notes, ...valuation.warnings], suspectCount: Object.values(fields).filter((f) => f.suspect).length };
}
