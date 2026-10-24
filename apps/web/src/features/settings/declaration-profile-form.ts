// Logic thuần của form Mặc định khai báo (Cài đặt → Khai báo): ô theo chiều NK/XK, danh sách mã, kiểm giá trị.
import {
  CUSTOMS_OFFICES, INVOICE_KINDS, PAYMENT_METHODS, PRICE_KINDS, TRANSPORT_MODES, TYPE_CODES_NK, TYPE_CODES_XK,
  type CodeEntry, type DeclarationDirection, type DeclarationProfileInput, type FieldOverride, type ProfileFieldCode,
} from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import { PROFILE_FORM_MESSAGES } from "./declaration-profile-form.messages";
import { PROFILE_PLACEHOLDERS_VI } from "./declaration-profile-form.vi";

export type ProfileField = { code: ProfileFieldCode; label: string; hint?: string; placeholder?: string; options?: { value: string; label: string }[]; short?: boolean };

/** Giá trị lưu đúng dạng hiển thị trên tờ khai: "mã – tên". */
const opts = (list: CodeEntry[]) => list.map((c) => ({ value: `${c.code} – ${c.label}`, label: `${c.code} – ${c.label}` }));

type FieldDef = Omit<ProfileField, "label" | "hint"> & { hint?: "hintPrefill" | "hintKho" | "hintPayment" | "hintTaxpayer"; directions: DeclarationDirection[] };

const ALL: FieldDef[] = [
  { code: "MA_LH", hint: "hintPrefill", directions: ["NK", "XK"] },
  { code: "CQHQ", hint: "hintPrefill", options: opts(CUSTOMS_OFFICES), directions: ["NK", "XK"] },
  { code: "PTVC", options: opts(TRANSPORT_MODES), directions: ["NK", "XK"] },
  { code: "KHO", hint: "hintKho", placeholder: PROFILE_PLACEHOLDERS_VI.KHO, short: true, directions: ["NK", "XK"] },
  { code: "PT_TT", hint: "hintPayment", options: opts(PAYMENT_METHODS), directions: ["NK", "XK"] },
  { code: "KHAI_TG", placeholder: PROFILE_PLACEHOLDERS_VI.KHAI_TG, directions: ["NK"] },
  { code: "NGUOI_NT", hint: "hintTaxpayer", placeholder: PROFILE_PLACEHOLDERS_VI.NGUOI_NT_NK, directions: ["NK", "XK"] },
  { code: "PL_CN", placeholder: PROFILE_PLACEHOLDERS_VI.PL_CN, directions: ["NK"] },
  { code: "HD_PL", options: opts(INVOICE_KINDS), directions: ["NK"] },
  { code: "GIA_PL", options: opts(PRICE_KINDS), directions: ["NK", "XK"] },
];

export function profileFieldsFor(direction: DeclarationDirection, locale: UiLocale = "vi"): ProfileField[] {
  const t = pickMessages(PROFILE_FORM_MESSAGES, locale);
  return ALL.filter((f) => f.directions.includes(direction)).map(({ directions: _d, hint, ...rest }) => {
    const f: ProfileField = { ...rest, label: t[rest.code], ...(hint ? { hint: t[hint] } : {}) };
    if (f.code === "MA_LH") return { ...f, options: opts(direction === "NK" ? TYPE_CODES_NK : TYPE_CODES_XK) };
    if (f.code === "NGUOI_NT" && direction === "XK") return { ...f, placeholder: PROFILE_PLACEHOLDERS_VI.NGUOI_NT_XK };
    return f;
  });
}

export type ProfileValues = Partial<Record<ProfileFieldCode, string>>;
export type ProfileErrors = Partial<Record<ProfileFieldCode, string>>;

const codePart = (v: string) => v.split(/\s+[–-]\s+/)[0]!.trim();

/** Kiểm nhanh phía giao diện (máy chủ kiểm lại theo catalog Phụ lục II). */
export function validateProfileForm(_direction: DeclarationDirection, values: ProfileValues, locale: UiLocale = "vi"): ProfileErrors {
  const errors: ProfileErrors = {};
  const kho = values.KHO?.trim();
  if (kho && codePart(kho).length > 7) errors.KHO = pickMessages(PROFILE_FORM_MESSAGES, locale).khoTooLong;
  return errors;
}

export function toProfileInput(values: ProfileValues, overrides: Record<string, FieldOverride>): DeclarationProfileInput {
  return { values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)), overrides };
}

/** Nguồn chọn sẵn trong hộp đổi nguồn: theo ghi đè đã lưu, bỏ nguồn không còn được phép; chưa ghi đè nguồn → mọi nguồn. */
export function initialPickedSources(rule: { sources: { id: string }[] }, current: FieldOverride | undefined): string[] {
  const all = rule.sources.map((s) => s.id);
  if (!current || !("sources" in current)) return all;
  return current.sources.filter((id) => all.includes(id));
}
