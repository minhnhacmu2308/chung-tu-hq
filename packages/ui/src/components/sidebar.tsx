// Menu điều hướng chính, co giãn: mở rộng (icon + nhãn + nhóm con) ↔ thu gọn (cột icon).
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Menu, X } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
  type ElementType,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Tooltip } from "./tooltip.js";

const MESSAGES = {
  vi: { nav: "Điều hướng chính", collapse: "Thu gọn menu", expand: "Mở rộng menu", openMenu: "Mở menu", closeMenu: "Đóng menu" },
  en: { nav: "Main navigation", collapse: "Collapse menu", expand: "Expand menu", openMenu: "Open menu", closeMenu: "Close menu" },
} satisfies Messages<"nav" | "collapse" | "expand" | "openMenu" | "closeMenu">;

export type NavItem = {
  id: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  badge?: ReactNode;
  /** Nhóm mở xổ tại chỗ. */
  children?: NavItem[];
  /** Hiện mũi tên phải: mục dẫn tới khu vực có menu riêng (vd Thiết lập). */
  hasSubmenu?: boolean;
};

type Ctx = { collapsed: boolean };
const SidebarContext = createContext<Ctx>({ collapsed: false });
export const useSidebar = () => useContext(SidebarContext);

export type SidebarProps = {
  brand: { logo: ReactNode; name: ReactNode; href?: string };
  items: readonly NavItem[];
  activeId?: string | undefined;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  /** Gọi khi chọn mục không có href (hoặc muốn theo dõi điều hướng). */
  onNavigate?: (item: NavItem) => void;
  /** Component link, vd `Link` của Next.js. Mặc định thẻ <a>. */
  linkAs?: ElementType;
  /** Khu vực chân: SidebarFooterButton, SidebarUser… */
  footer?: ReactNode;
  labels?: Partial<Record<"nav" | "collapse" | "expand" | "openMenu" | "closeMenu", string>>;
  className?: string;
  /** Màn hình nhỏ (< md): menu thành ngăn kéo. Truyền onMobileOpenChange để bật chế độ này. */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
};

const itemBase = cn(
  "group flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm text-fg-muted transition-colors",
  "hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
);
const itemActive = "bg-primary-subtle font-medium text-primary-subtle-fg hover:bg-primary-subtle hover:text-primary-subtle-fg";
const iconBox = "inline-flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-4.5 [&>svg]:w-4.5";

function containsActive(item: NavItem, activeId?: string): boolean {
  return !!activeId && (item.id === activeId || !!item.children?.some((c) => containsActive(c, activeId)));
}

export function Sidebar({
  brand,
  items,
  activeId,
  collapsed,
  onCollapsedChange,
  onNavigate,
  linkAs: LinkTag = "a",
  footer,
  labels,
  className,
  mobileOpen = false,
  onMobileOpenChange,
}: SidebarProps) {
  const navId = useId();
  const l = useMessages(MESSAGES, labels);
  const hasMobile = onMobileOpenChange !== undefined;
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.children && containsActive(i, activeId)).map((i) => i.id)),
  );

  // Trang đang mở nằm trong nhóm nào thì tự mở nhóm đó.
  useEffect(() => {
    const g = items.find((i) => i.children && containsActive(i, activeId));
    if (g) setOpen((s) => (s.has(g.id) ? s : new Set(s).add(g.id)));
  }, [activeId, items]);

  /** Thân sidebar; `c` = đang thu gọn, `mobile` = nằm trong ngăn kéo điện thoại. */
  const renderBody = (c: boolean, mobile: boolean) => {
    const select = (item: NavItem) => {
      onNavigate?.(item);
      if (mobile) onMobileOpenChange?.(false);
    };
    const toggleGroup = (id: string) => {
      if (c) {
        // Thu gọn mà bấm nhóm: mở rộng menu và mở nhóm đó.
        onCollapsedChange(false);
        setOpen((s) => new Set(s).add(id));
        return;
      }
      setOpen((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    };
    const renderLeaf = (item: NavItem, depth: number) => {
      const active = item.id === activeId;
      const iconOnly = c && depth === 0;
      const content = (
        <>
          {item.icon && <span aria-hidden="true" className={iconBox}>{item.icon}</span>}
          <span className={cn("min-w-0 flex-1 truncate text-left", iconOnly && "sr-only")}>{item.label}</span>
          {!c && item.badge}
          {!c && item.hasSubmenu && <ChevronRight aria-hidden="true" className="h-4 w-4 text-fg-subtle" />}
        </>
      );
      const common = {
        className: cn(itemBase, active && itemActive, iconOnly && "justify-center px-0"),
        "aria-current": active ? ("page" as const) : undefined,
        onClick: () => select(item),
      };
      const el = item.href ? (
        <LinkTag href={item.href} {...common}>{content}</LinkTag>
      ) : (
        <button type="button" {...common}>{content}</button>
      );
      return iconOnly ? <Tooltip content={item.label} side="right">{el}</Tooltip> : el;
    };

    return (
      <>
        <div className={cn("flex h-14 items-center gap-2.5 px-3", c && "justify-center px-0")}>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-fg">{brand.logo}</span>
          {!c && <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{brand.name}</span>}
          {mobile && (
            <DialogPrimitive.Close
              aria-label={l.closeMenu}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </DialogPrimitive.Close>
          )}
        </div>

        {!mobile && (
          <button
            type="button"
            onClick={() => onCollapsedChange(!c)}
            aria-label={c ? l.expand : l.collapse}
            aria-expanded={!c}
            aria-controls={navId}
            className="absolute -right-3 top-12 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface text-fg-muted shadow-sm hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {c ? <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronLeft aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        )}

        <nav id={mobile ? undefined : navId} aria-label={l.nav} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => {
              if (!item.children?.length) return <li key={item.id}>{renderLeaf(item, 0)}</li>;
              const isOpen = open.has(item.id) && !c;
              const hasActive = containsActive(item, activeId);
              const groupId = `${navId}-${mobile ? "m-" : ""}${item.id}`;
              const groupBtn = (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={groupId}
                  onClick={() => toggleGroup(item.id)}
                  className={cn(itemBase, hasActive && "font-medium text-fg", hasActive && c && itemActive, c && "justify-center px-0")}
                >
                  {item.icon && <span aria-hidden="true" className={cn(iconBox, hasActive && "text-primary")}>{item.icon}</span>}
                  <span className={cn("min-w-0 flex-1 truncate text-left", c && "sr-only")}>{item.label}</span>
                  {!c && <ChevronDown aria-hidden="true" className={cn("h-4 w-4 text-fg-subtle transition-transform", !isOpen && "-rotate-90")} />}
                </button>
              );
              return (
                <li key={item.id}>
                  {c ? <Tooltip content={item.label} side="right">{groupBtn}</Tooltip> : groupBtn}
                  {isOpen && (
                    <ul id={groupId} className="ml-4.5 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
                      {item.children.map((ch) => (
                        <li key={ch.id}>{renderLeaf(ch, 1)}</li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {footer && (
          <SidebarContext.Provider value={{ collapsed: c }}>
            <div className="flex flex-col gap-0.5 border-t border-border px-2 py-2">{footer}</div>
          </SidebarContext.Provider>
        )}
      </>
    );
  };

  const asideBase = "relative flex h-dvh shrink-0 flex-col border-r border-border bg-surface";
  return (
    <>
      <aside
        data-collapsed={collapsed}
        className={cn(
          asideBase,
          "transition-[width] duration-200 motion-reduce:transition-none",
          collapsed ? "w-16" : "w-64",
          hasMobile && "hidden md:flex",
          className,
        )}
      >
        {renderBody(collapsed, false)}
      </aside>

      {hasMobile && (
        <DialogPrimitive.Root open={mobileOpen} onOpenChange={onMobileOpenChange}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay md:hidden" />
            <DialogPrimitive.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-lg focus-visible:outline-none md:hidden">
              <DialogPrimitive.Title className="sr-only">{l.nav}</DialogPrimitive.Title>
              <aside data-mobile="true" className={cn(asideBase, "w-full")}>
                {renderBody(false, true)}
              </aside>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
    </>
  );
}

/** Nút ☰ mở menu trên màn hình nhỏ (tự ẩn từ breakpoint md). */
export function SidebarMobileTrigger({
  onClick,
  expanded = false,
  label,
  className,
}: {
  onClick: () => void;
  expanded?: boolean;
  label?: string;
  className?: string;
}) {
  const l = useMessages(MESSAGES);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? l.openMenu}
      aria-expanded={expanded}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:hidden",
        className,
      )}
    >
      <Menu aria-hidden="true" className="h-5 w-5" />
    </button>
  );
}

/* ---------------- Chân sidebar ---------------- */

/** Nhận thêm mọi prop của <button> (để làm trigger cho DropdownMenu/Popover qua asChild). */
export type SidebarFooterButtonProps = Omit<ComponentProps<"button">, "children"> & {
  icon: ReactNode;
  label: string;
  /** Phần bên phải khi mở rộng, vd chấm màu thương hiệu. */
  trailing?: ReactNode;
};

export function SidebarFooterButton({ icon, label, trailing, className, ...rest }: SidebarFooterButtonProps) {
  const { collapsed } = useSidebar();
  const btn = (
    <button type="button" {...rest} className={cn(itemBase, collapsed && "justify-center px-0", className)}>
      <span aria-hidden="true" className={iconBox}>{icon}</span>
      <span className={cn("min-w-0 flex-1 truncate text-left", collapsed && "sr-only")}>{label}</span>
      {!collapsed && trailing}
    </button>
  );
  return collapsed ? <Tooltip content={label} side="right">{btn}</Tooltip> : btn;
}

export type SidebarUserProps = Omit<ComponentProps<"button">, "children"> & { name: string; role?: string; initials?: string };

export function SidebarUser({ name, role, initials, className, ...rest }: SidebarUserProps) {
  const { collapsed } = useSidebar();
  const ini =
    initials ??
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((w) => w[0]!.toUpperCase())
      .join("");
  const btn = (
    <button
      type="button"
      {...rest}
      aria-label={collapsed ? `${name}${role ? `, ${role}` : ""}` : undefined}
      className={cn(itemBase, "py-1.5", collapsed && "justify-center px-0", className)}
    >
      <span aria-hidden="true" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-fg">
        {ini}
      </span>
      {!collapsed && (
        <>
          <span className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-sm font-medium text-fg">{name}</span>
            {role && <span className="truncate text-xs text-fg-subtle">{role}</span>}
          </span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 text-fg-subtle" />
        </>
      )}
    </button>
  );
  return collapsed ? <Tooltip content={name} side="right">{btn}</Tooltip> : btn;
}

/** Chấm màu thương hiệu hiện tại (đọc từ token, tự đổi theo cấu hình). */
export function BrandDot() {
  return <span aria-hidden="true" className="h-3 w-3 rounded-full bg-primary" />;
}
