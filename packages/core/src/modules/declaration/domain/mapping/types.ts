// Ánh xạ dữ liệu lô hàng → chỉ tiêu tờ khai (skill mapping-declaration-fields). Code thuần, cùng dữ liệu luôn ra cùng kết quả.
import type { DocKind, Shipment, Sourced, ValueSource } from "@kb/contracts";
import type { Adjustment, Valuation } from "../valuation.js";
import type { DossierInfo, OrgInfo } from "../types.js";

export type Section = "GENERAL" | "PARTIES" | "TRANSPORT" | "VALUE";
/** Tỷ giá theo ngày khai dự kiến: VND / 1 đơn vị từng tiền tệ (VND → "1"); `missing` = tiền tệ chưa có tỷ giá. */
export type ExchangeInfo = { date: string; rates: Record<string, string>; missing: string[] };
/** Ngày theo giờ Việt Nam (UTC+7) – ngày khai báo dự kiến, ngày tra tỷ giá. */
export const vnDate = (now: Date) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
export type MappedValue = { value: string | null; source: ValueSource; suspect?: boolean; note?: string };
export type MappingInput = { shipment: Shipment; dossier: DossierInfo; org: OrgInfo; now: Date; adjustments: Adjustment[]; valuation: Valuation; exchange: ExchangeInfo };
export type FieldMapping = {
  /** Khóa ổn định (mnemonic) dùng cho FE/API. */
  code: string;
  /** Số chỉ tiêu Phụ lục II; null khi chỉ tiêu không có trong tờ khai VNACCS (thông tin phụ cho người duyệt). */
  no: string | null;
  section: Section;
  label: string;
  /** Bắt buộc theo Phụ lục II: thiếu giá trị → suspect. */
  required: boolean;
  from: (i: MappingInput) => MappedValue;
};

const SOURCE_BY_KIND: Record<DocKind, ValueSource> = {
  INVOICE: "INVOICE", PACKING_LIST: "PACKING_LIST", BILL_OF_LADING: "BILL_OF_LADING", AIR_WAYBILL: "BILL_OF_LADING", CERT_OF_ORIGIN: "CERT_OF_ORIGIN",
  SALES_CONTRACT: "CONTRACT", ARRIVAL_NOTICE: "ARRIVAL_NOTICE", FREIGHT_INVOICE: "FREIGHT_INVOICE", OTHER: "SYSTEM",
};

/** Giá trị kèm nguồn từ Sourced: nguồn = chứng từ đầu tiên; CONFLICT/MODEL_UNSURE → suspect kèm ghi chú. */
export function fromSourced(s: Sourced<string>, fallback: ValueSource = "SYSTEM", transform?: (v: string) => string): MappedValue {
  const kind = s.sources[0]?.kind;
  const source: ValueSource = kind ? SOURCE_BY_KIND[kind] : fallback;
  const suspect = s.status === "CONFLICT" || s.status === "MODEL_UNSURE";
  const note = s.note ?? (s.status === "CONFLICT" ? "Các chứng từ không khớp nhau" : s.status === "MODEL_UNSURE" ? "Model không chắc giá trị này" : undefined);
  return { value: s.value === null ? null : transform ? transform(s.value) : s.value, source, ...(suspect ? { suspect: true } : {}), ...(note ? { note } : {}) };
}

/** "26150.000000" → "26150"; "3860.50" → "3860.5" (numeric của Postgres có 6 số lẻ). */
export const plainNumber = (v: string) => (/^-?\d+(\.\d+)?$/.test(v) ? v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : v);
export const fixed = (value: string, source: ValueSource = "DEFAULT"): MappedValue => ({ value, source });
export const missing = (source: ValueSource, note: string): MappedValue => ({ value: null, source, suspect: true, note });
