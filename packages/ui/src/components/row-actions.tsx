// Thao tác trên một dòng của bảng/danh sách: icon hiện ngay khi rê chuột (hoặc Tab tới dòng), kèm nút "…" chứa đủ mọi thao tác.
// Luật (DESIGN-SYSTEM §RowActions): tối đa MAX_QUICK icon nhanh; thao tác nguy hiểm (tone danger) và thao tác chính (`primary` –
// trùng bấm dòng, vd "Mở") KHÔNG BAO GIỜ là icon nhanh. Menu: chính → còn lại → (kẻ) → nguy hiểm.
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Tooltip } from "./tooltip.js";

/** Số icon nhanh tối đa trên một dòng – phần dư chỉ nằm trong menu "…". */
export const MAX_QUICK = 2;

const MESSAGES = {
  vi: { more: "Thao tác khác" },
  en: { more: "More actions" },
  zh: { more: "更多操作" },
} satisfies Messages<"more">;

export type RowAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** "danger" cho thao tác hủy/xóa. */
  tone?: "default" | "danger";
  disabled?: boolean;
  /** `false` = chỉ nằm trong menu "…", không hiện icon khi rê chuột (thao tác ít dùng). Mặc định hiện (trong giới hạn MAX_QUICK). */
  quick?: boolean;
  /**
   * Thao tác chính của dòng, thường trùng bấm dòng ("Mở hồ sơ", "Xem chi tiết"): đứng đầu menu, chữ đậm, không thành icon nhanh
   * (bấm dòng đã làm việc đó – không tốn chỗ icon cho việc lặp).
   */
  primary?: boolean;
};

/** Icon nhanh theo luật: không chính, không nguy hiểm, không tắt `quick`, tối đa MAX_QUICK (giữ thứ tự khai báo). */
export function quickActionsOf(actions: readonly RowAction[]): RowAction[] {
  return actions.filter((a) => a.quick !== false && !a.primary && a.tone !== "danger").slice(0, MAX_QUICK);
}

/** Thứ tự trong menu: chính → còn lại (thứ tự khai báo) → nguy hiểm (sau đường kẻ). */
export function menuGroupsOf(actions: readonly RowAction[]): { main: RowAction[]; danger: RowAction[] } {
  return {
    main: [...actions.filter((a) => a.primary), ...actions.filter((a) => !a.primary && a.tone !== "danger")],
    danger: actions.filter((a) => a.tone === "danger"),
  };
}

export type RowActionsProps = {
  /** Tên dòng cho trình đọc màn hình, vd "HS-NK-2610-021" → nút đọc là "Mở hồ sơ – HS-NK-2610-021". */
  rowLabel: string;
  actions: readonly RowAction[];
  labels?: Partial<Record<"more", string>>;
  className?: string;
};

const iconBtn =
  "hit-area pressable inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface hover:text-fg hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4";

/**
 * Đặt trong phần tử cha có class `group` (dòng của DataTable đã có sẵn).
 * - Chuột: icon thao tác nhanh hiện khi rê vào dòng.
 * - Bàn phím: Tab vào dòng là icon hiện ra (focus-within).
 * - Cảm ứng (không có hover): ẩn icon nhanh, dùng nút "…" – menu này luôn chứa ĐỦ mọi thao tác.
 */
export function RowActions({ rowLabel, actions, labels, className }: RowActionsProps) {
  const t = useMessages(MESSAGES, labels);
  const trigger = useRef<HTMLButtonElement>(null);
  /** Thao tác vừa chọn trong menu, chờ menu đóng xong mới chạy. */
  const picked = useRef<(() => void) | null>(null);
  const quick = quickActionsOf(actions);
  const groups = menuGroupsOf(actions);
  const item = (a: RowAction) => (
    <MenuPrimitive.Item
      key={a.id}
      disabled={a.disabled}
      // Chỉ ghi nhận – chạy trong onCloseAutoFocus, SAU khi menu đóng hẳn (kể cả hiệu ứng đóng) và focus đã về nút "…".
      onSelect={() => (picked.current = a.onSelect)}
      className={cn(
        "flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 pointer-coarse:py-2.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted",
        a.primary && "font-medium",
        a.tone === "danger" && "text-danger-subtle-fg data-[highlighted]:bg-danger-subtle",
      )}
    >
      <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{a.icon}</span>
      {a.label}
    </MenuPrimitive.Item>
  );
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
                className={iconBtn}
              >
                {a.icon}
              </button>
            </Tooltip>
          ))}
        </span>
      )}
      <MenuPrimitive.Root>
        <MenuPrimitive.Trigger ref={trigger} aria-label={`${t.more} – ${rowLabel}`} className={cn(iconBtn, "data-[state=open]:bg-surface data-[state=open]:text-fg data-[state=open]:shadow-sm")}>
          <MoreHorizontal aria-hidden="true" />
        </MenuPrimitive.Trigger>
        <MenuPrimitive.Portal>
          <MenuPrimitive.Content
            align="end"
            sideOffset={4}
            // Trả focus về nút "…" rồi mới chạy thao tác: thao tác mở popup (xác nhận xóa/hủy) không bị lần trả focus đến muộn
            // coi là "focus ra ngoài" mà đóng ngay (gặp ở dạng thẻ, phụ thuộc thời gian hiệu ứng đóng menu).
            onCloseAutoFocus={(e) => {
              const run = picked.current;
              if (!run) return;
              picked.current = null;
              e.preventDefault();
              trigger.current?.focus();
              run();
            }} className="z-50 min-w-44 rounded-lg border border-border bg-surface p-1.5 text-fg shadow-lg motion-safe:animate-pop-in motion-safe:data-[state=closed]:animate-pop-out">
            {groups.main.map(item)}
            {groups.main.length > 0 && groups.danger.length > 0 && <MenuPrimitive.Separator className="-mx-1.5 my-1 h-px bg-border" />}
            {groups.danger.map(item)}
          </MenuPrimitive.Content>
        </MenuPrimitive.Portal>
      </MenuPrimitive.Root>
    </div>
  );
}
