import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { createContext, useContext, useEffect, useState, type ComponentProps, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = {
  vi: { close: "Đóng", modal: "Hiển thị dạng cửa sổ", panel: "Hiển thị dạng panel bên phải", resize: "Kéo để đổi độ rộng (nhấp đúp để về mặc định)" },
  en: { close: "Close", modal: "Show as window", panel: "Show as side panel", resize: "Drag to resize (double-click to reset)" },
  zh: { close: "关闭", modal: "以窗口显示", panel: "以右侧面板显示", resize: "拖动调整宽度（双击恢复默认）" },
} satisfies Messages<"close" | "modal" | "panel" | "resize">;

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * modal = cửa sổ giữa màn hình, phủ nền, giữ focus trong dialog.
 * panel = drawer trượt từ phải vào, cao hết màn hình, nằm ĐÈ lên trang (trang không bị đẩy/co lại) và KHÔNG chặn
 * trang phía sau (thao tác song song được, vd bấm ô khác trên bản in khi đang sửa).
 */
export type DialogPresentation = "modal" | "panel";

const PresentationContext = createContext<{ mode: DialogPresentation; setMode: (p: DialogPresentation) => void }>({
  mode: "modal",
  setMode: () => {},
});

export type DialogProps = ComponentProps<typeof DialogPrimitive.Root> & {
  /** Điều khiển từ ngoài (vd lưu lựa chọn của người dùng). Bỏ trống để tự quản lý. */
  presentation?: DialogPresentation;
  defaultPresentation?: DialogPresentation;
  onPresentationChange?: (p: DialogPresentation) => void;
};

/**
 * Gốc dialog. Radix luôn chạy ở chế độ non-modal (modal={false}) vì đổi modal ↔ non-modal làm Radix dựng lại
 * toàn bộ nội dung → mất dữ liệu form đang nhập. Hành vi "chặn trang" của dạng cửa sổ do DialogContent tự làm:
 * lớp phủ, giữ focus (FocusScope), aria-modal, khóa cuộn.
 */
export function Dialog({ presentation, defaultPresentation = "modal", onPresentationChange, children, ...props }: DialogProps) {
  const [inner, setInner] = useState<DialogPresentation>(defaultPresentation);
  const mode = presentation ?? inner;
  const setMode = (p: DialogPresentation) => {
    if (presentation === undefined) setInner(p);
    onPresentationChange?.(p);
  };
  return (
    <PresentationContext.Provider value={{ mode, setMode }}>
      <DialogPrimitive.Root {...props} modal={false}>
        {children}
      </DialogPrimitive.Root>
    </PresentationContext.Provider>
  );
}

const MODAL_SIZE = { sm: "max-w-md", md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" } as const;
const PANEL_SIZE = { sm: "max-w-sm", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

export type DialogContentProps = Omit<ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  /** Bắt buộc – trình đọc màn hình đọc tiêu đề khi mở. */
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  size?: keyof typeof MODAL_SIZE;
  /** Hiện nút chuyển cửa sổ ↔ panel trên header. */
  allowPresentationToggle?: boolean;
  /** Nhãn – đổi khi có đa ngôn ngữ. */
  labels?: { close?: string; modal?: string; panel?: string; resize?: string };
};

const iconBtn =
  "inline-flex h-8 w-8 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus aria-pressed:text-primary";

function WindowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M2 6h12" />
    </svg>
  );
}
function PanelIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <path d="M10 3v10" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

// Đếm số cửa sổ đang mở để nhiều dialog chồng nhau đóng theo thứ tự nào cũng trả lại đúng trạng thái cuộn.
let scrollLocks = 0;
let overflowBeforeLock = "";

/**
 * Lớp phủ + khóa cuộn trang của dạng cửa sổ. Phải nằm TRONG Portal: Portal chỉ dựng con khi dialog đang mở,
 * còn DialogContent thì luôn được render – đặt khóa cuộn ở đó sẽ khóa cả trang ngay khi dialog còn đóng.
 */
// z-50 như nội dung: cửa sổ mở chồng lên drawer (vd xem file từ chi tiết email) thì lớp phủ che cả drawer (đứng trước trong DOM).
// Luôn render (ẩn khi là drawer): Radix Portal gắn MỖI con vào một portal riêng ở cuối body, nên lớp phủ mới mount lúc
// chuyển drawer → cửa sổ sẽ nằm SAU nội dung và phủ mờ chính cửa sổ.
function ModalOverlay({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    if (scrollLocks++ === 0) {
      overflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, [active]);
  return (
    <div
      aria-hidden="true"
      data-slot="dialog-overlay"
      className={cn("fixed inset-0 z-50 bg-overlay backdrop-blur-xs motion-safe:animate-fade-in", !active && "hidden")}
    />
  );
}

/** Drawer hẹp nhất / phần trang chừa lại bên trái tối thiểu khi kéo rộng. */
const DRAWER_MIN_PX = 320;
const DRAWER_EDGE_PX = 48;
const DRAWER_STEP_PX = 32;
const clampDrawer = (w: number) => Math.round(Math.max(DRAWER_MIN_PX, Math.min(w, window.innerWidth - DRAWER_EDGE_PX)));

/**
 * Độ rộng drawer do người dùng kéo; nhớ theo `size` (localStorage `kb-drawer-width:<size>`) để lần mở sau giữ nguyên.
 * null = mặc định theo `size`. Đọc sau khi mount (SSR không có localStorage).
 */
function useDrawerWidth(size: string) {
  const key = `kb-drawer-width:${size}`;
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(key));
      if (v > 0) setWidth(v);
    } catch {
      // Trình duyệt chặn lưu trữ → dùng độ rộng mặc định.
    }
  }, [key]);
  const save = (w: number | null) => {
    setWidth(w);
    try {
      if (w === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, String(w));
    } catch {
      // Không lưu được thì chỉ giữ trong phiên.
    }
  };
  return [width, save] as const;
}

/** Tay nắm ở mép trái drawer: kéo chuột / chạm để đổi độ rộng, phím ← → (Shift = bước lớn), Home/End, nhấp đúp về mặc định. */
function DrawerResizeHandle({ label, width, onChange }: { label: string; width: () => number; onChange: (w: number | null) => void }) {
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture?.(e.pointerId);
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => onChange(clampDrawer(window.innerWidth - ev.clientX));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      document.body.style.userSelect = prevSelect;
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? DRAWER_STEP_PX * 4 : DRAWER_STEP_PX;
    const next =
      e.key === "ArrowLeft" ? width() + step
      : e.key === "ArrowRight" ? width() - step
      : e.key === "Home" ? DRAWER_MIN_PX
      : e.key === "End" ? window.innerWidth
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clampDrawer(next));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={label}
      aria-valuemin={DRAWER_MIN_PX}
      aria-valuenow={Math.round(width())}
      tabIndex={0}
      data-slot="drawer-resize"
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(null)}
      className="group/resize absolute inset-y-0 -left-1.5 z-10 flex w-3 cursor-col-resize touch-none justify-center focus-visible:outline-none max-sm:hidden"
    >
      <span aria-hidden="true" className="h-full w-0.5 bg-transparent transition-colors group-hover/resize:bg-primary group-focus-visible/resize:bg-focus group-active/resize:bg-primary" />
    </div>
  );
}

export function DialogContent({
  title,
  icon,
  description,
  size = "md",
  allowPresentationToggle = true,
  labels,
  className,
  style,
  children,
  ...props
}: DialogContentProps) {
  const { mode, setMode } = useContext(PresentationContext);
  const l = useMessages(MESSAGES, labels);
  // Dạng panel: bấm/rê ra trang phía sau không đóng panel (Escape và nút Đóng vẫn đóng).
  const keepOpen = (e: Event) => {
    if (mode === "panel") e.preventDefault();
  };
  const isModal = mode === "modal";
  const [drawerWidth, setDrawerWidth] = useDrawerWidth(size);
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);

  return (
    <DialogPrimitive.Portal>
      {/* Lớp phủ tự làm (Overlay của Radix chỉ có ở chế độ modal). Bấm vào = bấm ngoài → Radix đóng dialog. */}
      <ModalOverlay active={isModal} />
      <DialogPrimitive.Content
        data-presentation={mode}
        aria-modal={isModal || undefined}
        className={cn(
          "fixed z-50 flex w-full flex-col border-border bg-surface text-fg focus-visible:outline-none",
          mode === "modal"
            ? cn("left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border shadow-lg motion-safe:animate-pop-in", MODAL_SIZE[size])
            : cn("inset-y-0 right-0 border-l shadow-lg motion-safe:animate-slide-in-right", PANEL_SIZE[size]),
          className,
        )}
        style={!isModal && drawerWidth !== null ? { ...style, width: drawerWidth, maxWidth: `calc(100vw - ${DRAWER_EDGE_PX}px)` } : style}
        {...(description ? {} : { "aria-describedby": undefined })}
        onInteractOutside={keepOpen}
        {...props}
      >
        {!isModal && (
          <DrawerResizeHandle label={l.resize} width={() => drawerWidth ?? contentEl?.offsetWidth ?? DRAWER_MIN_PX} onChange={setDrawerWidth} />
        )}
        <FocusScope asChild trapped={isModal} loop>
        <div ref={setContentEl} className="flex min-h-0 flex-1 flex-col">
        {/* div, không phải <header>: hai dialog chồng nhau (panel chi tiết + cửa sổ con) sẽ thành hai landmark banner. */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          {icon && <span aria-hidden="true" className="text-fg-muted">{icon}</span>}
          <div className="flex min-w-0 flex-1 flex-col">
            <DialogPrimitive.Title className="truncate text-base font-semibold">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="text-sm text-fg-muted">{description}</DialogPrimitive.Description>}
          </div>
          {allowPresentationToggle && (
            <div className="flex items-center gap-0.5">
              <button type="button" className={iconBtn} aria-label={l.modal} aria-pressed={mode === "modal"} onClick={() => setMode("modal")}>
                <WindowIcon />
              </button>
              <button type="button" className={iconBtn} aria-label={l.panel} aria-pressed={mode === "panel"} onClick={() => setMode("panel")}>
                <PanelIcon />
              </button>
            </div>
          )}
          <DialogPrimitive.Close aria-label={l.close} className={iconBtn}>
            <CloseIcon />
          </DialogPrimitive.Close>
        </div>
        {/*
          Nội dung thường bọc trong <form>: cho form cũng là cột giãn hết chiều cao để DialogFooter (mt-auto) nằm sát đáy.
          Thiếu dòng này thì ở dạng drawer bên phải nhóm nút lơ lửng giữa panel, bên dưới thừa một khoảng trắng.
        */}
        <div className="@container flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 [&>form]:flex [&>form]:flex-1 [&>form]:flex-col [&>form]:gap-4">{children}</div>
        </div>
        </FocusScope>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

/** Đặt cuối nội dung dialog; luôn nằm dưới cùng, không cuộn theo nội dung. */
export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  // -bottom-4 = bù phần đệm dưới (py-4) của thân popup: dính sát đáy, nội dung cuộn không lộ ra bên dưới thanh nút.
  return <div className={cn("sticky -bottom-4 -mx-5 -mb-4 mt-auto flex justify-end gap-2 border-t border-border bg-surface px-5 py-3", className)} {...props} />;
}
