// Hình minh họa trang trí cho trạng thái trống / không tìm thấy / lỗi / máy chủ lỗi (500) / mất kết nối máy chủ (502). SVG thuần, màu lấy từ token
// (tự đổi theo sáng/tối và màu thương hiệu), luôn aria-hidden – ý nghĩa nằm ở tiêu đề đi kèm.
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement } from "react";
import { cn } from "../lib/cn.js";

export const ILLUSTRATIONS = ["empty", "no-results", "not-found", "error", "server-error", "bad-gateway"] as const;
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

/** Mã lỗi lớn phía trên (cùng kiểu với 404). */
function Code({ value }: { value: string }) {
  return (
    <text x="100" y="58" textAnchor="middle" fontSize="50" fontWeight="800" letterSpacing="-2" className="fill-primary" opacity="0.9">
      {value}
    </text>
  );
}

/** "500" + máy chủ báo động – "máy chủ gặp lỗi". */
function ServerError() {
  return (
    <>
      <Ground />
      <Code value="500" />
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <rect x="68" y="68" width="64" height="26" rx="4" className="fill-surface" />
        <rect x="68" y="96" width="64" height="26" rx="4" className="fill-surface" />
      </g>
      <g strokeLinecap="round" strokeWidth="3" className="stroke-border">
        <path d="M78 81 H104" />
        <path d="M78 109 H104" />
      </g>
      <circle cx="120" cy="81" r="3.5" className="fill-danger" />
      <circle cx="120" cy="109" r="3.5" className="fill-warning" />
      <g transform="translate(140 66)">
        <path d="M0 -12 L12 9 H-12 Z" strokeWidth="2" strokeLinejoin="round" className="fill-warning stroke-warning" />
        <path d="M0 -4 V2" strokeWidth="2.5" strokeLinecap="round" className="stroke-warning-fg" />
        <circle cx="0" cy="5.5" r="1.4" className="fill-warning-fg" />
      </g>
      <g className="fill-primary">
        <path d="M36 30 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" opacity="0.7" />
        <circle cx="44" cy="96" r="2" opacity="0.4" />
      </g>
    </>
  );
}

/** "502" + dây nối giữa trình duyệt và máy chủ bị đứt – "cổng nối máy chủ không phản hồi". */
function BadGateway() {
  return (
    <>
      <Ground />
      <Code value="502" />
      {/* Trình duyệt */}
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <rect x="26" y="76" width="44" height="34" rx="4" className="fill-surface" />
        <path d="M26 84 H70" />
        <path d="M40 118 H56 M48 110 V118" strokeLinecap="round" />
      </g>
      <g className="fill-border-strong">
        <circle cx="31" cy="80" r="1.3" />
        <circle cx="35" cy="80" r="1.3" />
      </g>
      <g strokeLinecap="round" strokeWidth="3" className="stroke-border">
        <path d="M33 92 H58" />
        <path d="M33 100 H50" />
      </g>
      {/* Máy chủ */}
      <g strokeWidth="2" strokeLinejoin="round" className="stroke-border-strong">
        <rect x="134" y="70" width="40" height="22" rx="4" className="fill-surface" />
        <rect x="134" y="94" width="40" height="22" rx="4" className="fill-surface" />
      </g>
      <g strokeLinecap="round" strokeWidth="3" className="stroke-border">
        <path d="M142 81 H156" />
        <path d="M142 105 H156" />
      </g>
      <circle cx="165" cy="81" r="3" className="fill-fg-subtle" />
      <circle cx="165" cy="105" r="3" className="fill-fg-subtle" />
      {/* Dây đứt + tia lửa */}
      <g strokeWidth="2.5" strokeLinecap="round" fill="none" className="stroke-primary">
        <path d="M70 94 Q80 94 84 100 T92 104" />
        <path d="M134 94 Q122 94 118 88 T108 84" />
      </g>
      <g className="fill-primary">
        <rect x="90" y="100" width="7" height="8" rx="1.5" transform="rotate(20 93 104)" />
        <rect x="103" y="80" width="7" height="8" rx="1.5" transform="rotate(20 106 84)" />
      </g>
      <path d="M100 86 L96 94 H101 L98 102 L106 91 H101 L104 86 Z" strokeWidth="1.5" strokeLinejoin="round" className="fill-warning stroke-warning" />
      <g className="fill-primary">
        <path d="M166 22 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" opacity="0.5" />
      </g>
    </>
  );
}

const ART: Record<IllustrationName, () => ReactElement> = {
  empty: Empty,
  "no-results": NoResults,
  "not-found": NotFound,
  error: ErrorArt,
  "server-error": ServerError,
  "bad-gateway": BadGateway,
};

export function Illustration({ name, size, className }: IllustrationProps) {
  const Art = ART[name];
  return (
    <svg viewBox="0 0 200 140" aria-hidden="true" focusable="false" data-illustration={name} className={cn(illustrationVariants({ size }), className)}>
      <Art />
    </svg>
  );
}
