import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Spinner } from "./spinner.js";

export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "rounded-md border border-transparent transition-[color,background-color,border-color,box-shadow,scale] duration-(--kb-duration-press) ease-out",
    // Phản hồi khi nhấn: nút lún nhẹ.
    "motion-safe:active:scale-[0.98]",
    // Vòng focus bằng outline + khe trong suốt: không lộ dải màu nền trang khi nút nằm trên thẻ / popup.
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover hover:shadow-md active:bg-primary-active active:shadow-sm",
        secondary: "bg-surface text-fg border-border shadow-sm hover:bg-surface-muted hover:border-border-strong",
        ghost: "bg-transparent text-fg hover:bg-surface-muted",
        danger: "bg-danger text-danger-fg shadow-sm hover:bg-danger-hover hover:shadow-md active:bg-danger-active active:shadow-sm",
        /** Nút xóa / gỡ đứng cạnh nút chính (chân form, thanh công cụ): viền + chữ đỏ, nhìn là biết nguy hiểm mà không lấn nút chính. Đỏ đặc (`danger`) dành cho bước xác nhận cuối. */
        "danger-outline": "bg-surface text-danger-subtle-fg border-danger/50 shadow-sm hover:bg-danger-subtle hover:border-danger active:bg-danger-subtle",
        /** Nút xóa nhỏ trong dòng / nút biểu tượng (thùng rác cạnh từng mục): chữ/icon đỏ, nền đỏ nhạt khi rê. */
        "danger-ghost": "bg-transparent text-danger-subtle-fg hover:bg-danger-subtle",
        link: "bg-transparent text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        // Nút nhỏ / nút biểu tượng: vùng chạm ≥ 44px trên màn cảm ứng (hit-area), kích thước nhìn thấy giữ nguyên.
        sm: "h-8 px-3 text-sm hit-area",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0 hit-area",
        /** Nút biểu tượng nhỏ (24px) – trên đường viền khung (FieldFrame legendAction), cạnh nhãn. */
        "icon-sm": "h-6 w-6 p-0 hit-area",
      },
      fullWidth: { true: "w-full" },
      /** Nhãn dài (vd nút trong Alert trên mobile): cho xuống dòng, cao theo nội dung thay vì tràn khung; cao tối thiểu theo size.
       * Dùng với size sm/md/lg (nút chữ) – nút biểu tượng không có nhãn để xuống dòng. Đặt sau size để thắng h-*. */
      wrap: { true: "h-auto whitespace-normal py-1.5 text-left" },
    },
    compoundVariants: [
      { wrap: true, size: "sm", className: "min-h-8" },
      { wrap: true, size: "md", className: "min-h-10" },
      { wrap: true, size: "lg", className: "min-h-12" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Render phần tử con (vd <Link>) với style của Button. */
    asChild?: boolean;
    /** Đang xử lý: khóa nút, hiện spinner, đặt aria-busy. */
    loading?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
  };

export function Button({
  className,
  variant,
  size,
  fullWidth,
  wrap,
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth, wrap }), className);
  // Tùy chọn "Kính mờ" (data-surface="glass"): nút chính/phụ thành kính – CSS trong tokens.css đọc thuộc tính này.
  const glass = variant === "secondary" || variant === "primary" || variant == null ? { "data-glass-button": variant ?? "primary" } : {};
  if (asChild) {
    return (
      <Slot {...glass} className={classes} aria-disabled={disabled || loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      {...glass}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && leftIcon ? <Spinner size="sm" label={null} /> : leftIcon}
      {/* Không có icon trái: spinner nằm giữa, chữ mờ đi tại chỗ – nút không đổi bề rộng (nhóm nút không xô lệch); chữ vẫn là tên của nút. */}
      {loading && !leftIcon ? (
        <>
          <span className="opacity-0">{children}</span>
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner size="sm" label={null} />
          </span>
        </>
      ) : (
        children
      )}
      {!loading && rightIcon}
    </button>
  );
}
