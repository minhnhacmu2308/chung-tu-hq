"use client";
// Favicon theo logo doanh nghiệp (ADR 0016): khi khung app đang dựng và org có logo, trỏ các <link rel=icon / apple-touch-icon>
// sang logo; gỡ khung (đăng xuất, sang trang đăng nhập) hoặc gỡ logo → trả lại favicon mặc định của KhaiBáo AI.
import { useEffect } from "react";

const SELECTOR = 'link[rel~="icon"], link[rel="apple-touch-icon"]';

export function OrgFavicon({ href }: { href: string | undefined }) {
  useEffect(() => {
    if (!href) return;
    const apply = () => {
      for (const l of document.querySelectorAll<HTMLLinkElement>(SELECTOR)) {
        if (l.getAttribute("href") === href) continue;
        l.dataset.kbDefaultHref = l.getAttribute("href") ?? "";
        const type = l.getAttribute("type");
        if (type !== null) {
          l.dataset.kbDefaultType = type;
          l.removeAttribute("type"); // icon.svg khai type="image/svg+xml" – logo là PNG/JPG/WebP
        }
        l.setAttribute("href", href);
      }
    };
    apply();
    // Next dựng lại / đặt lại các <link> icon khi chuyển trang → áp lại; chỉ ghi khi khác nên không lặp.
    const mo = new MutationObserver(apply);
    mo.observe(document.head, { subtree: true, childList: true, attributes: true, attributeFilter: ["href"] });
    return () => {
      mo.disconnect();
      for (const l of document.querySelectorAll<HTMLLinkElement>(SELECTOR)) {
        if (l.dataset.kbDefaultHref !== undefined) l.setAttribute("href", l.dataset.kbDefaultHref);
        if (l.dataset.kbDefaultType !== undefined) l.setAttribute("type", l.dataset.kbDefaultType);
        delete l.dataset.kbDefaultHref;
        delete l.dataset.kbDefaultType;
      }
    };
  }, [href]);
  return null;
}
