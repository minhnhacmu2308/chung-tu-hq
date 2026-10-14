// Khoản điều chỉnh cộng vào trị giá tính thuế theo Incoterm (PRODUCT §7.3). Thuần.
import type { DocKind, Shipment, ValueSource } from "@kb/contracts";
import type { Adjustment } from "./valuation.js";

const SOURCE_BY_KIND: Partial<Record<DocKind, ValueSource>> = { FREIGHT_INVOICE: "FREIGHT_INVOICE", ARRIVAL_NOTICE: "ARRIVAL_NOTICE", BILL_OF_LADING: "BILL_OF_LADING", INVOICE: "INVOICE", SALES_CONTRACT: "CONTRACT" };
/** Phí nội địa (THC, D/O, CFS, lưu kho…) không cộng vào trị giá tính thuế. */
const DOMESTIC = /THC|D\/O|CFS|HANDLING|LOCAL|ĐỊA PHƯƠNG|DIA PHUONG|LƯU|LUU KHO|STORAGE|CLEANING|VỆ SINH|SEAL|CIC|EBS\b/i;
export const FREIGHT_NOT_INCLUDED = new Set(["EXW", "FCA", "FAS", "FOB"]);

export type AdjustmentPlan = { adjustments: Adjustment[]; notes: string[] };

export function planAdjustments(s: Shipment): AdjustmentPlan {
  const incoterm = (s.invoice.incoterm.value ?? "").toUpperCase();
  const currency = s.invoice.currency.value ?? "";
  const out: Adjustment[] = [];
  const notes: string[] = [];
  const src = (kind: DocKind | undefined, fallback: ValueSource): ValueSource => (kind && SOURCE_BY_KIND[kind]) || fallback;

  if (FREIGHT_NOT_INCLUDED.has(incoterm)) {
    if (s.charges.freight.value !== null) {
      out.push({ label: "Cước vận chuyển quốc tế", amount: s.charges.freight.value, currency: s.charges.freightCurrency?.value ?? currency, source: src(s.charges.freight.sources[0]?.kind, "SYSTEM"), kind: "ADD" });
    } else {
      notes.push(`${incoterm}: cần cước vận chuyển quốc tế để cộng vào trị giá – chưa có hóa đơn cước / Arrival Notice`);
    }
  } else if (incoterm) {
    notes.push(`${incoterm}: cước vận chuyển đã gồm trong giá hóa đơn`);
  }
  if (s.charges.insurance.value !== null && !["CIF", "CIP", "DAP", "DPU", "DDP"].includes(incoterm)) {
    out.push({ label: "Phí bảo hiểm", amount: s.charges.insurance.value, currency: s.charges.insuranceCurrency?.value ?? currency, source: src(s.charges.insurance.sources[0]?.kind, "SYSTEM"), kind: "ADD" });
  }
  for (const o of s.charges.other) {
    if (DOMESTIC.test(o.label)) continue;
    if (/FREIGHT|CƯỚC|O\/F|OCEAN|AIR FREIGHT/i.test(o.label) && out.some((a) => a.label.startsWith("Cước"))) continue;
    out.push({ label: o.label, amount: o.amount, currency: o.currency, source: src(o.sourceKind, "SYSTEM"), kind: "ADD" });
  }
  return { adjustments: out, notes };
}
