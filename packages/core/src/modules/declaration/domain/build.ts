// Dựng tờ khai nháp từ shipment + hồ sơ + tài khoản + dòng hàng (thuần): ánh xạ chỉ tiêu, khoản điều chỉnh, trị giá, thuế.
import type { Shipment } from "@kb/contracts";
import type { DossierInfo, OrgInfo, StoredField } from "./types.js";
import { planAdjustmentsFor } from "./adjustments.js";
import { lengthIssue } from "./field-length.js";
import { evaluateMapping } from "./mapping/evaluate.js";
import { mappingsFor } from "./mapping/registry.js";
import type { ExchangeInfo, FieldOverride, MappingInput } from "./mapping/types.js";
import { computeTaxes, type TaxResult } from "./tax.js";
import { allocateCustomsValue, type Adjustment, type Valuation } from "./valuation.js";
export type { ExchangeInfo } from "./mapping/types.js";

export type BuildInput = {
  shipment: Shipment; dossier: DossierInfo; org: OrgInfo; now: Date; exchange: ExchangeInfo;
  items: { id: string; lineNo?: number; amount: string; importDutyRate: string | null; vatRate: string | null; hsConfirmed?: string | null }[];
  /** Mặc định khai báo (theo chiều NK/XK) và ghi đè của doanh nghiệp. */
  profile?: Record<string, string>;
  overrides?: Record<string, FieldOverride>;
};

export { fieldDef, lengthIssue } from "./field-length.js";

export type BuiltDeclaration = { kind: "IDA" | "EDA"; fields: Record<string, StoredField>; /** Chỉ tiêu theo tình huống không áp dụng cho lô này (when = false). */ hidden: string[]; adjustments: Adjustment[]; valuation: Valuation; taxes: TaxResult; notes: string[]; suspectCount: number };

export { mappingsFor } from "./mapping/registry.js";

export function buildDeclaration(input: BuildInput): BuiltDeclaration {
  const kind = input.dossier.direction === "NK" ? "IDA" : "EDA";
  const plan = planAdjustmentsFor(kind, input.shipment);
  const currency = input.shipment.invoice.currency.value ?? input.dossier.currency;
  const valuation = allocateCustomsValue({ items: input.items.map((i) => ({ id: i.id, amount: i.amount })), adjustments: plan.adjustments, currency, rates: input.exchange.rates });
  const taxes = computeTaxes(valuation.perItem.map((p) => {
    const it = input.items.find((x) => x.id === p.id)!;
    // Tờ khai xuất: chưa có Biểu thuế xuất khẩu và không thu GTGT – không ước tính bằng thuế suất nhập khẩu (Hải quan tính, xem "Hải quan trả về").
    return kind === "IDA" ? { id: p.id, customsValueVnd: p.customsValueVnd, importDutyRate: it.importDutyRate, vatRate: it.vatRate } : { id: p.id, customsValueVnd: p.customsValueVnd, importDutyRate: null, vatRate: null };
  }));
  const lines = input.items.flatMap((it) => (it.lineNo === undefined ? [] : [{ lineNo: it.lineNo, hsConfirmed: it.hsConfirmed ?? null }]));
  const ctx: MappingInput = { shipment: input.shipment, dossier: input.dossier, org: input.org, now: input.now, adjustments: valuation.adjustments, valuation, exchange: input.exchange, profile: input.profile ?? {}, overrides: input.overrides ?? {}, lines };
  const fields: Record<string, StoredField> = {};
  const hidden: string[] = [];
  for (const m of mappingsFor(kind)) {
    if (m.when && !m.when.test(ctx)) {
      hidden.push(m.code);
      continue;
    }
    const v = evaluateMapping(m, ctx.overrides[m.code], ctx);
    const tooLong = v.value === null ? undefined : lengthIssue(kind, m.code, v.value);
    const suspect = v.suspect === true || (m.required && v.value === null) || tooLong !== undefined;
    const note = [v.note ?? (m.required && v.value === null ? "Chỉ tiêu bắt buộc chưa có dữ liệu" : undefined), tooLong].filter(Boolean).join(". ") || undefined;
    fields[m.code] = {
      no: m.no ?? "", label: m.label, section: m.section, value: v.value ?? "", source: v.source,
      ...(suspect ? { suspect: true } : {}), ...(note ? { note } : {}), provenance: v.provenance, ...(v.blocking ? { blocking: true as const } : {}), ...(m.when ? { condition: m.when.label } : {}),
    };
  }
  return { kind, fields, hidden, adjustments: valuation.adjustments, valuation, taxes, notes: [...plan.notes, ...valuation.warnings], suspectCount: Object.values(fields).filter((f) => f.suspect).length };
}
