// Chi phí và điều chỉnh trị giá (bước OCR & kiểm tra): trạng thái form ↔ ValueCharges, kiểm tra bằng schema dùng chung,
// và dòng tóm tắt từng khoản (giá trị đang dùng + nguồn + có chặn duyệt không). Thuần – test ở value-charges-form.test.ts.
import { ADJUSTMENT_CODES, ValueChargesSchema, type FreightReason, type ValueCharges, type ValueChargesView } from "@kb/contracts";
import { fill, pickMessages, type UiLocale } from "@kb/ui";
import { formatMoney } from "@/lib/format";
import { VALUE_CHARGES_MESSAGES } from "./value-charges.messages";

const messagesFor = (locale: UiLocale) => pickMessages(VALUE_CHARGES_MESSAGES, locale);
type Messages = ReturnType<typeof messagesFor>;

/** Nhãn lý do nhập cước tay theo ngôn ngữ. */
export const freightReasonLabel = (t: Messages, r: FreightReason): string =>
  ({ FORWARDER_NOTICE: t.reasonForwarderNotice, INVOICE_LATER: t.reasonInvoiceLater, CONTRACT: t.reasonContract, OTHER: t.reasonOther })[r];

/** Câu lỗi của schema dùng chung (@kb/contracts value-charges) trùng bản `vi` của các nhãn này → đổi sang ngôn ngữ đang chọn. */
const SCHEMA_ERRORS = ["errAmountPositive", "errCurrency", "errAmountAndCurrency", "errOtherNote", "errChooseCode", "errMaxAdjustments"] as const;
const VI = messagesFor("vi");

function issueText(t: Messages, key: string, message: string): string {
  if (key === "freightReason") return t.chooseReason;
  const known = SCHEMA_ERRORS.find((k) => VI[k] === message);
  if (known) return t[known];
  return /amount$/i.test(key) ? t.errAmountFormat : message;
}

/** `allocate` = Phân bổ phí: tự điền số thứ tự khoản vào 1.88 của mọi dòng hàng. */
export type AdjustmentRowForm = { code: string; kind: "AD" | "SB"; amount: string; currency: string; note: string; allocate: boolean };
export type ChargesForm = {
  /** DOC = theo chứng từ; MANUAL = người khai nhập số hoặc ghi lý do chưa có số. */
  freightMode: "DOC" | "MANUAL";
  freightAmount: string;
  freightCurrency: string;
  freightReason: FreightReason | "";
  freightNote: string;
  insuranceMode: "DOC" | "NONE" | "AMOUNT";
  insuranceAmount: string;
  insuranceCurrency: string;
  adjustmentsMode: "DOC" | "MANUAL";
  adjustments: AdjustmentRowForm[];
};
export type ChargesFormErrors = Partial<Record<string, string>>;

/** "1,150.50" / "1 150.5" → "1150.50"; rỗng giữ rỗng. Dấu chấm là phần thập phân. */
export const normalizeAmount = (v: string) => v.replace(/[\s,]/g, "");

export const emptyAdjustmentRow = (currency: string): AdjustmentRowForm => ({ code: "", kind: "AD", amount: "", currency, note: "", allocate: true });
/** Chiều mặc định theo mã tên (A…M cộng, U…L trừ, N người khai chọn). */
export const kindOfCode = (code: string, fallback: "AD" | "SB"): "AD" | "SB" => ADJUSTMENT_CODES.find((c) => c.code === code)?.kind ?? fallback;

export function formFromView(v: ValueChargesView, invoiceCurrency: string): ChargesForm {
  const c = v.charges;
  return {
    freightMode: c.freight ? "MANUAL" : "DOC",
    freightAmount: c.freight?.amount ?? "",
    freightCurrency: c.freight?.currency ?? v.fromDocuments.freight?.currency ?? invoiceCurrency,
    freightReason: c.freight?.reason ?? "",
    freightNote: c.freight?.note ?? "",
    insuranceMode: c.insurance?.mode ?? "DOC",
    insuranceAmount: c.insurance?.mode === "AMOUNT" ? c.insurance.amount : "",
    insuranceCurrency: c.insurance?.mode === "AMOUNT" ? c.insurance.currency : invoiceCurrency,
    adjustmentsMode: c.adjustments ? "MANUAL" : "DOC",
    adjustments: (c.adjustments ?? []).map((a) => ({ ...a })),
  };
}

/** Form → ValueCharges qua schema dùng chung; lỗi gắn theo ô (freightAmount, adjustments.0.code…). */
export function toValueCharges(f: ChargesForm, locale: UiLocale = "vi"): { ok: true; value: ValueCharges } | { ok: false; errors: ChargesFormErrors } {
  const amount = normalizeAmount(f.freightAmount);
  const raw = {
    freight: f.freightMode === "MANUAL" ? { amount: amount || null, currency: amount ? f.freightCurrency.trim().toUpperCase() : null, reason: f.freightReason || undefined, note: f.freightNote } : null,
    insurance: f.insuranceMode === "DOC" ? null : f.insuranceMode === "NONE" ? { mode: "NONE" } : { mode: "AMOUNT", amount: normalizeAmount(f.insuranceAmount), currency: f.insuranceCurrency.trim().toUpperCase() },
    adjustments: f.adjustmentsMode === "MANUAL" ? f.adjustments.map((a) => ({ ...a, amount: normalizeAmount(a.amount), currency: a.currency.trim().toUpperCase() })) : null,
  };
  const r = ValueChargesSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  const t = pickMessages(VALUE_CHARGES_MESSAGES, locale);
  const errors: ChargesFormErrors = {};
  for (const issue of r.error.issues) {
    const [part, ...rest] = issue.path.map(String);
    const key = part === "freight" ? `freight${cap(rest[0] ?? "amount")}` : part === "insurance" ? `insurance${cap(rest[0] ?? "amount")}` : part === "adjustments" ? ["adjustments", ...rest].join(".") : String(part);
    errors[key] ??= issueText(t, key, issue.message);
  }
  return { ok: false, errors };
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type SummaryTone = "neutral" | "info" | "warning" | "danger" | "success";
export type SummaryRow = { key: "freight" | "insurance" | "adjustments"; label: string; no: string; value: string; source: string; tone: SummaryTone; hint?: string };

const money = (amount: string, currency: string) => formatMoney(amount, currency);

/** Dòng tóm tắt từng khoản – cùng quy tắc với tờ khai (backend mapping 1.47–1.49, 2.40). */
export function summarize(v: ValueChargesView, locale: UiLocale = "vi"): SummaryRow[] {
  const t = pickMessages(VALUE_CHARGES_MESSAGES, locale);
  const nk = v.direction === "NK";
  const c = v.charges;
  const d = v.fromDocuments;
  const rows: SummaryRow[] = [];
  const freightNo = nk ? "1.47" : "2.40";
  if (!v.freightRequired) {
    rows.push({ key: "freight", label: t.sumFreight, no: freightNo, value: v.incoterm ? fill(t.sumNotNeededFor, { incoterm: v.incoterm }) : t.sumNoIncoterm, source: t.srcSystem, tone: "neutral", hint: nk ? t.hintFreightIncludedNk : t.hintFreightNotIncludedXk });
  } else if (c.freight?.amount && c.freight.currency) {
    const differs = d.freight && (Number(d.freight.amount) !== Number(c.freight.amount) || d.freight.currency !== c.freight.currency);
    rows.push({ key: "freight", label: t.sumFreight, no: freightNo, value: money(c.freight.amount, c.freight.currency), source: t.srcDeclarant, tone: differs ? "warning" : "info", hint: differs ? fill(t.hintDiffersFromDocs, { amount: money(d.freight!.amount, d.freight!.currency) }) : freightReasonLabel(t, c.freight.reason) });
  } else if (d.freight) {
    rows.push({ key: "freight", label: t.sumFreight, no: freightNo, value: money(d.freight.amount, d.freight.currency), source: t.srcDocs, tone: "success" });
  } else if (c.freight) {
    rows.push({ key: "freight", label: t.sumFreight, no: freightNo, value: t.sumNoFreightAmount, source: t.srcDeclarantReason, tone: "warning", hint: fill(t.hintReasonNoAmount, { reason: `${freightReasonLabel(t, c.freight.reason)}${c.freight.note ? `: ${c.freight.note}` : ""}` }) });
  } else {
    rows.push({ key: "freight", label: t.sumFreight, no: freightNo, value: t.sumMissingFreight, source: t.srcBlocked, tone: "danger", hint: fill(t.hintMissingFreight, { incoterm: v.incoterm }) });
  }

  const insuranceApplies = nk ? !v.insuranceIncluded : v.insuranceIncluded;
  const insuranceNo = nk ? "1.48" : "2.40";
  if (!insuranceApplies) {
    rows.push({ key: "insurance", label: t.sumInsurance, no: insuranceNo, value: v.incoterm ? fill(t.sumNotNeededFor, { incoterm: v.incoterm }) : t.sumNotNeeded, source: t.srcSystem, tone: "neutral", hint: nk ? t.hintInsuranceIncludedNk : t.hintInsuranceNotIncludedXk });
  } else if (c.insurance?.mode === "NONE") {
    rows.push({ key: "insurance", label: t.sumInsurance, no: insuranceNo, value: t.insuranceNone, source: t.srcDeclarantConfirmed, tone: "info" });
  } else if (c.insurance?.mode === "AMOUNT") {
    rows.push({ key: "insurance", label: t.sumInsurance, no: insuranceNo, value: money(c.insurance.amount, c.insurance.currency), source: t.srcDeclarant, tone: "info" });
  } else if (d.insurance) {
    rows.push({ key: "insurance", label: t.sumInsurance, no: insuranceNo, value: money(d.insurance.amount, d.insurance.currency), source: t.srcDocs, tone: "success" });
  } else {
    rows.push({ key: "insurance", label: t.sumInsurance, no: insuranceNo, value: t.sumNoInsuranceDoc, source: t.srcUnconfirmed, tone: "neutral", hint: t.hintConfirmNoInsurance });
  }

  if (nk) {
    if (c.adjustments) {
      rows.push({ key: "adjustments", label: t.sumAdjustments, no: "1.49", value: c.adjustments.length ? c.adjustments.map((a, i) => `${i + 1}. ${a.code} ${a.kind === "SB" ? "−" : "+"} ${money(a.amount, a.currency)}`).join(" · ") : t.sumNoAdjustments, source: t.srcDeclarantList, tone: "info", ...(c.adjustments.length ? { hint: allocationHint(t, c.adjustments) } : {}) });
    } else if (d.other.length) {
      rows.push({ key: "adjustments", label: t.sumAdjustments, no: "1.49", value: d.other.map((o) => `${o.label} ${money(o.amount, o.currency)}`).join(" · "), source: t.srcDocsNoCode, tone: "warning", hint: t.hintAdjustmentsNoCode });
    } else {
      rows.push({ key: "adjustments", label: t.sumAdjustments, no: "1.49", value: t.sumNone, source: t.srcDocs, tone: "neutral" });
    }
  }
  return rows;
}

/** 1.88: khoản nào được phân bổ tự động cho mọi dòng hàng. */
function allocationHint(t: Messages, rows: readonly { allocate: boolean }[]): string {
  const nos = rows.flatMap((a, i) => (a.allocate ? [i + 1] : []));
  if (nos.length === rows.length) return fill(t.allocAll, { nos: nos.join(", ") });
  return nos.length ? fill(t.allocSome, { nos: nos.join(", ") }) : t.allocNone;
}

/** Gợi ý danh sách khoản điều chỉnh từ phí khác đọc được (người khai chọn mã tên). */
export const suggestAdjustments = (v: ValueChargesView): AdjustmentRowForm[] =>
  v.fromDocuments.other.map((o) => ({ code: "", kind: "AD", amount: o.amount, currency: o.currency, note: o.label, allocate: true }));
