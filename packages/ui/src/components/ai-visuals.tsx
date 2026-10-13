// Hình trang trí "AI" cho màn giới thiệu/đăng nhập: nền mạng tín hiệu và minh họa AI đọc chứng từ.
// Thuần CSS/SVG, màu lấy từ token; mọi chuyển động tắt khi người dùng bật giảm chuyển động.
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

/* ---------------- AiBackdrop ---------------- */

// Toạ độ trong viewBox 400×600. Mỗi cạnh là một đường tín hiệu chạy giữa hai nút.
const NODES = [
  [48, 70], [150, 40], [262, 96], [352, 58], [92, 190], [214, 228], [330, 204],
  [58, 338], [176, 372], [298, 348], [120, 486], [246, 520], [358, 470],
] as const;
const EDGES = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [2, 6], [4, 5], [5, 6], [4, 7], [5, 8], [6, 9],
  [7, 8], [8, 9], [7, 10], [8, 11], [9, 12], [10, 11], [11, 12],
] as const;
// Class tĩnh để Tailwind quét được – lệch pha tín hiệu/nhấp nháy giữa các phần tử.
const DELAYS = ["[animation-delay:0ms]", "[animation-delay:-900ms]", "[animation-delay:-1800ms]", "[animation-delay:-2700ms]"] as const;

export type AiBackdropProps = { className?: string };

/**
 * Lớp nền trang trí: quầng sáng trôi chậm + mạng nút có tín hiệu chạy qua. Đặt trong vùng chứa
 * `relative overflow-hidden` có màu chữ là màu muốn vẽ (vd panel `bg-primary text-primary-fg`); nội dung đặt `relative` phía trên.
 */
export function AiBackdrop({ className }: AiBackdropProps) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <span className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-current opacity-15 blur-3xl motion-safe:animate-orb-a" />
      <span className="absolute -bottom-1/4 -right-1/4 h-3/5 w-3/5 rounded-full bg-current opacity-10 blur-3xl motion-safe:animate-orb-b" />
      <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" fill="none">
        <g className="stroke-current opacity-15" strokeWidth="1">
          {EDGES.map(([a, b]) => (
            <line key={`${a}-${b}`} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
          ))}
        </g>
        {/* Tín hiệu: một đoạn sáng ngắn chạy dọc từng cạnh. */}
        <g className="stroke-current opacity-70" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="14 206">
          {EDGES.map(([a, b], i) => (
            <line
              key={`${a}-${b}`}
              x1={NODES[a][0]}
              y1={NODES[a][1]}
              x2={NODES[b][0]}
              y2={NODES[b][1]}
              className={cn("motion-safe:animate-signal motion-reduce:hidden", DELAYS[i % DELAYS.length])}
            />
          ))}
        </g>
        <g className="fill-current">
          {NODES.map(([x, y], i) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={i % 3 === 0 ? 3 : 2} className={cn("opacity-60 motion-safe:animate-twinkle", DELAYS[i % DELAYS.length])} />
          ))}
        </g>
      </svg>
    </div>
  );
}

/* ---------------- AiScanCard ---------------- */

const CHIP_DELAYS = ["[animation-delay:600ms]", "[animation-delay:1500ms]", "[animation-delay:2400ms]", "[animation-delay:3300ms]"] as const;
const LINE_WIDTHS = ["w-3/5", "w-full", "w-4/5", "w-full", "w-2/3", "w-5/6", "w-1/2"] as const;

export type AiScanField = { label: ReactNode; value: ReactNode };

export type AiScanCardProps = {
  /** Tên chứng từ in ở đầu trang giấy (vd "COMMERCIAL INVOICE"). */
  title: ReactNode;
  /** Tối đa 4 trường "AI vừa đọc được" lần lượt hiện ra cạnh trang giấy. */
  fields: readonly AiScanField[];
  className?: string;
};

/**
 * Minh họa AI đọc chứng từ: tia quét chạy dọc trang giấy, các trường trích xuất lần lượt bật ra.
 * Chỉ để trang trí (aria-hidden) – nội dung thật phải có ở chỗ khác trên trang.
 */
export function AiScanCard({ title, fields, className }: AiScanCardProps) {
  return (
    <div aria-hidden="true" className={cn("relative flex items-center motion-safe:animate-float", className)}>
      <div className="relative h-44 w-36 shrink-0 overflow-hidden rounded-md bg-surface p-3 text-fg shadow-lg">
        <p className="truncate font-mono text-[0.5rem] font-semibold tracking-wider text-fg-muted">{title}</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {LINE_WIDTHS.map((w, i) => (
            <span key={i} className={cn("h-1.5 rounded-full bg-surface-muted", w)} />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="h-1.5 rounded-full bg-surface-muted" />
          ))}
        </div>
        {/* Tia quét */}
        <span className="absolute inset-x-0 top-1/3 h-8 border-b-2 border-primary bg-linear-to-b from-transparent to-primary-subtle motion-safe:animate-scan motion-reduce:hidden" />
      </div>
      <ul className="-ml-4 flex min-w-0 flex-col gap-2">
        {fields.slice(0, CHIP_DELAYS.length).map((f, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-2 rounded-md bg-surface py-1.5 pl-2 pr-3 text-xs text-fg shadow-md motion-safe:animate-chip-cycle",
              CHIP_DELAYS[i],
            )}
          >
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-subtle text-success-subtle-fg">
              <Check className="h-3 w-3" />
            </span>
            <span className="text-fg-muted">{f.label}</span>
            <span className="truncate font-mono font-medium">{f.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
