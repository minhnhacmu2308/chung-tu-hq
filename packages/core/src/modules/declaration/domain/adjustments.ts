// Khoản điều chỉnh cộng vào trị giá tính thuế theo Incoterm (PRODUCT §7.3). Thuần.
// Nguồn: chứng từ (shipment.charges) + chi phí người khai nhập ở bước OCR & kiểm tra (ValueCharges) – nhập tay thắng chứng từ.
import { ADJUSTMENT_CODES, EMPTY_VALUE_CHARGES, FREIGHT_REASON_LABELS, type DocKind, type ManualFreight, type Shipment, type ValueCharges, type ValueSource } from "@kb/contracts";
import type { Adjustment } from "./valuation.js";

const SOURCE_BY_KIND: Partial<Record<DocKind, ValueSource>> = { FREIGHT_INVOICE: "FREIGHT_INVOICE", ARRIVAL_NOTICE: "ARRIVAL_NOTICE", BILL_OF_LADING: "BILL_OF_LADING", INVOICE: "INVOICE", SALES_CONTRACT: "CONTRACT" };
/** Phí nội địa (THC, D/O, CFS, lưu kho…) không cộng vào trị giá tính thuế. */
const DOMESTIC = /THC|D\/O|CFS|HANDLING|LOCAL|ĐỊA PHƯƠNG|DIA PHUONG|LƯU|LUU KHO|STORAGE|CLEANING|VỆ SINH|SEAL|CIC|EBS\b/i;
export const FREIGHT_NOT_INCLUDED = new Set(["EXW", "FCA", "FAS", "FOB"]);
const FREIGHT_LABEL = /FREIGHT|CƯỚC|O\/F|OCEAN|AIR FREIGHT/i;
export const FREIGHT_ADJUSTMENT_LABEL = "Cước vận chuyển quốc tế";
export const INSURANCE_ADJUSTMENT_LABEL = "Phí bảo hiểm";

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

/**
 * Điều kiện giá xuất khẩu không phải trừ cước/bảo hiểm: nhóm E/F (giá chưa gồm cước quốc tế) và FOB/DAP/DAF –
 * chỉ tiêu 2.40 Phụ lục II: điều kiện giá FOB, DAP, DAF thì không khai trị giá tính thuế (lấy theo giá hóa đơn).
 */
export const EXPORT_NO_DEDUCTION = new Set(["EXW", "FCA", "FAS", "FOB", "DAP", "DAF"]);

/** Lô hàng phải có số cước: nhập khẩu nhóm E/F (cộng vào), xuất khẩu giá đã gồm cước (trừ ra). */
export function freightRequired(kind: "IDA" | "EDA", incoterm: string): boolean {
  if (kind === "IDA") return FREIGHT_NOT_INCLUDED.has(incoterm);
  return incoterm !== "" && !EXPORT_NO_DEDUCTION.has(incoterm) && incoterm !== "C&I";
}

/** Lý do chưa có số cước (hiện ở ghi chú tờ khai). */
export const freightReasonText = (f: ManualFreight) => `${FREIGHT_REASON_LABELS[f.reason]}${f.note ? `: ${f.note}` : ""}`;
const adjustmentLabel = (code: string) => ADJUSTMENT_CODES.find((c) => c.code === code)?.label ?? `Khoản điều chỉnh ${code}`;

export type AdjustmentPlan = { adjustments: Adjustment[]; notes: string[] };

export function planAdjustments(s: Shipment, c: ValueCharges = EMPTY_VALUE_CHARGES): AdjustmentPlan {
  const incoterm = incotermCode(s.invoice.incoterm.value);
  const currency = s.invoice.currency.value ?? "";
  const out: Adjustment[] = [];
  const notes: string[] = [];
  const src = (kind: DocKind | undefined, fallback: ValueSource): ValueSource => (kind && SOURCE_BY_KIND[kind]) || fallback;

  if (FREIGHT_NOT_INCLUDED.has(incoterm)) {
    const m = c.freight;
    if (m?.amount && m.currency) {
      out.push({ label: FREIGHT_ADJUSTMENT_LABEL, amount: m.amount, currency: m.currency, source: "USER", kind: "ADD" });
    } else if (s.charges.freight.value !== null) {
      out.push({ label: FREIGHT_ADJUSTMENT_LABEL, amount: s.charges.freight.value, currency: s.charges.freightCurrency?.value ?? currency, source: src(s.charges.freight.sources[0]?.kind, "SYSTEM"), kind: "ADD" });
    } else if (m) {
      notes.push(`${incoterm}: chưa có số cước vận chuyển quốc tế – ${freightReasonText(m)}`);
    } else {
      notes.push(`${incoterm}: cần cước vận chuyển quốc tế để cộng vào trị giá – chưa có hóa đơn cước / Arrival Notice`);
    }
  } else if (incoterm) {
    notes.push(`${incoterm}: cước vận chuyển đã gồm trong giá hóa đơn`);
  }

  const mi = c.insurance;
  if (INSURANCE_INCLUDED.has(incoterm)) {
    if (mi?.mode === "AMOUNT") notes.push(`${incoterm}: giá hóa đơn đã gồm bảo hiểm – không cộng phí bảo hiểm nhập tay`);
  } else if (mi?.mode === "AMOUNT") {
    out.push({ label: INSURANCE_ADJUSTMENT_LABEL, amount: mi.amount, currency: mi.currency, source: "USER", kind: "ADD" });
  } else if (mi?.mode !== "NONE" && s.charges.insurance.value !== null) {
    out.push({ label: INSURANCE_ADJUSTMENT_LABEL, amount: s.charges.insurance.value, currency: s.charges.insuranceCurrency?.value ?? currency, source: src(s.charges.insurance.sources[0]?.kind, "SYSTEM"), kind: "ADD" });
  }

  // Người khai đã lập danh sách khoản điều chỉnh (kể cả rỗng) → thay toàn bộ phí khác đọc từ chứng từ.
  if (c.adjustments !== null) {
    for (const a of c.adjustments) out.push({ label: adjustmentLabel(a.code), amount: a.amount, currency: a.currency, source: "USER", kind: a.kind === "SB" ? "SUBTRACT" : "ADD", code: a.code, ...(a.allocate === false ? { allocate: false } : {}) });
    return { adjustments: out, notes };
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
 * Tờ khai xuất (EDA): trị giá hải quan là giá bán đến cửa khẩu xuất, KHÔNG gồm phí vận tải quốc tế và phí bảo hiểm quốc tế
 * (Điều 7 TT39/2015/TT-BTC; chỉ tiêu 2.40 Phụ lục II). Giá hóa đơn đã gồm cước/bảo hiểm (CFR, CIF, CPT, CIP, nhóm D…) → trừ ra.
 * Chưa có số cước/bảo hiểm thì không trừ bừa – ghi chú để người khai bổ sung.
 */
export function planExportAdjustments(s: Shipment, c: ValueCharges = EMPTY_VALUE_CHARGES): AdjustmentPlan {
  const incoterm = incotermCode(s.invoice.incoterm.value);
  const currency = s.invoice.currency.value ?? "";
  const out: Adjustment[] = [];
  const notes: string[] = [];
  const src = (kind: DocKind | undefined, fallback: ValueSource): ValueSource => (kind && SOURCE_BY_KIND[kind]) || fallback;
  if (!incoterm || EXPORT_NO_DEDUCTION.has(incoterm)) {
    if (incoterm === "EXW") notes.push("EXW: trị giá tính thuế xuất khẩu phải gồm chi phí đưa hàng đến cửa khẩu xuất – bổ sung ở chỉ tiêu 2.40 nếu có");
    return { adjustments: out, notes };
  }
  if (freightRequired("EDA", incoterm)) {
    const m = c.freight;
    if (m?.amount && m.currency) {
      out.push({ label: FREIGHT_ADJUSTMENT_LABEL, amount: m.amount, currency: m.currency, source: "USER", kind: "SUBTRACT" });
    } else if (s.charges.freight.value !== null) {
      out.push({ label: FREIGHT_ADJUSTMENT_LABEL, amount: s.charges.freight.value, currency: s.charges.freightCurrency?.value ?? currency, source: src(s.charges.freight.sources[0]?.kind, "SYSTEM"), kind: "SUBTRACT" });
    } else if (m) {
      notes.push(`${incoterm}: chưa có số cước quốc tế để trừ ra (chỉ tiêu 2.40) – ${freightReasonText(m)}`);
    } else {
      notes.push(`${incoterm}: giá hóa đơn đã gồm cước quốc tế – cần số cước để trừ ra khi tính trị giá tính thuế xuất khẩu (chỉ tiêu 2.40)`);
    }
  }
  if (INSURANCE_INCLUDED.has(incoterm)) {
    const mi = c.insurance;
    if (mi?.mode === "AMOUNT") {
      out.push({ label: INSURANCE_ADJUSTMENT_LABEL, amount: mi.amount, currency: mi.currency, source: "USER", kind: "SUBTRACT" });
    } else if (mi?.mode === "NONE") {
      // Người khai xác nhận không có bảo hiểm – không trừ.
    } else if (s.charges.insurance.value !== null) {
      out.push({ label: INSURANCE_ADJUSTMENT_LABEL, amount: s.charges.insurance.value, currency: s.charges.insuranceCurrency?.value ?? currency, source: src(s.charges.insurance.sources[0]?.kind, "SYSTEM"), kind: "SUBTRACT" });
    } else {
      notes.push(`${incoterm}: giá hóa đơn đã gồm bảo hiểm quốc tế – cần phí bảo hiểm để trừ ra (chỉ tiêu 2.40)`);
    }
  }
  return { adjustments: out, notes };
}

/** Khoản điều chỉnh theo chiều tờ khai: nhập cộng (1.47–1.49), xuất trừ về giá tại cửa khẩu xuất (2.40). */
export const planAdjustmentsFor = (kind: "IDA" | "EDA", s: Shipment, c: ValueCharges = EMPTY_VALUE_CHARGES): AdjustmentPlan =>
  kind === "IDA" ? planAdjustments(s, c) : planExportAdjustments(s, c);
