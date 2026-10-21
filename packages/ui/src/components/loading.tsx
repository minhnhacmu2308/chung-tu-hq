// Bộ trạng thái tải dùng chung: biểu tượng tải mang thương hiệu, khối "đang tải", lớp phủ khi tải lại,
// ba chấm "AI đang trả lời", và các khung tải dựng sẵn theo dáng nội dung (chữ, thẻ, bảng, form, danh sách, cả trang).
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { BrandMark } from "./brand-mark.js";
import { Skeleton } from "./feedback.js";
import { Card } from "./layout.js";

const MESSAGES = { vi: { loading: "Đang tải" }, en: { loading: "Loading" }, zh: { loading: "加载中" } } satisfies Messages<"loading">;

/* ---------------- Loader: logo trong vòng xoay ---------------- */

const LOADER = {
  sm: { box: "h-8 w-8", mark: "h-4 w-4", ring: "border-2" },
  md: { box: "h-12 w-12", mark: "h-6 w-6", ring: "border-2" },
  lg: { box: "h-16 w-16", mark: "h-8 w-8", ring: "border-[3px]" },
} as const;

export type LoaderProps = {
  size?: keyof typeof LOADER;
  /** Chữ cho trình đọc màn hình. `null` khi đã nằm trong vùng có trạng thái (vd LoadingState). */
  label?: string | null;
  className?: string;
};

/** Biểu tượng tải mang thương hiệu: logo đứng yên, vòng xoay quanh. Dùng cho tải cả màn / cả khối; chỗ nhỏ (nút, dòng) dùng Spinner. */
export function Loader({ size = "md", label, className }: LoaderProps) {
  const t = useMessages(MESSAGES);
  const s = LOADER[size];
  return (
    <span {...(label === null ? { "aria-hidden": true } : { role: "status" })} className={cn("relative inline-flex shrink-0 items-center justify-center text-primary", s.box, className)}>
      <span aria-hidden="true" className={cn("absolute inset-0 rounded-full border-primary-subtle", s.ring)} />
      <span aria-hidden="true" className={cn("absolute inset-0 animate-spin rounded-full border-transparent border-t-current motion-reduce:animate-none", s.ring)} />
      <BrandMark decorative small={size === "sm"} className={s.mark} />
      {label !== null && <span className="sr-only">{label ?? t.loading}</span>}
    </span>
  );
}

/* ---------------- LoadingDots: ba chấm nhún ---------------- */

const DOT_DELAY = ["[animation-delay:0ms]", "[animation-delay:150ms]", "[animation-delay:300ms]"] as const;

/** Ba chấm nhún – "đang soạn câu trả lời / AI đang xử lý". */
export function LoadingDots({ label, className }: { label?: string | null; className?: string }) {
  const t = useMessages(MESSAGES);
  return (
    <span {...(label === null ? { "aria-hidden": true } : { role: "status" })} className={cn("inline-flex items-center gap-1 text-fg-muted", className)}>
      {DOT_DELAY.map((d) => (
        <span key={d} aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-dot", d)} />
      ))}
      {label !== null && <span className="sr-only">{label ?? t.loading}</span>}
    </span>
  );
}

/* ---------------- LoadingState: khối "đang tải" canh giữa ---------------- */

export type LoadingStateProps = {
  /** Mặc định "Đang tải". Nên nói rõ đang làm gì: "Đang đọc chứng từ…". */
  title?: ReactNode;
  description?: ReactNode;
  size?: LoaderProps["size"];
  className?: string;
};

/** Dùng khi chưa biết dáng nội dung sắp hiện (vd chờ AI xử lý). Đã biết dáng → dùng khung tải Skeleton*. */
export function LoadingState({ title, description, size = "lg", className }: LoadingStateProps) {
  const t = useMessages(MESSAGES);
  return (
    <div role="status" className={cn("flex flex-col items-center gap-3 px-6 py-12 text-center", className)}>
      <Loader size={size} label={null} />
      <p className="text-base font-semibold text-fg">{title ?? t.loading}</p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
    </div>
  );
}

/* ---------------- LoadingOverlay: phủ lên nội dung cũ khi tải lại ---------------- */

export type LoadingOverlayProps = {
  loading: boolean;
  label?: string;
  children: ReactNode;
  className?: string;
};

/** Giữ nội dung cũ tại chỗ (không nhảy bố cục), làm mờ và chặn thao tác trong lúc tải lại / đang lưu. */
export function LoadingOverlay({ loading, label, children, className }: LoadingOverlayProps) {
  const t = useMessages(MESSAGES);
  return (
    <div aria-busy={loading || undefined} className={cn("relative", className)}>
      {/* inert: không Tab vào được nội dung đang bị phủ */}
      <div inert={loading} className={cn("transition-opacity duration-200", loading && "opacity-50")}>{children}</div>
      {loading && (
        <div role="status" className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] motion-safe:animate-fade-in">
          <span className="inline-flex items-center gap-3 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-4 text-sm font-medium text-fg shadow-md">
            <Loader size="sm" label={null} />
            {label ?? t.loading}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- Khung tải dựng sẵn ---------------- */
// Tất cả aria-hidden (Skeleton đã ẩn); nơi dùng tự đặt aria-busy / role="status" cho vùng chứa nếu cần.

const LINE_W = ["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"] as const;

/** Vài dòng chữ. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-1/2" : LINE_W[i % LINE_W.length])} />
      ))}
    </div>
  );
}

/** Hàng thẻ chỉ số (StatCard). */
export function SkeletonStats({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("grid grid-cols-2 gap-4 cq-xl:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="flex items-start justify-between gap-3 p-5">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-10 w-10" />
        </Card>
      ))}
    </div>
  );
}

/** Một thẻ nội dung: tiêu đề + mô tả + vài dòng. */
export function SkeletonCard({ lines = 4, className }: { lines?: number; className?: string }) {
  return (
    <Card aria-hidden="true" className={cn("flex flex-col gap-4 p-5", className)}>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </div>
      <SkeletonText lines={lines} />
    </Card>
  );
}

/** Bảng: hàng tiêu đề + các dòng. */
export function SkeletonTable({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>
      <div className="flex gap-4 border-b border-border bg-surface-muted px-4 py-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1 bg-border" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-28")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Form: các cặp nhãn + ô nhập. */
export function SkeletonForm({ fields = 4, className }: { fields?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-5", className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-10" />
        </div>
      ))}
    </div>
  );
}

/** Danh sách: avatar/icon + hai dòng chữ mỗi mục. */
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border py-3 last:border-b-0">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export type PageLoadingProps = {
  /** Dáng phần thân trang sắp hiện. */
  variant?: "dashboard" | "table" | "form" | "detail";
  label?: string;
  className?: string;
};

/** Khung tải cả trang: tiêu đề + phần thân theo dáng màn hình. Dùng cho loading.tsx của route và lúc tải dữ liệu chính của màn. */
export function PageLoading({ variant = "dashboard", label, className }: PageLoadingProps) {
  const t = useMessages(MESSAGES);
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-6", className)}>
      <span className="sr-only">{label ?? t.loading}</span>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      {variant === "dashboard" && (
        <>
          <SkeletonStats />
          <div className="grid gap-6 cq-lg:grid-cols-3">
            <SkeletonCard lines={6} className="cq-lg:col-span-2" />
            <SkeletonCard lines={3} />
          </div>
        </>
      )}
      {variant === "table" && <SkeletonTable rows={8} />}
      {variant === "form" && (
        <Card aria-hidden="true" className="max-w-3xl p-5">
          <SkeletonForm fields={5} />
        </Card>
      )}
      {variant === "detail" && (
        <>
          <Skeleton aria-hidden="true" className="h-12" />
          <div className="grid gap-6 cq-lg:grid-cols-2">
            <SkeletonCard lines={8} />
            <SkeletonCard lines={8} />
          </div>
        </>
      )}
    </div>
  );
}
