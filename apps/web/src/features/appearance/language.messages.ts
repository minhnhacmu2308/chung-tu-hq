import { defineMessages, type UiLocale } from "@kb/ui";

/** Tên ngôn ngữ luôn viết bằng chính ngôn ngữ đó (người không đọc được ngôn ngữ hiện tại vẫn tìm ra). */
export const LOCALE_NAMES: Record<UiLocale, string> = { vi: "Tiếng Việt", en: "English", zh: "中文" };

export const LANGUAGE_MESSAGES = defineMessages({
  vi: { language: "Ngôn ngữ" },
  en: { language: "Language" },
  zh: { language: "语言" },
});
