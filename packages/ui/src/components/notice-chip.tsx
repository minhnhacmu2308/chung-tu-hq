// NoticeChip: lưu ý / cảnh báo gọn thành một nhãn tròn (icon + chữ ngắn); bấm hoặc Enter mở thẻ chi tiết (câu đầy đủ, từng mục,
// văn bản căn cứ dạng thẻ nhỏ). Thay cho câu cảnh báo dài viết thẳng vào ô bảng hay tooltip chữ thô.
import { cva } from "class-variance-authority";
import { ChevronDown, ChevronRight, CircleAlert, Info, OctagonAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Badge } from "./feedback.js";
import { IconTile } from "./icon-tile.js";
import { Popover, PopoverContent, PopoverTrigger } from "./menu.js";

export type NoticeTone = "danger" | "warning" | "info";

/** Một mục chi tiết: câu chính + văn bản căn cứ (hiện thành thẻ nhỏ). */
export type NoticeItem = { text: string; refs?: string[] };

const MESSAGES = {
  vi: { danger: "Cần xử lý", warning: "Cần kiểm tra", info: "Lưu ý", refs: "Căn cứ" },
  en: { danger: "Action needed", warning: "Check needed", info: "Note", refs: "Legal basis" },
  zh: { danger: "需处理", warning: "需核对", info: "提示", refs: "依据" },
} satisfies Messages<"danger" | "warning" | "info" | "refs">;

const chipVariants = cva(
  "pressable inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  {
    variants: {
      tone: {
        danger: "border-danger bg-danger-subtle text-danger-subtle-fg hover:bg-danger hover:text-danger-fg",
        warning: "border-warning bg-warning-subtle text-warning-subtle-fg hover:bg-warning hover:text-warning-fg",
        info: "border-warning/50 bg-surface text-warning-subtle-fg hover:bg-warning-subtle",
      },
    },
  },
);

// Thẻ nhỏ: viền trái màu theo mức độ, nền nổi nhẹ khi rê chuột.
const tileVariants = cva(
  "pressable flex w-full min-w-0 items-center gap-3 rounded-lg border border-l-4 border-border bg-surface px-3 py-2.5 text-left shadow-sm hover:bg-surface-muted hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  { variants: { tone: { danger: "border-l-danger", warning: "border-l-warning", info: "border-l-warning/60" } } },
);

// "Lưu ý" cùng họ vàng với "Cần kiểm tra" nhưng nhẹ hơn (viền, không tô nền); không dùng xanh (đọc như thông báo hệ thống)
const stripe: Record<NoticeTone, string> = { danger: "border-t-danger", warning: "border-t-warning", info: "border-t-warning/60" };
const tileTone: Record<NoticeTone, "danger" | "warning"> = { danger: "danger", warning: "warning", info: "warning" };

function ToneIcon({ tone, className }: { tone: NoticeTone; className?: string }) {
  const Icon = tone === "danger" ? OctagonAlert : tone === "warning" ? CircleAlert : Info;
  return <Icon aria-hidden="true" className={className} />;
}

export type NoticeChipProps = {
  tone: NoticeTone;
  /** Chữ ngắn trên nhãn (2–4 từ). */
  label: string;
  /** Tiêu đề thẻ chi tiết; mặc định = `label`. */
  title?: string;
  /** Câu đầy đủ. */
  description?: string;
  items?: NoticeItem[];
  /** Dòng cuối thẻ (vd "Áp dụng cho dòng 1, 2, 5"). */
  meta?: ReactNode;
  /** Số đối tượng cùng lưu ý (hiện "×n" trên nhãn `chip`; `tile` nói bằng `subtitle`). */
  count?: number;
  /** `chip` nhãn tròn trong ô bảng; `tile` thẻ nhỏ (icon + tên + dòng phụ) cho khối lưu ý chung đầu bảng/thẻ. */
  variant?: "chip" | "tile";
  /** Icon thay icon mức độ (vd theo loại: chính sách, thuế). */
  icon?: ReactNode;
  /** Dòng phụ của `tile` (vd "Dòng 1–3"). */
  subtitle?: string;
  labels?: Partial<Record<"danger" | "warning" | "info" | "refs", string>>;
  className?: string;
};

export function NoticeChip({ tone, label, title, description, items = [], meta, count, variant = "chip", icon, subtitle, labels, className }: NoticeChipProps) {
  const t = useMessages(MESSAGES, labels);
  return (
    <Popover>
      <PopoverTrigger asChild>
        {variant === "tile" ? (
          <button type="button" className={cn(tileVariants({ tone }), className)}>
            <IconTile size="sm" tone={tileTone[tone]} icon={icon ?? <ToneIcon tone={tone} />} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="line-clamp-2 text-sm font-medium text-fg">{label}</span>
              {subtitle && <span className="truncate text-xs text-fg-muted">{subtitle}</span>}
            </span>
            <span className="sr-only"> ({t[tone]})</span>
            <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-subtle" />
          </button>
        ) : (
          <button type="button" className={cn(chipVariants({ tone }), className)}>
            {icon ? <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span> : <ToneIcon tone={tone} className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate">{label}</span>
            {count !== undefined && count > 1 && <span className="tabular-nums opacity-80">×{count}</span>}
            {/* Tên truy cập nói rõ mức độ (không truyền nghĩa chỉ bằng màu). */}
            <span className="sr-only"> ({t[tone]})</span>
            <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent aria-label={title ?? label} showClose className={cn("w-96 max-w-[calc(100vw-2rem)] border-t-4 p-0", stripe[tone])} align="start">
        <div className="flex items-start gap-3 px-4 pt-4">
          <IconTile size="sm" tone={tileTone[tone]} icon={icon ?? <ToneIcon tone={tone} />} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">{title ?? label}</p>
            <Badge size="sm" tone={tileTone[tone]} className="mt-0.5">{t[tone]}</Badge>
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto px-4 pb-4 pt-3">
          {description && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
          {items.length > 0 && (
            <ul className={cn("flex flex-col divide-y divide-border", description && "mt-3")}>
              {items.map((it, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <p className="text-sm leading-relaxed text-fg">{it.text}</p>
                  {it.refs && it.refs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1" aria-label={t.refs} role="group">
                      {it.refs.map((r) => (
                        <Badge key={r} size="sm" variant="outline" className="whitespace-normal text-left">{r}</Badge>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        {meta && <div className="border-t border-border bg-surface-muted px-4 py-2 text-xs text-fg-muted">{meta}</div>}
      </PopoverContent>
    </Popover>
  );
}
