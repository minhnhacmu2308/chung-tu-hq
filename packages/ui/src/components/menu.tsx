// DropdownMenu (menu thao tác) + Popover (khung nổi chứa nội dung). Bàn phím do Radix xử lý.
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronRight, Circle, X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const surface = "z-50 min-w-48 rounded-lg border border-border bg-surface p-1.5 text-fg shadow-lg motion-safe:animate-pop-in";
const itemCls = cn(
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
  "data-[highlighted]:bg-surface-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
);

/* ===================== DropdownMenu ===================== */

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuGroup = MenuPrimitive.Group;
export const DropdownMenuSub = MenuPrimitive.Sub;
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 4, ...props }: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content sideOffset={sideOffset} className={cn(surface, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

export type DropdownMenuItemProps = ComponentProps<typeof MenuPrimitive.Item> & {
  icon?: ReactNode;
  shortcut?: string;
  tone?: "default" | "danger";
};

export function DropdownMenuItem({ className, icon, shortcut, tone = "default", children, ...props }: DropdownMenuItemProps) {
  return (
    <MenuPrimitive.Item className={cn(itemCls, tone === "danger" && "text-danger-subtle-fg data-[highlighted]:bg-danger-subtle", className)} {...props}>
      {icon && <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <kbd className="ml-auto font-sans text-xs text-fg-subtle">{shortcut}</kbd>}
    </MenuPrimitive.Item>
  );
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem className={cn(itemCls, "pl-8", className)} {...props}>
      <span className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator><Check aria-hidden="true" className="h-4 w-4" /></MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) {
  return (
    <MenuPrimitive.RadioItem className={cn(itemCls, "pl-8", className)} {...props}>
      <span className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
        <MenuPrimitive.ItemIndicator><Circle aria-hidden="true" className="h-2 w-2 fill-current" /></MenuPrimitive.ItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2 py-1.5 text-xs font-semibold text-fg-subtle", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("-mx-1.5 my-1.5 h-px bg-border", className)} {...props} />;
}

export function DropdownMenuSubTrigger({ className, children, icon, ...props }: ComponentProps<typeof MenuPrimitive.SubTrigger> & { icon?: ReactNode }) {
  return (
    <MenuPrimitive.SubTrigger className={cn(itemCls, "data-[state=open]:bg-surface-muted", className)} {...props}>
      {icon && <span aria-hidden="true" className="inline-flex h-4 w-4 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-fg-subtle" />
    </MenuPrimitive.SubTrigger>
  );
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof MenuPrimitive.SubContent>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.SubContent className={cn(surface, className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

/* ===================== Popover ===================== */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

const POPOVER_MESSAGES = { vi: { close: "Đóng" }, en: { close: "Close" } } satisfies Messages<"close">;

export type PopoverContentProps = ComponentProps<typeof PopoverPrimitive.Content> & {
  /** Hiện nút đóng ở góc. */
  showClose?: boolean;
  showArrow?: boolean;
  labels?: Partial<Record<"close", string>>;
};

export function PopoverContent({ className, sideOffset = 6, showClose = false, showArrow = false, labels, children, ...props }: PopoverContentProps) {
  const t = useMessages(POPOVER_MESSAGES, labels);
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn("z-50 w-72 rounded-lg border border-border bg-surface p-4 text-fg shadow-lg focus-visible:outline-none motion-safe:animate-pop-in", showClose && "pr-10", className)}
        {...props}
      >
        {children}
        {showClose && (
          <PopoverPrimitive.Close
            aria-label={t.close}
            className="absolute right-2 top-2 rounded-sm p-1 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </PopoverPrimitive.Close>
        )}
        {showArrow && <PopoverPrimitive.Arrow className="fill-surface" />}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
