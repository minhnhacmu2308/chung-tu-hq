// HelpPopover: nút icon nhỏ (mặc định `?`) mở khung nổi chứa hướng dẫn tĩnh – thay cho khung `Alert` thông tin lặp lại mỗi lần vào màn
// (giải thích cách dùng, phạm vi sửa, phím tắt). Đặt sát thứ nó giải thích: cạnh tiêu đề, cạnh công tắc. Bấm / Enter mở, Esc hoặc ✕ đóng;
// dùng được trên màn cảm ứng (khác Tooltip chỉ hiện khi rê chuột).
// ShortcutList: bảng phím tắt (tổ hợp phím → tác dụng) đặt trong HelpPopover.
import { CircleHelp } from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Button } from "./button.js";
import { Popover, PopoverContent, PopoverTrigger } from "./menu.js";
import { Tooltip } from "./tooltip.js";

const HELP_MESSAGES = {
  vi: { help: "Hướng dẫn" },
  en: { help: "Help" },
  zh: { help: "帮助" },
} satisfies Messages<"help">;

export type HelpPopoverProps = {
  /** Tên nút (aria-label + Tooltip), vd "Phím tắt". Mặc định "Hướng dẫn". */
  label?: string;
  /** Tiêu đề trong khung nổi. */
  title?: ReactNode;
  /** Icon của nút. Mặc định `CircleHelp` (?). */
  icon?: ReactNode;
  children: ReactNode;
  /** Điều khiển từ ngoài (vd tự mở một lần khi bật tính năng). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  labels?: Partial<Record<"help" | "close", string>>;
};

export function HelpPopover({ label, title, icon, children, open, onOpenChange, side = "bottom", align = "start", className, labels }: HelpPopoverProps) {
  const t = useMessages(HELP_MESSAGES, labels?.help ? { help: labels.help } : undefined);
  const name = label ?? t.help;
  return (
    <Popover {...(open !== undefined ? { open } : {})} {...(onOpenChange ? { onOpenChange } : {})}>
      <Tooltip content={name}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={name}>
            {icon ?? <CircleHelp aria-hidden="true" className="h-4 w-4" />}
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent
        aria-label={name}
        showClose
        side={side}
        align={align}
        collisionPadding={8}
        className={cn("w-80 max-w-[calc(100vw-2rem)] text-sm", className)}
        {...(labels?.close ? { labels: { close: labels.close } } : {})}
      >
        {title && <p className="mb-1.5 font-medium text-fg">{title}</p>}
        <div className="text-fg-muted">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

export type ShortcutItem = {
  /** Các phím của tổ hợp, vd ["Ctrl", "V"]; một phần tử không phải phím (vd "Nhấp đúp") vẫn hiện như phím. */
  keys: string[];
  /** Tác dụng. */
  label: ReactNode;
};

export function ShortcutList({ items, className }: { items: ShortcutItem[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5", className)}>
      {items.map((it, i) => (
        <Fragment key={i}>
          <dt className="flex flex-wrap items-center gap-1 whitespace-nowrap">
            {it.keys.map((k, j) => (
              <Fragment key={j}>
                {j > 0 && <span aria-hidden="true" className="text-xs text-fg-subtle">+</span>}
                <kbd className="rounded-sm border border-border bg-surface-muted px-1.5 py-0.5 font-sans text-xs font-medium text-fg">{k}</kbd>
              </Fragment>
            ))}
          </dt>
          <dd className="text-fg-muted">{it.label}</dd>
        </Fragment>
      ))}
    </dl>
  );
}
