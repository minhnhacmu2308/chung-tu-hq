// Thông báo nổi. Gọi từ bất kỳ đâu: toast({ tone: "success", title: "Đã lưu" }). Đặt <Toaster /> một lần ở layout gốc.
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Spinner } from "./spinner.js";
import { useSyncExternalStore, type ReactNode } from "react";
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
} satisfies Messages<"close" | "region">;

const TONE: Record<ToastTone, { cls: string; icon: ReactNode }> = {
  success: { cls: "border-success", icon: <CircleCheck className="h-5 w-5 text-success" /> },
  warning: { cls: "border-warning", icon: <TriangleAlert className="h-5 w-5 text-warning" /> },
  danger: { cls: "border-danger", icon: <CircleAlert className="h-5 w-5 text-danger" /> },
  info: { cls: "border-info", icon: <Info className="h-5 w-5 text-info" /> },
  loading: { cls: "border-border-strong", icon: <Spinner size="sm" label={null} /> },
};

export type ToasterProps = { labels?: Partial<Record<"close" | "region", string>> };

export function Toaster({ labels }: ToasterProps) {
  const t = useMessages(MESSAGES, labels);
  const { toasts } = useToast();
  return (
    <ToastPrimitive.Provider label={t.region} swipeDirection="right">
      {toasts.map((item) => {
        const tone = item.tone ?? "info";
        const urgent = tone === "danger" || tone === "warning";
        return (
          <ToastPrimitive.Root
            // rev đổi khi updateToast → dựng lại để bộ đếm tự đóng chạy lại
            key={`${item.id}-${item.rev ?? 0}`}
            open={item.open}
            onOpenChange={(open) => (open ? undefined : dismissToast(item.id))}
            // danger/warning đọc ngay (assertive), còn lại lịch sự (polite)
            type={urgent ? "foreground" : "background"}
            duration={item.duration ?? (tone === "loading" ? Number.POSITIVE_INFINITY : tone === "danger" ? 8000 : 5000)}
            data-tone={tone}
            onAnimationEnd={() => (!item.open ? removeToast(item.id) : undefined)}
            className={cn(
              "pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-l-4 bg-surface p-4 text-fg shadow-lg",
              "motion-safe:data-[state=open]:animate-slide-up data-[swipe=end]:translate-x-full",
              TONE[tone].cls,
            )}
          >
            <span aria-hidden="true" className="mt-0.5 shrink-0">{TONE[tone].icon}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description && <ToastPrimitive.Description className="text-sm text-fg-muted">{item.description}</ToastPrimitive.Description>}
              {item.action && (
                <ToastPrimitive.Action
                  altText={item.action.label}
                  onClick={item.action.onClick}
                  className="mt-1 self-start rounded-md border border-border px-2.5 py-1 text-sm font-medium text-fg hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {item.action.label}
                </ToastPrimitive.Action>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label={t.close}
              className="shrink-0 rounded-sm p-1 text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport // Góc trên phải (dưới thanh menu nếu menu ở trên): không đè lên robot trợ lý và thanh hành động dính đáy.
        className="fixed right-4 top-[calc(var(--kb-shell-top)+1rem)] z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  );
}
