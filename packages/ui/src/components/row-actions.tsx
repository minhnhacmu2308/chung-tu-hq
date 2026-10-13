// Thao tác trên một dòng của bảng/danh sách: icon hiện ngay khi rê chuột (hoặc Tab tới dòng), kèm nút "…" chứa đủ mọi thao tác.
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Tooltip } from "./tooltip.js";

const MESSAGES = {
  vi: { more: "Thao tác khác" },
  en: { more: "More actions" },
} satisfies Messages<"more">;

export type RowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** "danger" cho thao tác hủy/xóa. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** `false` = chỉ nằm trong menu "…", không hiện icon khi rê chuột (thao tác ít dùng). Mặc định hiện. */
  quick?: boolean;
};

export type RowActionsProps = {
  /** Tên dòng cho trình đọc màn hình, vd "HS-NK-2610-021" → nút đọc là "Mở hồ sơ – HS-NK-2610-021". */
  rowLabel: string;
  actions: readonly RowAction[];
  labels?: Partial<Record<"more", string>>;
  className?: string;
};

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4";
const dangerBtn = "hover:bg-danger-subtle hover:text-danger-subtle-fg";

/**
 * Đặt trong phần tử cha có class `group` (dòng của DataTable đã có sẵn).
 * - Chuột: icon thao tác nhanh hiện khi rê vào dòng.
 * - Bàn phím: Tab vào dòng là icon hiện ra (focus-within).
 * - Cảm ứng (không có hover): ẩn icon nhanh, dùng nút "…" – menu này luôn chứa ĐỦ mọi thao tác.
 */
export function RowActions({ rowLabel, actions, labels, className }: RowActionsProps) {
  const t = useMessages(MESSAGES, labels);
  const quick = actions.filter((a) => a.quick !== false);
  return (
    <div className={cn("flex items-center justify-end gap-0.5", className)}>
      {quick.length > 0 && (
        <span
          data-slot="quick-actions"
          className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:hidden"
        >
          {quick.map((a) => (
            <Tooltip key={a.id} content={a.label}>
              <button
                type="button"
                aria-label={`${a.label} – ${rowLabel}`}
                disabled={a.disabled}
                onClick={a.onSelect}
                className={cn(iconBtn, a.tone === "danger" && dangerBtn)}
              >
                {a.icon}
              </button>
            </Tooltip>
          ))}
        </span>
      )}
      <MenuPrimitive.Root>
        <MenuPrimitive.Trigger aria-label={`${t.more} – ${rowLabel}`} className={cn(iconBtn, "data-[state=open]:bg-surface data-[state=open]:text-fg data-[state=open]:shadow-sm")}>
          <MoreHorizontal aria-hidden="true" />
        </MenuPrimitive.Trigger>
        <MenuPrimitive.Portal>
          <MenuPrimitive.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-lg border border-border bg-surface p-1.5 text-fg shadow-lg motion-safe:animate-pop-in">
            {actions.map((a) => (
              <MenuPrimitive.Item
                key={a.id}
                disabled={a.disabled}
                onSelect={a.onSelect}
                className={cn(
                  "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted",
                  a.tone === "danger" && "text-danger-subtle-fg data-[highlighted]:bg-danger-subtle",
                )}
              >
                <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
                {a.label}
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Content>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
    </div>
  );
}
