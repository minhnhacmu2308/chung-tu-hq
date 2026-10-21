// Hình minh họa trang trí cho trạng thái trống / không tìm thấy / lỗi. SVG thuần, màu lấy từ token
// (tự đổi theo sáng/tối và màu thương hiệu), luôn aria-hidden – ý nghĩa nằm ở tiêu đề đi kèm.
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement } from "react";
import { cn } from "../lib/cn.js";

export const ILLUSTRATIONS = ["empty", "no-results", "not-found", "error"] as const;
export type IllustrationName = (typeof ILLUSTRATIONS)[number];

const illustrationVariants = cva("block h-auto shrink-0 select-none", {
  variants: {
    size: { sm: "w-28", md: "w-40", lg: "w-64" },
  },
  defaultVariants: { size: "md" },
});

export type IllustrationProps = VariantProps<typeof illustrationVariants> & {
  name: IllustrationName;
  className?: string;
};

/** Nền chung: quầng mờ + bóng đổ dưới chân. */
function Ground() {
  return (
    <>
      <circle cx="100" cy="66" r="56" className="fill-primary-subtle" opacity="0.6" />
      <ellipse cx="100" cy="128" rx="58" ry="6" className="fill-surface-muted" />
    </>
  );
}

function Sparkles() {
  return (
    <g className="fill-primary">
      <path d="M36 30 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" opacity="0.7" />
      <path d="M166 22 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" opacity="0.5" />
      <circle cx="160" cy="92" r="2.5" opacity="0.5" />
      <circle cx="44" cy="96" r="2" opacity="0.4" />
    </g>
  );
}

/** Hộp mở, vài tờ giấy trống – "chưa có dữ liệu". */
function Empty() {
  return (
    <>
      <Ground />
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <rect x="74" y="30" width="44" height="54" rx="4" className="fill-paper" transform="rotate(-8 96 57)" />
        <rect x="84" y="24" width="44" height="58" rx="4" className="fill-paper" transform="rotate(6 106 53)" />
      </g>
      <g strokeLinecap="round" strokeWidth="3" className="stroke-primary" opacity="0.55">
        <path d="M94 38 h24" transform="rotate(6 106 53)" />
        <path d="M94 47 h18" transform="rotate(6 106 53)" />
      </g>
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <path d="M52 76 L100 64 L148 76 L148 120 Q148 124 144 124 L56 124 Q52 124 52 120 Z" className="fill-surface" />
        <path d="M52 76 L100 90 L148 76" className="fill-surface-muted" />
        <path d="M52 76 L38 96 L86 110 L100 90 Z" className="fill-surface" />
        <path d="M148 76 L162 96 L114 110 L100 90 Z" className="fill-surface" />
      </g>
      <path d="M100 92 V122" strokeWidth="2" strokeDasharray="3 4" className="stroke-border-strong" />
      <Sparkles />
    </>
  );
}

/** Kính lúp trên tài liệu – "không có kết quả khớp bộ lọc". */
function NoResults() {
  return (
    <>
      <Ground />
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <path d="M62 22 H118 L134 38 V122 Q134 126 130 126 H62 Q58 126 58 122 V26 Q58 22 62 22 Z" className="fill-paper" />
        <path d="M118 22 V38 H134" className="fill-surface-muted" />
      </g>
      <g strokeLinecap="round" strokeWidth="3" className="stroke-border">
        <path d="M70 50 H112" />
        <path d="M70 62 H120" />
        <path d="M70 74 H100" />
        <path d="M70 98 H94" />
      </g>
      <g strokeWidth="5" strokeLinecap="round" className="stroke-primary">
        <circle cx="122" cy="88" r="20" className="fill-surface" opacity="0.92" />
        <path d="M137 103 L154 120" />
      </g>
      <path d="M114 82 L130 94 M130 82 L114 94" strokeWidth="3" strokeLinecap="round" className="stroke-fg-subtle" />
      <Sparkles />
    </>
  );
}

/** "404" + tờ giấy lạc đường – "trang không tồn tại". */
function NotFound() {
  return (
    <>
      <Ground />
      <text x="100" y="78" textAnchor="middle" fontSize="64" fontWeight="800" letterSpacing="-2" className="fill-primary" opacity="0.9">
        404
      </text>
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong" transform="rotate(-12 124 104)">
        <path d="M108 80 H134 L144 90 V126 Q144 128 142 128 H108 Q106 128 106 126 V82 Q106 80 108 80 Z" className="fill-paper" />
        <path d="M134 80 V90 H144" className="fill-surface-muted" />
      </g>
      <path
        d="M120 98 q0 -6 6 -6 q6 0 6 6 q0 4 -6 6 v4"
        strokeWidth="3" strokeLinecap="round" fill="none" className="stroke-primary" transform="rotate(-12 124 104)"
      />
      <circle cx="127" cy="116" r="2" className="fill-primary" transform="rotate(-12 124 104)" />
      <path d="M40 120 q16 -14 30 -4 t30 -2" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" fill="none" className="stroke-fg-subtle" />
      <Sparkles />
    </>
  );
}

/** Đám mây có tia sét – "có lỗi, thử lại". */
function ErrorArt() {
  return (
    <>
      <Ground />
      <path
        d="M58 96 Q40 96 40 80 Q40 64 58 64 Q62 40 88 40 Q110 40 118 58 Q124 54 132 54 Q152 54 154 74 Q166 78 166 88 Q166 96 156 96 Z"
        strokeWidth="2" strokeLinejoin="round" className="fill-surface stroke-border-strong"
      />
      <path d="M104 70 L90 98 H104 L96 124 L124 88 H108 L118 70 Z" strokeWidth="2" strokeLinejoin="round" className="fill-warning stroke-warning" />
      <g className="fill-danger" opacity="0.6">
        <circle cx="64" cy="110" r="2.5" />
        <circle cx="140" cy="112" r="2.5" />
      </g>
    </>
  );
}

const ART: Record<IllustrationName, () => ReactElement> = {
  empty: Empty,
  "no-results": NoResults,
  "not-found": NotFound,
  error: ErrorArt,
};

export function Illustration({ name, size, className }: IllustrationProps) {
  const Art = ART[name];
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" data-illustration={name} className={cn(illustrationVariants({ size }), className)}>
      <Art />
    </svg>
  );
}
