// Logic thuần của form Mặc định khai báo (Cài đặt → Khai báo): ô theo chiều NK/XK, danh sách mã, kiểm giá trị.
import {
  INVOICE_KINDS, PRICE_KINDS, TRANSPORT_MODES,
  type CodeEntry, type CodeListEntry, type DeclarationDirection, type DeclarationProfileInput, type FieldOverride, type ProfileFieldCode,
} from "@kb/contracts";
import { pickMessages, type UiLocale } from "@kb/ui";
import { PROFILE_FORM_MESSAGES } from "./declaration-profile-form.messages";
import { PROFILE_PLACEHOLDERS_VI } from "./declaration-profile-form.vi";

export type ProfileField = { code: ProfileFieldCode; label: string; hint?: string; placeholder?: string; options?: { value: string; label: string }[]; short?: boolean };

/** Giá trị lưu đúng dạng hiển thị trên tờ khai: "mã – tên". */
const opts = (list: CodeEntry[]) => list.map((c) => ({ value: `${c.code} – ${c.label}`, label: `${c.code} – ${c.label}` }));
const codePart = (v: string) => v.split(/\s+[–-]\s+/)[0]!.trim();
const listOpts = (list: readonly CodeListEntry[]) => list.filter((e) => !e.inactive).map((e) => ({ value: `${e.code} – ${e.name}`, label: `${e.code} – ${e.name}` }));

/**
 * Danh mục VNACCS chính thức (@kb/contracts code-lists – nguồn mới nhất) cho các ô chọn dài: chi cục (A038), phương thức thanh toán (PAYMENT),
 * loại hình (TYPE_CODE). Đang tải → ô chưa có lựa chọn. Danh mục ngắn ổn định (PTVC, phân loại hóa đơn/giá) vẫn từ bảng mã gọn.
 */
export type ProfileCodeLists = { offices?: readonly CodeListEntry[] | null; payments?: readonly CodeListEntry[] | null; typeCodes?: readonly CodeListEntry[] | null };

type FieldDef = Omit<ProfileField, "label" | "hint"> & { hint?: "hintPrefill" | "hintKho" | "hintPayment" | "hintTaxpayer"; directions: DeclarationDirection[] };

const ALL: FieldDef[] = [
  { code: "MA_LH", hint: "hintPrefill", directions: ["NK", "XK"] },
  { code: "CQHQ", hint: "hintPrefill", directions: ["NK", "XK"] },
  { code: "PTVC", options: opts(TRANSPORT_MODES), directions: ["NK", "XK"] },
  { code: "KHO", hint: "hintKho", placeholder: PROFILE_PLACEHOLDERS_VI.KHO, short: true, directions: ["NK", "XK"] },
  { code: "PT_TT", hint: "hintPayment", directions: ["NK", "XK"] },
  { code: "KHAI_TG", placeholder: PROFILE_PLACEHOLDERS_VI.KHAI_TG, directions: ["NK"] },
  { code: "NGUOI_NT", hint: "hintTaxpayer", placeholder: PROFILE_PLACEHOLDERS_VI.NGUOI_NT_NK, directions: ["NK", "XK"] },
  { code: "PL_CN", placeholder: PROFILE_PLACEHOLDERS_VI.PL_CN, directions: ["NK"] },
  { code: "HD_PL", options: opts(INVOICE_KINDS), directions: ["NK"] },
  { code: "GIA_PL", options: opts(PRICE_KINDS), directions: ["NK", "XK"] },
];

export function profileFieldsFor(direction: DeclarationDirection, locale: UiLocale = "vi", lists: ProfileCodeLists = {}): ProfileField[] {
  const t = pickMessages(PROFILE_FORM_MESSAGES, locale);
  return ALL.filter((f) => f.directions.includes(direction)).map(({ directions: _d, hint, ...rest }) => {
    const f: ProfileField = { ...rest, label: t[rest.code], ...(hint ? { hint: t[hint] } : {}) };
    if (f.code === "MA_LH") return { ...f, options: listOpts((lists.typeCodes ?? []).filter((e) => e.parent === direction)) };
    if (f.code === "CQHQ") return { ...f, options: listOpts(lists.offices ?? []) };
    if (f.code === "PT_TT") return { ...f, options: listOpts(lists.payments ?? []) };
    if (f.code === "NGUOI_NT" && direction === "XK") return { ...f, placeholder: PROFILE_PLACEHOLDERS_VI.NGUOI_NT_XK };
    return f;
  });
}

/**
 * Giá trị Select cho một ô: giá trị đã lưu ("mã – tên" theo bảng mã cũ) khớp lựa chọn có cùng mã thì dùng lựa chọn đó (tên theo danh mục mới);
 * mã không còn trong danh mục → thêm chính giá trị đó làm lựa chọn để không mất hiển thị (người dùng tự chọn lại).
 */
export function selectFor(options: { value: string; label: string }[], saved: string | undefined): { value: string; options: { value: string; label: string }[] } {
  const v = saved?.trim() ?? "";
  if (!v) return { value: "", options };
  const hit = options.find((o) => o.value === v) ?? options.find((o) => codePart(o.value) === codePart(v));
  return hit ? { value: hit.value, options } : { value: v, options: [{ value: v, label: v }, ...options] };
}

export type ProfileValues = Partial<Record<ProfileFieldCode, string>>;
export type ProfileErrors = Partial<Record<ProfileFieldCode, string>>;

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
