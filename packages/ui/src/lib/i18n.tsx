// Đa ngôn ngữ cho @kb/ui và app (VI/EN/ZH). Mỗi component tự khai báo bộ nhãn của mình:
//
//   const MESSAGES = { vi: { close: "Đóng" }, en: { close: "Close" } } satisfies Messages<"close">;
//   const t = useMessages(MESSAGES, labels);   // labels (props) ghi đè từng nhãn
//
// App bọc gốc bằng <UiLocaleProvider locale={appearance.locale}>.
import { createContext, useContext, type ReactNode } from "react";

/** Ngôn ngữ giao diện hỗ trợ. Thêm ngôn ngữ: thêm vào đây rồi TypeScript chỉ ra mọi bộ nhãn còn thiếu. */
export const UI_LOCALES = ["vi", "en", "zh"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export type Messages<K extends string> = Record<UiLocale, Record<K, string>>;

const LocaleContext = createContext<UiLocale>("vi");

export function UiLocaleProvider({ locale, children }: { locale: UiLocale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useUiLocale(): UiLocale {
  return useContext(LocaleContext);
}

/** Nhãn theo ngôn ngữ hiện tại, ghi đè bằng `overrides` (thường là prop `labels`). */
export function useMessages<K extends string>(catalog: Messages<K>, overrides?: Partial<Record<K, string>>): Record<K, string> {
  const locale = useUiLocale();
  return { ...catalog[locale], ...overrides };
}

/**
 * Khai báo bộ nhãn, suy khóa từ chính bộ nhãn – thiếu khóa ở một ngôn ngữ là lỗi TypeScript:
 *   export const M = defineMessages({ vi: { save: "Lưu" }, en: { save: "Save" }, zh: { save: "保存" } });
 */
export function defineMessages<K extends string>(catalog: Messages<K>): Messages<K> {
  return catalog;
}

/** Bộ nhãn theo ngôn ngữ cho code không phải component (hàm thuần nhận `locale`). */
export function pickMessages<K extends string>(catalog: Messages<K>, locale: UiLocale): Record<K, string> {
  return catalog[locale];
}

/** Điền tham số vào nhãn: `fill("Còn {n} ngày", { n: 3 })`. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

const INTL: Record<UiLocale, string> = { vi: "vi-VN", en: "en-US", zh: "zh-CN" };

/** Locale BCP-47 cho Intl (số, ngày). */
export function intlLocale(locale: UiLocale): string {
  return INTL[locale];
}
