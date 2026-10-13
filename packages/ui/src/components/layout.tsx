import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";

/* ---------------- Card ---------------- */

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-lg border border-border bg-surface text-fg shadow-sm", className)} {...props} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}
export function CardTitle({ className, as: Tag = "h2", ...props }: ComponentProps<"h2"> & { as?: "h2" | "h3" | "h4" }) {
  return <Tag className={cn("text-base font-semibold text-fg", className)} {...props} />;
}
export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-sm text-fg-muted", className)} {...props} />;
}
export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("px-5 pb-5", className)} {...props} />;
}
export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center justify-end gap-2 border-t border-border px-5 py-3", className)} {...props} />;
}

/* ---------------- Grid ---------------- */
// Class phải là chuỗi tĩnh để Tailwind quét được – không ghép chuỗi động.

type Cols = 1 | 2 | 3 | 4 | 6 | 12;
const COLS: Record<"base" | "sm" | "md" | "lg" | "xl", Record<Cols, string>> = {
  base: { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4", 6: "grid-cols-6", 12: "grid-cols-12" },
  sm: { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 6: "sm:grid-cols-6", 12: "sm:grid-cols-12" },
  md: { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 6: "md:grid-cols-6", 12: "md:grid-cols-12" },
  lg: { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 6: "lg:grid-cols-6", 12: "lg:grid-cols-12" },
  xl: { 1: "xl:grid-cols-1", 2: "xl:grid-cols-2", 3: "xl:grid-cols-3", 4: "xl:grid-cols-4", 6: "xl:grid-cols-6", 12: "xl:grid-cols-12" },
};
const GAP = { none: "gap-0", xs: "gap-1", sm: "gap-2", md: "gap-4", lg: "gap-6", xl: "gap-8" } as const;
type Gap = keyof typeof GAP;

export type GridProps = ComponentProps<"div"> & {
  /** Số cột; dùng object cho responsive: { base: 1, md: 2, lg: 4 }. */
  cols?: Cols | Partial<Record<keyof typeof COLS, Cols>>;
  gap?: Gap;
  /** Các ô lần lượt trồi lên khi lưới xuất hiện (tắt khi người dùng bật giảm chuyển động). */
  stagger?: boolean;
};

export function Grid({ cols = 1, gap = "md", stagger = false, className, ...props }: GridProps) {
  const map = typeof cols === "number" ? { base: cols } : cols;
  const colClasses = (Object.entries(map) as [keyof typeof COLS, Cols][]).map(([bp, n]) => COLS[bp][n]);
  return <div className={cn("grid", colClasses, GAP[gap], stagger && "stagger-children", className)} {...props} />;
}

/* ---------------- Stack ---------------- */

const ALIGN = { start: "items-start", center: "items-center", end: "items-end", stretch: "items-stretch", baseline: "items-baseline" } as const;
const JUSTIFY = { start: "justify-start", center: "justify-center", end: "justify-end", between: "justify-between" } as const;

export type StackProps = ComponentProps<"div"> & {
  direction?: "row" | "col";
  gap?: Gap;
  align?: keyof typeof ALIGN;
  justify?: keyof typeof JUSTIFY;
  wrap?: boolean;
  /** Các phần tử con lần lượt trồi lên khi khối xuất hiện (tắt khi người dùng bật giảm chuyển động). */
  stagger?: boolean;
};

export function Stack({ direction = "col", gap = "md", align, justify, wrap = false, stagger = false, className, ...props }: StackProps) {
  return (
    <div
      className={cn(
        "flex",
        direction === "row" ? "flex-row" : "flex-col",
        GAP[gap],
        align && ALIGN[align],
        justify && JUSTIFY[justify],
        wrap && "flex-wrap",
        stagger && "stagger-children",
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- PageHeader ---------------- */

export type PageHeaderProps = {
  title: ReactNode;
  /** Ẩn được theo tùy chọn "Mô tả trang" của người dùng (data-page-description). */
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      {/* flex-1 + basis: mô tả dài tự xuống dòng thay vì đẩy nhóm nút xuống hàng dưới. */}
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && (
          <p data-slot="page-description" className="max-w-3xl text-sm leading-relaxed text-fg-muted">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
