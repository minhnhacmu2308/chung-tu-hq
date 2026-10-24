"use client";
// Metadata (tiêu đề tab) dựng phía máy chủ bằng tiếng Việt; ở ngôn ngữ khác, đổi lại document.title phía client.
import { useUiLocale } from "@kb/ui";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_TITLES, titleKeyForPath } from "@/app/app-titles.messages";

export function usePageTitle() {
  const pathname = usePathname();
  const locale = useUiLocale();
  useEffect(() => {
    if (locale === "vi") return;
    const key = titleKeyForPath(pathname);
    if (!key) return;
    const t = APP_TITLES[locale];
    document.title = t.template.replace("%s", t[key]);
  }, [pathname, locale]);
}
