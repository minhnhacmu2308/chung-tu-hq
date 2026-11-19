// Cờ của ngôn ngữ giao diện (vi = Việt Nam, en = Vương quốc Anh, zh = Trung Quốc) – SVG tự vẽ vì Windows không hiển thị emoji cờ.
import { cn } from "../lib/cn.js";
import type { UiLocale } from "../lib/i18n.js";

/** Đỉnh ngôi sao 5 cánh tâm (cx, cy), bán kính r, xoay `rot` độ (0 = cánh hướng lên). */
function star(cx: number, cy: number, r: number, rot = 0): string {
  return Array.from({ length: 10 }, (_, k) => {
    const a = ((-90 + rot + k * 36) * Math.PI) / 180;
    const d = k % 2 ? r * 0.382 : r;
    return `${(cx + d * Math.cos(a)).toFixed(2)},${(cy + d * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

export type LocaleFlagProps = {
  locale: UiLocale;
  /** Mặc định 20×14px. */
  className?: string;
  /** Tên truy cập; bỏ trống = trang trí (`aria-hidden`), khi chữ tên ngôn ngữ đã đứng cạnh. */
  label?: string;
};

/** Lá cờ nhỏ bo góc 3:2 cho nút/menu chọn ngôn ngữ. */
export function LocaleFlag({ locale, className, label }: LocaleFlagProps) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true };
  return (
    <svg
      viewBox="0 0 30 20"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-3.5 w-5 shrink-0 overflow-hidden rounded-sm ring-1 ring-border", className)}
      {...a11y}
    >
      {locale === "vi" && (
        <>
          <rect width="30" height="20" className="fill-flag-red" />
          <polygon points={star(15, 10.5, 6)} className="fill-flag-yellow" />
        </>
      )}
      {locale === "zh" && (
        <>
          <rect width="30" height="20" className="fill-flag-red" />
          <polygon points={star(5, 5, 3)} className="fill-flag-yellow" />
          <polygon points={star(10, 2, 1, 23)} className="fill-flag-yellow" />
          <polygon points={star(12, 4, 1, 45)} className="fill-flag-yellow" />
          <polygon points={star(12, 7, 1, 70)} className="fill-flag-yellow" />
          <polygon points={star(10, 9, 1, 20)} className="fill-flag-yellow" />
        </>
      )}
      {locale === "en" && (
        <>
          <rect width="30" height="20" className="fill-flag-blue" />
          <path d="M0,0 L30,20 M30,0 L0,20" className="stroke-flag-white" strokeWidth="4" />
          <path d="M0,0 L30,20 M30,0 L0,20" className="stroke-flag-uk-red" strokeWidth="1.5" />
          <path d="M15,0 V20 M0,10 H30" className="stroke-flag-white" strokeWidth="6" />
          <path d="M15,0 V20 M0,10 H30" className="stroke-flag-uk-red" strokeWidth="3.5" />
        </>
      )}
    </svg>
  );
}
