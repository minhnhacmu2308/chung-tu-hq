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
const fromTax = (t: HsTax | null) => ({ importRate: rate(t?.import.rate), basis: t?.import.basis ?? null, agreement: t?.import.agreement ?? null, vatRate: rate(t?.vat.rate) });

/** Kết quả API → danh sách ứng viên: gợi ý chính đứng đầu, rồi mã thay thế. */
export function candidatesFromResult(r: HsResult): HsCandidate[] {
  return [
    { code: formatHs(r.hs_code), description: r.hs_description, confidence: r.confidence / 100, whyNot: null, ...fromTax(r.tax) },
    ...r.alternatives.map((a) => ({ code: formatHs(a.hs_code), description: a.hs_description, confidence: a.confidence / 100, whyNot: a.why_not, ...fromTax(a.tax) })),
  ];
}

/** Thuế suất GTGT phổ thông (Luật Thuế GTGT) – dùng tạm khi HSCodePro chưa có VAT cho mã; khai mã VB901. */
export const DEFAULT_VAT_RATE = "10";

/**
 * Thuế suất khi người khai xác nhận một ứng viên. XK/miễn thuế theo quy tắc phía mình; không có thuế NK → null + ghi chú.
 * Thiếu VAT → tạm tính 10% (phổ thông) kèm ghi chú: hàng thuộc nhóm 5% / 0% / không chịu thuế / giảm thuế GTGT thì người khai sửa.
 */
export function ratesFromCandidate(c: HsCandidate | null, p: { direction: "NK" | "XK"; typeCode: string }): { importDutyRate: string | null; vatRate: string | null; policyNote: string | null } {
  const fixed = fixedRatesFor(p);
  if (fixed) return { importDutyRate: fixed.importDutyRate, vatRate: fixed.vatRate, policyNote: fixed.policyNote };
  if (!c || c.importRate === null) return { importDutyRate: null, vatRate: c?.vatRate ?? null, policyNote: "Chưa có thuế suất cho mã này – kiểm tra biểu thuế trước khi khai" };
  const notes = [
    c.basis === "FTA" ? `Thuế ưu đãi đặc biệt ${c.agreement ?? "FTA"} – cần C/O hợp lệ và đúng quy tắc xuất xứ` : null,
    c.vatRate === null ? `Biểu thuế chưa có thuế suất GTGT cho mã này – tạm tính ${DEFAULT_VAT_RATE}% (VB901); hàng thuộc nhóm 5%, 0%, không chịu thuế hoặc được giảm thuế GTGT thì sửa lại` : null,
  ].filter(Boolean);
  return { importDutyRate: c.importRate, vatRate: c.vatRate ?? DEFAULT_VAT_RATE, policyNote: notes.length ? notes.join(". ") : null };
}

export function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}
