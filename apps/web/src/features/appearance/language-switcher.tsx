"use client";
// Chọn ngôn ngữ giao diện (vi/en/zh): lưu vào cấu hình giao diện → cả cây React dựng lại theo ngôn ngữ mới.
import {
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, Select,
  UI_LOCALES, useMessages, type UiLocale,
} from "@kb/ui";
import type { Appearance } from "@kb/ui/theme";
import { Languages } from "lucide-react";
import { useAppearance } from "./use-appearance";
import { LANGUAGE_MESSAGES, LOCALE_NAMES } from "./language.messages";

const OPTIONS = UI_LOCALES.map((l) => ({ value: l, label: LOCALE_NAMES[l] }));
const isLocale = (v: string): v is UiLocale => (UI_LOCALES as readonly string[]).includes(v);

/** Cấu hình giao diện sau khi chọn ngôn ngữ `value`; `null` = không đổi (trùng hoặc giá trị lạ). */
export function withLocale(appearance: Appearance, value: string): Appearance | null {
  return isLocale(value) && value !== appearance.locale ? { ...appearance, locale: value } : null;
}

function useLocaleSetting() {
  const { appearance, setAppearance } = useAppearance();
  const setLocale = (v: string) => {
    const next = withLocale(appearance, v);
    if (next) setAppearance(next);
  };
  return { locale: appearance.locale, setLocale };
}

/** Ô chọn ngôn ngữ gọn – dùng ở trang chưa đăng nhập (đăng nhập, đăng ký). */
export function LanguageSelect({ className }: { className?: string }) {
  const t = useMessages(LANGUAGE_MESSAGES);
  const { locale, setLocale } = useLocaleSetting();
  return <Select aria-label={t.language} options={OPTIONS} value={locale} onChange={(e) => setLocale(e.target.value)} className={className} />;
}

/** Mục con "Ngôn ngữ" trong menu người dùng. */
export function LanguageMenuSub() {
  const t = useMessages(LANGUAGE_MESSAGES);
  const { locale, setLocale } = useLocaleSetting();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger icon={<Languages />}>
        {t.language}: {LOCALE_NAMES[locale]}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
          {OPTIONS.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
