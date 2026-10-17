// Khoản điều chỉnh cộng vào trị giá tính thuế theo Incoterm (PRODUCT §7.3). Thuần.
import type { DocKind, Shipment, ValueSource } from "@kb/contracts";
import type { Adjustment } from "./valuation.js";

const SOURCE_BY_KIND: Partial<Record<DocKind, ValueSource>> = { FREIGHT_INVOICE: "FREIGHT_INVOICE", ARRIVAL_NOTICE: "ARRIVAL_NOTICE", BILL_OF_LADING: "BILL_OF_LADING", INVOICE: "INVOICE", SALES_CONTRACT: "CONTRACT" };
/** Phí nội địa (THC, D/O, CFS, lưu kho…) không cộng vào trị giá tính thuế. */
const DOMESTIC = /THC|D\/O|CFS|HANDLING|LOCAL|ĐỊA PHƯƠNG|DIA PHUONG|LƯU|LUU KHO|STORAGE|CLEANING|VỆ SINH|SEAL|CIC|EBS\b/i;
export const FREIGHT_NOT_INCLUDED = new Set(["EXW", "FCA", "FAS", "FOB"]);
const FREIGHT_LABEL = /FREIGHT|CƯỚC|O\/F|OCEAN|AIR FREIGHT/i;

/** Điều kiện giá đã gồm phí bảo hiểm – không khai 1.48, không cộng bảo hiểm vào trị giá (TT39 PL II chỉ tiêu 1.48; DPU là điều kiện nhóm D như DAP). */
export const INSURANCE_INCLUDED = new Set(["CIF", "CIP", "C&I", "DDU", "DDP", "DAP", "DAF", "DAT", "DPU"]);
/** Mã điều kiện giao hàng chỉ tiêu 1.44 ô 2 / 2.39 ô 1 (TT39 PL II; TT121 thêm DPU cho Mẫu 01 – Mẫu 02 không có DPU). */
const INCOTERM_CODES = ["EXW", "FCA", "FAS", "FOB", "CFR", "C&F", "CIF", "C&I", "CPT", "CIP", "DAP", "DPU", "DDP", "DAT", "DAF", "DDU", "DES", "DEQ"];

/** "FOB BUSAN", "CIF Hai Phong", "C & F" → mã điều kiện (trích xuất chấp nhận điều kiện kèm địa danh). CNF = C&F. Không phải mã → giữ nguyên chữ viết hoa. */
export function incotermCode(raw: string | null): string {
  const v = (raw ?? "").trim().toUpperCase().replace(/^C\s*(&|AND)\s*([FI])\b/, "C&$2").replace(/^CNF\b/, "C&F");
  return INCOTERM_CODES.find((c) => v.startsWith(c) && !/[A-Z0-9&]/.test(v.charAt(c.length))) ?? v;
}
export const isIncotermCode = (code: string, kind: "IDA" | "EDA") => INCOTERM_CODES.includes(code) && !(kind === "EDA" && code === "DPU");

export type AdjustmentPlan = { adjustments: Adjustment[]; notes: string[] };

export function planAdjustments(s: Shipment): AdjustmentPlan {
  const incoterm = incotermCode(s.invoice.incoterm.value);
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
  if (s.charges.insurance.value !== null && !INSURANCE_INCLUDED.has(incoterm)) {
    out.push({ label: "Phí bảo hiểm", amount: s.charges.insurance.value, currency: s.charges.insuranceCurrency?.value ?? currency, source: src(s.charges.insurance.sources[0]?.kind, "SYSTEM"), kind: "ADD" });
  }
  for (const o of s.charges.other) {
    if (DOMESTIC.test(o.label)) continue;
    // Cước nằm trong "phí khác": bỏ khi giá đã gồm cước (CIF, CFR, DAP…) hoặc đã cộng cước từ hóa đơn cước – tránh cộng hai lần.
    const freightIncluded = incoterm !== "" && !FREIGHT_NOT_INCLUDED.has(incoterm);
    if (FREIGHT_LABEL.test(o.label) && (freightIncluded || out.some((a) => a.label.startsWith("Cước")))) continue;
    out.push({ label: o.label, amount: o.amount, currency: o.currency, source: src(o.sourceKind, "SYSTEM"), kind: "ADD" });
  }
  return { adjustments: out, notes };
}

/**
 * Điều kiện giá xuất khẩu không phải trừ cước/bảo hiểm: nhóm E/F (giá chưa gồm cước quốc tế) và FOB/DAP/DAF –
 * chỉ tiêu 2.40 Phụ lục II: điều kiện giá FOB, DAP, DAF thì không khai trị giá tính thuế (lấy theo giá hóa đơn).
 */
export const EXPORT_NO_DEDUCTION = new Set(["EXW", "FCA", "FAS", "FOB", "DAP", "DAF"]);

/**
 * Tờ khai xuất (EDA): trị giá hải quan là giá bán đến cửa khẩu xuất, KHÔNG gồm phí vận tải quốc tế và phí bảo hiểm quốc tế
 * (Điều 7 TT39/2015/TT-BTC; chỉ tiêu 2.40 Phụ lục II). Giá hóa đơn đã gồm cước/bảo hiểm (CFR, CIF, CPT, CIP, nhóm D…) → trừ ra.
 * Chưa có số cước/bảo hiểm thì không trừ bừa – ghi chú để người khai bổ sung.
 */
export function planExportAdjustments(s: Shipment): AdjustmentPlan {
  const incoterm = incotermCode(s.invoice.incoterm.value);
  const currency = s.invoice.currency.value ?? "";
  const out: Adjustment[] = [];
  const notes: string[] = [];
  const src = (kind: DocKind | undefined, fallback: ValueSource): ValueSource => (kind && SOURCE_BY_KIND[kind]) || fallback;
  if (!incoterm || EXPORT_NO_DEDUCTION.has(incoterm)) {
    if (incoterm === "EXW") notes.push("EXW: trị giá tính thuế xuất khẩu phải gồm chi phí đưa hàng đến cửa khẩu xuất – bổ sung ở chỉ tiêu 2.40 nếu có");
    return { adjustments: out, notes };
  }
  const freightIncluded = incoterm !== "C&I";
  if (freightIncluded) {
    if (s.charges.freight.value !== null) {
      out.push({ label: "Cước vận chuyển quốc tế", amount: s.charges.freight.value, currency: s.charges.freightCurrency?.value ?? currency, source: src(s.charges.freight.sources[0]?.kind, "SYSTEM"), kind: "SUBTRACT" });
    } else {
      notes.push(`${incoterm}: giá hóa đơn đã gồm cước quốc tế – cần số cước để trừ ra khi tính trị giá tính thuế xuất khẩu (chỉ tiêu 2.40)`);
    }
  }
  if (INSURANCE_INCLUDED.has(incoterm)) {
    if (s.charges.insurance.value !== null) {
      out.push({ label: "Phí bảo hiểm", amount: s.charges.insurance.value, currency: s.charges.insuranceCurrency?.value ?? currency, source: src(s.charges.insurance.sources[0]?.kind, "SYSTEM"), kind: "SUBTRACT" });
    } else {
      notes.push(`${incoterm}: giá hóa đơn đã gồm bảo hiểm quốc tế – cần phí bảo hiểm để trừ ra (chỉ tiêu 2.40)`);
    }
  }
  return { adjustments: out, notes };
}

/** Khoản điều chỉnh theo chiều tờ khai: nhập cộng (1.47–1.49), xuất trừ về giá tại cửa khẩu xuất (2.40). */
export const planAdjustmentsFor = (kind: "IDA" | "EDA", s: Shipment): AdjustmentPlan => (kind === "IDA" ? planAdjustments(s) : planExportAdjustments(s));
