"use client";
// Metadata (tiêu đề tab) dựng phía máy chủ bằng tiếng Việt; ở ngôn ngữ khác, đổi lại document.title phía client.
// Sau đăng nhập, doanh nghiệp có tên thương hiệu (ADR 0016) → thay "KhaiBáo AI" trong tiêu đề bằng tên đó.
import { useUiLocale } from "@kb/ui";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { APP_TITLES, titleKeyForPath } from "@/app/app-titles.messages";

export function usePageTitle(brandName?: string | null) {
  const pathname = usePathname();
  const locale = useUiLocale();
  useEffect(() => {
    const t = APP_TITLES[locale];
    const apply = () => {
      const key = titleKeyForPath(pathname);
      const base = key ? t.template.replace("%s", t[key]) : document.title;
      const next = brandName ? base.replace(t.brand, brandName).replace(APP_TITLES.vi.brand, brandName) : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next đặt lại <title> từ metadata sau khi chuyển trang (có thể sau effect này) → áp lại khi tiêu đề đổi; chỉ ghi khi khác nên không lặp.
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { subtree: true, childList: true, characterData: true });
    return () => mo.disconnect();
  }, [pathname, locale, brandName]);
}
