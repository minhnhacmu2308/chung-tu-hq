import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { Spinner } from "./spinner.js";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none",
    "rounded-md border border-transparent transition-[color,background-color,border-color,box-shadow,scale] duration-150",
    // Phản hồi khi nhấn: nút lún nhẹ.
    "motion-safe:active:scale-[0.98]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg shadow-sm hover:bg-primary-hover hover:shadow-md active:bg-primary-active active:shadow-sm",
        secondary: "bg-surface text-fg border-border shadow-sm hover:bg-surface-muted hover:border-border-strong",
        ghost: "bg-transparent text-fg hover:bg-surface-muted",
        danger: "bg-danger text-danger-fg shadow-sm hover:opacity-90 hover:shadow-md active:shadow-sm",
        link: "bg-transparent text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
      },
      fullWidth: { true: "w-full" },
    },
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
  asChild = false,
  loading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, fullWidth }), className);
  if (asChild) {
    return (
      <Slot className={classes} aria-disabled={disabled || loading || undefined} {...props}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size="sm" label={null} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
