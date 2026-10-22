import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FocusScope } from "@radix-ui/react-focus-scope";
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = {
  vi: { close: "Đóng", modal: "Hiển thị dạng cửa sổ", panel: "Hiển thị dạng panel bên phải" },
  en: { close: "Close", modal: "Show as window", panel: "Show as side panel" },
  zh: { close: "关闭", modal: "以窗口显示", panel: "以右侧面板显示" },
} satisfies Messages<"close" | "modal" | "panel">;

export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

/**
 * modal = cửa sổ giữa màn hình, phủ nền, giữ focus trong dialog.
 * panel = neo bên phải, KHÔNG chặn trang phía sau (thao tác song song được, như panel trợ lý AI). Màn đủ rộng thì
 * trang chính lùi vào nhường chỗ (không bị panel đè); màn hẹp thì panel nằm đè lên trang.
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
  labels?: { close?: string; modal?: string; panel?: string };
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
function ModalOverlay() {
  useEffect(() => {
    if (scrollLocks++ === 0) {
      overflowBeforeLock = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, []);
  return <div aria-hidden="true" data-slot="dialog-overlay" className="fixed inset-0 z-40 bg-overlay backdrop-blur-xs motion-safe:animate-fade-in" />;
}

/** Khoảng cách panel tới mép phải màn hình (right-2) + khe giữa panel và trang chính. */
const DOCK_GAP_PX = 16;
/** Trang chính còn hẹp hơn mức này thì thôi lùi vào – panel nằm đè như trên điện thoại. */
const DOCK_MIN_MAIN_PX = 640;
const dockedPanels = new Map<HTMLElement, number>();

/** Ghi bề rộng panel vào `--kb-dialog-dock` trên <html>; `body` dùng biến này làm lề phải (styles/index.css). */
function syncDockInset() {
  const width = Math.max(0, ...dockedPanels.values());
  const fits = width > 0 && window.innerWidth - width >= DOCK_MIN_MAIN_PX;
  document.documentElement.style.setProperty("--kb-dialog-dock", fits ? `${width}px` : "0px");
}

/**
 * Đẩy trang chính vào khi panel đang mở. Giống ModalOverlay: nằm trong Portal nên chỉ chạy lúc dialog mở.
 * Đo offsetWidth (không tính transform) để hiệu ứng trượt vào không làm trang giật theo.
 */
function PanelDock({ inner }: { inner: HTMLElement | null }) {
  useEffect(() => {
    const panel = inner?.closest<HTMLElement>("[data-presentation]");
    if (!panel) return;
    const measure = () => {
      dockedPanels.set(panel, panel.offsetWidth + DOCK_GAP_PX);
      syncDockInset();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(panel);
    window.addEventListener("resize", syncDockInset);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncDockInset);
      dockedPanels.delete(panel);
      syncDockInset();
    };
  }, [inner]);
  return null;
}

export function DialogContent({
  title,
  icon,
  description,
  size = "md",
  allowPresentationToggle = true,
  labels,
  className,
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
  const [panelBody, setPanelBody] = useState<HTMLElement | null>(null);

  return (
    <DialogPrimitive.Portal>
      {/* Lớp phủ tự làm (Overlay của Radix chỉ có ở chế độ modal). Bấm vào = bấm ngoài → Radix đóng dialog. */}
      {isModal ? <ModalOverlay /> : <PanelDock inner={panelBody} />}
      <DialogPrimitive.Content
        data-presentation={mode}
        aria-modal={isModal || undefined}
        className={cn(
          "fixed z-50 flex w-full flex-col border border-border bg-surface text-fg shadow-lg focus-visible:outline-none",
          mode === "modal"
            ? cn("left-1/2 top-1/2 max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg motion-safe:animate-pop-in", MODAL_SIZE[size])
            : cn("inset-y-2 right-2 w-[calc(100%-1rem)] rounded-lg motion-safe:animate-slide-in-right", PANEL_SIZE[size]),
          className,
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
        onInteractOutside={keepOpen}
        {...props}
      >
        <FocusScope asChild trapped={isModal} loop>
        <div ref={setPanelBody} className="flex min-h-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-5 py-3">
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
        </header>
        {/*
          Nội dung thường bọc trong <form>: cho form cũng là cột giãn hết chiều cao để DialogFooter (mt-auto) nằm sát đáy.
          Thiếu dòng này thì ở dạng panel bên phải nhóm nút lơ lửng giữa panel, bên dưới thừa một khoảng trắng.
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
