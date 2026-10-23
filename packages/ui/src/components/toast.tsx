// Thông báo nổi. Gọi từ bất kỳ đâu: toast({ tone: "success", title: "Đã lưu" }). Đặt <Toaster /> một lần ở layout gốc.
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Spinner } from "./spinner.js";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

/** "loading" = đang xử lý: có vòng xoay, KHÔNG tự đóng – đổi sang kết quả bằng updateToast() / toastPromise(). */
export type ToastTone = "success" | "warning" | "danger" | "info" | "loading";

export type ToastOptions = {
  tone?: ToastTone;
  title: ReactNode;
  description?: ReactNode;
  action?: { label: string; onClick: () => void };
  /** ms; mặc định 5000, danger 8000. */
  duration?: number;
};

type ToastItem = ToastOptions & { id: number; open: boolean; rev?: number };

/* ---------- Store nhỏ, không cần context ở nơi gọi ---------- */
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Tối đa số toast hiện cùng lúc; nhiều hơn thì đóng cái cũ nhất. */
const MAX_VISIBLE = 4;
const sameMessage = (a: ToastOptions, b: ToastOptions) =>
  (a.tone ?? "info") === (b.tone ?? "info") && a.title === b.title && a.description === b.description;

export function toast(options: ToastOptions): number {
  const id = nextId++;
  // Trùng nội dung với toast đang mở (vd bấm Lưu nhiều lần): thay cái cũ, không xếp thêm.
  items = items.filter((t) => !(t.open && sameMessage(t, options)));
  items = [...items, { tone: "info", ...options, id, open: true }];
  const open = items.filter((t) => t.open);
  const overflow = new Set(open.slice(0, Math.max(0, open.length - MAX_VISIBLE)).map((t) => t.id));
  if (overflow.size) items = items.map((t) => (overflow.has(t.id) ? { ...t, open: false } : t));
  emit();
  return id;
}

/** Đổi nội dung một toast đang mở (vd "Đang truyền…" → "Đã truyền"). Bộ đếm tự đóng chạy lại từ đầu. */
export function updateToast(id: number, options: ToastOptions): void {
  items = items.map((t) => (t.id === id ? { ...t, ...options, id, open: true, rev: (t.rev ?? 0) + 1 } : t));
  emit();
}

/**
 * Một toast đi theo cả thao tác dài: hiện "đang xử lý" ngay, tự đổi thành thành công / lỗi khi promise xong.
 * Trả lại chính promise đó để nối tiếp.
 */
export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: ToastOptions; success: ToastOptions | ((value: T) => ToastOptions); error: ToastOptions | ((error: unknown) => ToastOptions) },
): Promise<T> {
  const id = toast({ ...messages.loading, tone: "loading" });
  promise.then(
    (v) => updateToast(id, { tone: "success", ...(typeof messages.success === "function" ? messages.success(v) : messages.success) }),
    (e: unknown) => updateToast(id, { tone: "danger", ...(typeof messages.error === "function" ? messages.error(e) : messages.error) }),
  );
  return promise;
}

export function dismissToast(id?: number): void {
  items = items.map((t) => (id === undefined || t.id === id ? { ...t, open: false } : t));
  emit();
}

function removeToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const snapshot = () => items;

export function useToast() {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { toasts: list, toast, dismiss: dismissToast };
}

/* ---------- Giao diện ---------- */

const MESSAGES = {
  vi: { close: "Đóng thông báo", region: "Thông báo" },
  en: { close: "Dismiss notification", region: "Notifications" },
  zh: { close: "关闭通知", region: "通知" },
} satisfies Messages<"close" | "region">;

/** Màu theo loại: ô icon nền dịu, vệt màu loang nhẹ bên trái, thanh đếm ngược ở đáy. */
const TONE: Record<ToastTone, { tile: string; wash: string; bar: string; icon: ReactNode }> = {
  success: { tile: "bg-success-subtle text-success-subtle-fg", wash: "from-success-subtle", bar: "bg-success", icon: <CircleCheck /> },
  warning: { tile: "bg-warning-subtle text-warning-subtle-fg", wash: "from-warning-subtle", bar: "bg-warning", icon: <TriangleAlert /> },
  danger: { tile: "bg-danger-subtle text-danger-subtle-fg", wash: "from-danger-subtle", bar: "bg-danger", icon: <CircleAlert /> },
  info: { tile: "bg-info-subtle text-info-subtle-fg", wash: "from-info-subtle", bar: "bg-info", icon: <Info /> },
  loading: { tile: "bg-primary-subtle text-primary-subtle-fg", wash: "from-primary-subtle", bar: "bg-primary", icon: <Spinner size="sm" label={null} /> },
};

export type ToasterProps = { labels?: Partial<Record<"close" | "region", string>> };

function ToastCard({ item, closeLabel }: { item: ToastItem; closeLabel: string }) {
  const tone = item.tone ?? "info";
  const look = TONE[tone];
  const urgent = tone === "danger" || tone === "warning";
  const duration = item.duration ?? (tone === "loading" ? Number.POSITIVE_INFINITY : tone === "danger" ? 8000 : 5000);
  // Radix dừng đếm khi rê chuột / focus vào vùng thông báo – thanh đếm ngược dừng theo.
  const [paused, setPaused] = useState(false);
  return (
    <ToastPrimitive.Root
      open={item.open}
      onOpenChange={(open) => (open ? undefined : dismissToast(item.id))}
      // danger/warning đọc ngay (assertive), còn lại lịch sự (polite)
      type={urgent ? "foreground" : "background"}
      duration={duration}
      onPause={() => setPaused(true)}
      onResume={() => setPaused(false)}
      data-tone={tone}
      // Chỉ tính hiệu ứng đóng của chính toast, không tính thanh đếm ngược bên trong.
      onAnimationEnd={(e) => (e.target === e.currentTarget && !item.open ? removeToast(item.id) : undefined)}
      className={cn(
        "group/toast pointer-events-auto relative isolate flex w-full items-start gap-3 overflow-hidden rounded-xl border border-border bg-surface p-3.5 pr-11 text-fg shadow-lg",
        "motion-safe:data-[state=open]:animate-toast-in motion-safe:data-[state=closed]:animate-toast-out",
        "data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 motion-safe:data-[swipe=cancel]:transition-transform",
      )}
    >
      <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 left-0 -z-10 w-2/3 bg-linear-to-r to-transparent opacity-70", look.wash)} />
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-current/15 [&>svg]:h-4.5 [&>svg]:w-4.5",
          "motion-safe:animate-pop-in",
          look.tile,
        )}
      >
        {look.icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <ToastPrimitive.Title className="text-sm font-semibold leading-5">{item.title}</ToastPrimitive.Title>
        {item.description && <ToastPrimitive.Description className="text-sm leading-5 text-fg-muted">{item.description}</ToastPrimitive.Description>}
        {item.action && (
          <ToastPrimitive.Action
            altText={item.action.label}
            onClick={item.action.onClick}
            className="-ml-2 mt-1 self-start rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {item.action.label}
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label={closeLabel}
        className="absolute right-2 top-2 rounded-md p-1.5 text-fg-subtle hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <X aria-hidden="true" className="h-4 w-4" />
      </ToastPrimitive.Close>
      {/* Đáy: đếm ngược thời gian còn lại; toast "đang xử lý" thì một vạch chạy liên tục. */}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-border/60">
        {Number.isFinite(duration) ? (
          <span
            data-slot="toast-countdown"
            className={cn("block h-full origin-left motion-safe:animate-countdown", look.bar)}
            style={{ animationDuration: `${duration}ms`, animationPlayState: paused ? "paused" : "running" }}
          />
        ) : (
          <span className={cn("block h-full w-2/5 rounded-full motion-safe:animate-indeterminate", look.bar)} />
        )}
      </span>
    </ToastPrimitive.Root>
  );
}

export function Toaster({ labels }: ToasterProps) {
  const t = useMessages(MESSAGES, labels);
  const { toasts } = useToast();
  return (
    <ToastPrimitive.Provider label={t.region} swipeDirection="right">
      {toasts.map((item) => (
        // rev đổi khi updateToast → dựng lại để bộ đếm tự đóng chạy lại
        <ToastCard key={`${item.id}-${item.rev ?? 0}`} item={item} closeLabel={t.close} />
      ))}
      <ToastPrimitive.Viewport // Góc trên phải (dưới thanh menu nếu menu ở trên): không đè lên robot trợ lý và thanh hành động dính đáy.
        className="fixed right-4 top-[calc(var(--kb-shell-top)+1rem)] z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
