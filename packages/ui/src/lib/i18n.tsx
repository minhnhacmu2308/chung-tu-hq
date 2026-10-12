// Đa ngôn ngữ cho @kb/ui (VI/EN). Mỗi component tự khai báo bộ nhãn của mình:
//
//   const MESSAGES = { vi: { close: "Đóng" }, en: { close: "Close" } } satisfies Messages<"close">;
//   const t = useMessages(MESSAGES, labels);   // labels (props) ghi đè từng nhãn
//
// App bọc gốc bằng <UiLocaleProvider locale={appearance.locale}>.
import { createContext, useContext, type ReactNode } from "react";

export type UiLocale = "vi" | "en";
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

/** Locale BCP-47 cho Intl (số, ngày). */
export function intlLocale(locale: UiLocale): string {
  return locale === "vi" ? "vi-VN" : "en-US";
}
