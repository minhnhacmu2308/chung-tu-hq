// Ánh xạ dòng hàng ↔ API phân loại HS của HSCodePro (thuần). Tài liệu: docs/integrations/hscodepro-api-v1.md.
import { HS_CO_FORMS, type HsCandidate, type HsCreateItem, type HsResult, type HsTax } from "@kb/contracts";
import { fixedRatesFor } from "./rates.js";

export type { HsCandidate };

/** "84834090" → "8483.40.90"; chuỗi khác 8 chữ số giữ nguyên. */
export const formatHs = (code: string) => {
  const d = code.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : code;
};

/** Mẫu C/O trên chứng từ ("FORM E", "e", "EVFTA"…) → giá trị `co_form` của API; ngoài bảng §9 → null. */
export function coFormFor(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.toUpperCase().replace(/^(C\/O\s*)?(FORM\s+)/, "").trim();
  if (/^EVFTA|^EUR\.?1$/.test(v)) return "EUR.1";
  if (/^UKVFTA|^EUR\.?1-UK$/.test(v)) return "EUR.1-UK";
  return (HS_CO_FORMS as readonly string[]).includes(v) ? v : null;
}

export type HsLineInput = { lineNo: number; description: string; quantity: string; unit: string; amount: string; origin: string; invoiceHsCode: string | null };
export type HsSkip = { lineNo: number; code: "NO_ORIGIN" | "SHORT_DESCRIPTION"; message: string };

const iso2 = (v: string | null | undefined) => {
  const s = (v ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
};
const num = (v: string) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Khóa "cùng một mặt hàng": mô tả (bỏ hoa thường, khoảng trắng thừa, dấu câu cuối) + xuất xứ + 6 số HS trên invoice. */
export function sameGoodsKey(l: Pick<HsLineInput, "description" | "origin" | "invoiceHsCode">): string {
  const desc = l.description.normalize("NFC").toLowerCase().replace(/\s+/g, " ").replace(/[\s.,;:]+$/, "").trim();
  return [desc, (l.origin ?? "").trim().toUpperCase(), (l.invoiceHsCode ?? "").replace(/\D/g, "").slice(0, 6)].join("|");
}

/**
 * Gom dòng hàng trùng mặt hàng: chỉ dòng đầu mỗi nhóm (`reps`) gửi HSCodePro; dòng sau (`followers`, theo lineNo dòng đầu)
 * dùng chung kết quả / câu hỏi – không tốn thêm lượt phân loại, và các dòng giống nhau luôn ra cùng một mã.
 */
export function groupSameGoods<T extends Pick<HsLineInput, "lineNo" | "description" | "origin" | "invoiceHsCode">>(lines: T[]): { reps: T[]; followers: Map<number, T[]> } {
  const reps: T[] = [];
  const followers = new Map<number, T[]>();
  const repOf = new Map<string, T>();
  for (const l of [...lines].sort((a, b) => a.lineNo - b.lineNo)) {
    const key = sameGoodsKey(l);
    const rep = repOf.get(key);
    if (!rep) {
      repOf.set(key, l);
      reps.push(l);
    } else followers.set(rep.lineNo, [...(followers.get(rep.lineNo) ?? []), l]);
  }
  return { reps, followers };
}

/** Dòng hàng → item gửi API. Dòng không gửi được (API sẽ trả 400 cả lượt) đưa vào `skipped`. */
export function toHsRequestItems(lines: HsLineInput[], ctx: { invoiceCurrency: string; fallbackOrigin: string | null; coForm: string | null }): { items: HsCreateItem[]; skipped: HsSkip[] } {
  const items: HsCreateItem[] = [];
  const skipped: HsSkip[] = [];
  const coForm = coFormFor(ctx.coForm);
  for (const l of lines) {
    const description = l.description.trim().slice(0, 1000);
    if (description.length < 3) {
      skipped.push({ lineNo: l.lineNo, code: "SHORT_DESCRIPTION", message: "Mô tả hàng quá ngắn để phân loại – bổ sung mô tả rồi phân loại lại" });
      continue;
    }
    const origin = iso2(l.origin) ?? iso2(ctx.fallbackOrigin);
    if (!origin) {
      skipped.push({ lineNo: l.lineNo, code: "NO_ORIGIN", message: "Thiếu xuất xứ – nhập mã nước (vd CN, TW) rồi phân loại lại" });
      continue;
    }
    const quantity = num(l.quantity);
    const value = ctx.invoiceCurrency === "USD" ? num(l.amount) : undefined;
    items.push({
      line_no: l.lineNo, description, origin_country: origin,
      ...(quantity !== undefined ? { quantity } : {}),
      ...(l.unit.trim() ? { unit: l.unit.trim().slice(0, 20) } : {}),
      ...(value !== undefined ? { value_usd: value } : {}),
      ...(l.invoiceHsCode ? { invoice_hs: l.invoiceHsCode } : {}),
      co_form: coForm,
    });
  }
  return { items, skipped };
}

const rate = (n: number | null | undefined) => (n === null || n === undefined ? null : String(n));
const fromTax = (t: HsTax | null) => ({
  importRate: rate(t?.import.rate), basis: t?.import.basis ?? null, agreement: t?.import.agreement ?? null, vatRate: rate(t?.vat.rate),
  // Trường mở rộng của hscode-api mới – vắng (API cũ / fpt-mock) thì để null.
  vatCode: t?.vat.vnaccs_code ?? null, vatNote: t?.vat.note ?? null, vatCertain: t?.vat.certain ?? null, normalImportRate: rate(t?.import.normal_rate),
});

/** Kết quả API → danh sách ứng viên: gợi ý chính đứng đầu, rồi mã thay thế. */
export function candidatesFromResult(r: HsResult): HsCandidate[] {
  return [
    { code: formatHs(r.hs_code), description: r.hs_description, confidence: r.confidence / 100, whyNot: null, ...fromTax(r.tax) },
    ...r.alternatives.map((a) => ({ code: formatHs(a.hs_code), description: a.hs_description, confidence: a.confidence / 100, whyNot: a.why_not, ...fromTax(a.tax) })),
  ];
}

/** Thuế suất GTGT phổ thông – CHỈ dùng tạm cho HSCodePro bản cũ (không trả `vnaccs_code`) khi chưa có VAT cho mã; khai mã VB901. */
export const DEFAULT_VAT_RATE = "10";

/** Mã VAT VNACCS "VK…" = hàng không chịu thuế GTGT. */
export const isVatExempt = (code: string | null | undefined) => !!code && /^VK/i.test(code);

/** Chi tiết thuế lưu trên dòng (mã VAT VNACCS, căn cứ/điều kiện VAT…) – xem TaxDetail. */
export type CandidateTaxDetail = { vatCode: string | null; vatNote: string | null; vatCertain: boolean | null; normalImportRate: string | null; needsReview?: boolean };
export type AppliedRates = { importDutyRate: string | null; vatRate: string | null; policyNote: string | null; taxDetail: CandidateTaxDetail | null };

/**
 * Thuế suất khi người khai xác nhận một ứng viên (hoặc tính lại cho mã đã xác nhận). XK/miễn thuế theo quy tắc phía mình; không có thuế NK → null + ghi chú.
 * VAT có 3 trường hợp:
 * - `vatRate` là số → dùng (đã tính giảm thuế, vd 8% VB245);
 * - `vatRate` null + mã `VK…` → KHÔNG CHỊU THUẾ GTGT: VAT null (tiền VAT = 0), ghi chú "Không chịu thuế GTGT (VKxxx): <căn cứ>";
 * - `vatRate` null, không có mã VAT (HSCodePro bản cũ) → tạm tính 10% (VB901) kèm ghi chú như trước.
 * `vatCertain === false` → thêm căn cứ/điều kiện VAT vào ghi chú để người khai tự xét.
 */
export function ratesFromCandidate(c: HsCandidate | null, p: { direction: "NK" | "XK"; typeCode: string }): AppliedRates {
  const fixed = fixedRatesFor(p);
  if (fixed) return { importDutyRate: fixed.importDutyRate, vatRate: fixed.vatRate, policyNote: fixed.policyNote, taxDetail: null };
  const detail: CandidateTaxDetail | null = c
    ? { vatCode: c.vatCode ?? null, vatNote: c.vatNote ?? null, vatCertain: c.vatCertain ?? null, normalImportRate: c.normalImportRate ?? null }
    : null;
  const exempt = !!c && c.vatRate === null && isVatExempt(c.vatCode);
  const oldApiNoVat = !!c && c.vatRate === null && !c.vatCode;
  const vatNotes = [
    exempt ? `Không chịu thuế GTGT (${c!.vatCode})${c!.vatNote ? `: ${c!.vatNote}` : ""}` : null,
    // Điều kiện VAT ngoài mã HS (giấy phép, mục đích NK…): người khai tự xét. Không chịu thuế đã kèm căn cứ ở trên.
    c && c.vatCertain === false && c.vatNote && !exempt ? `Thuế GTGT cần xét điều kiện: ${c.vatNote}` : null,
  ];
  if (!c || c.importRate === null) {
    const notes = ["Chưa có thuế suất cho mã này – kiểm tra biểu thuế trước khi khai", ...vatNotes].filter(Boolean);
    return { importDutyRate: null, vatRate: c?.vatRate ?? null, policyNote: notes.join(". "), taxDetail: detail };
  }
  const notes = [
    c.basis === "FTA" ? `Thuế ưu đãi đặc biệt ${c.agreement ?? "FTA"} – cần C/O hợp lệ và đúng quy tắc xuất xứ` : null,
    ...vatNotes,
    oldApiNoVat ? `Biểu thuế chưa có thuế suất GTGT cho mã này – tạm tính ${DEFAULT_VAT_RATE}% (VB901); hàng thuộc nhóm 5%, 0%, không chịu thuế hoặc được giảm thuế GTGT thì sửa lại` : null,
  ].filter(Boolean);
  return {
    importDutyRate: c.importRate,
    vatRate: oldApiNoVat ? DEFAULT_VAT_RATE : c.vatRate,
    policyNote: notes.length ? notes.join(". ") : null,
    taxDetail: oldApiNoVat ? { ...detail!, vatCode: "VB901" } : detail,
  };
}

/**
 * Gộp thuế đã thống nhất (bài học tờ khai đã thông quan / dòng cùng mã – harmonizeRates) vào thuế của ứng viên.
 * VAT bị đổi so với ứng viên → mã VAT VNACCS của ứng viên không còn khớp (vd VB245 là mã 8% mà thuế suất thành 10%, hoặc VK… không chịu thuế
 * mà nay có VAT) → bỏ mã, để bước truyền suy mã theo thuế suất (vatCode).
 */
export function withHarmonized(rates: AppliedRates, h: { importDutyRate: string | null; vatRate: string | null; policyNote: string | null }): AppliedRates {
  const vatChanged = h.vatRate !== rates.vatRate;
  return { ...rates, ...h, taxDetail: vatChanged && rates.taxDetail ? { ...rates.taxDetail, vatCode: null } : rates.taxDetail };
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
