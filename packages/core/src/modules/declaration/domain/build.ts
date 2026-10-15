// Dựng tờ khai nháp từ shipment + hồ sơ + tài khoản + dòng hàng (thuần): ánh xạ chỉ tiêu, khoản điều chỉnh, trị giá, thuế.
import { CATALOG_EDA, CATALOG_IDA, type DeclarationFieldDef, type Shipment } from "@kb/contracts";
import type { DossierInfo, OrgInfo, StoredField } from "./types.js";
import { planAdjustments } from "./adjustments.js";
import { EDA_MAPPINGS } from "./mapping/eda.js";
import { IDA_MAPPINGS } from "./mapping/ida.js";
import type { ExchangeInfo, FieldMapping, MappingInput } from "./mapping/types.js";
import { computeTaxes, type TaxResult } from "./tax.js";
import { allocateCustomsValue, type Adjustment, type Valuation } from "./valuation.js";
export type { ExchangeInfo } from "./mapping/types.js";

export type BuildInput = {
  shipment: Shipment; dossier: DossierInfo; org: OrgInfo; now: Date; exchange: ExchangeInfo;
  items: { id: string; lineNo?: number; amount: string; importDutyRate: string | null; vatRate: string | null; hsConfirmed?: string | null }[];
};

/** Định nghĩa Phụ lục II của chỉ tiêu khi số chỉ tiêu ứng với đúng một mnemonic (ô ghép như 1.44 có 4 mnemonic → bỏ qua). */
export function fieldDef(kind: "IDA" | "EDA", code: string): DeclarationFieldDef | undefined {
  const mappings = mappingsFor(kind);
  const m = mappings.find((x) => x.code === code);
  if (!m?.no || mappings.filter((x) => x.no === m.no).length !== 1) return undefined;
  return (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === m.no);
}

/**
 * Chỉ tiêu văn bản một ô mà maxLen của catalog đúng là độ dài của ô người khai nhập. Chỉ tiêu nhiều ô (1.31 hô hiệu + tên tàu, địa chỉ 4 ô…)
 * có maxLen của ô 1 nên không xét; ô mã/số/ngày cũng không xét (giá trị hiển thị kèm tên).
 */
const LENGTH_CHECKED = new Set(["GHI_CHU", "SO_QLNB", "NXK_TEN", "NNK_TEN", "SO_HD", "SO_VD"]);

/** Ô văn bản vượt độ dài tối đa của chỉ tiêu (VNACCS cắt bỏ phần thừa) → thông báo. */
export function lengthIssue(kind: "IDA" | "EDA", code: string, value: string): string | undefined {
  if (!LENGTH_CHECKED.has(code)) return undefined;
  const def = fieldDef(kind, code);
  if (!def || def.type !== "text" || !def.maxLen || value.length <= def.maxLen) return undefined;
  return `Dài ${value.length} ký tự, vượt giới hạn ${def.maxLen} ký tự của chỉ tiêu ${def.no} – rút gọn${code === "GHI_CHU" ? ", phần còn lại khai qua HYS" : ""}`;
}
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
  const lines = input.items.flatMap((it) => (it.lineNo === undefined ? [] : [{ lineNo: it.lineNo, hsConfirmed: it.hsConfirmed ?? null }]));
  const ctx: MappingInput = { shipment: input.shipment, dossier: input.dossier, org: input.org, now: input.now, adjustments: valuation.adjustments, valuation, exchange: input.exchange, lines };
  const fields: Record<string, StoredField> = {};
  for (const m of mappingsFor(kind)) {
    const v = m.from(ctx);
    const tooLong = v.value === null ? undefined : lengthIssue(kind, m.code, v.value);
    const suspect = v.suspect === true || (m.required && v.value === null) || tooLong !== undefined;
    const note = [v.note ?? (m.required && v.value === null ? "Chỉ tiêu bắt buộc chưa có dữ liệu" : undefined), tooLong].filter(Boolean).join(". ") || undefined;
    fields[m.code] = { no: m.no ?? "", label: m.label, section: m.section, value: v.value ?? "", source: v.source, ...(suspect ? { suspect: true } : {}), ...(note ? { note } : {}), ...(v.blocking ? { blocking: true as const } : {}) };
  }
  return { kind, fields, adjustments: valuation.adjustments, valuation, taxes, notes: [...plan.notes, ...valuation.warnings], suspectCount: Object.values(fields).filter((f) => f.suspect).length };
}
