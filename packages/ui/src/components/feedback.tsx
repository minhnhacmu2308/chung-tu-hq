import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useUiLocale } from "../lib/i18n.js";

/* ---------------- Badge ---------------- */

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: { neutral: "", primary: "", success: "", warning: "", danger: "", info: "" },
    variant: { subtle: "", solid: "", outline: "border bg-transparent" },
  },
  compoundVariants: [
    { variant: "subtle", tone: "neutral", class: "bg-neutral-subtle text-neutral-subtle-fg" },
    { variant: "subtle", tone: "primary", class: "bg-primary-subtle text-primary-subtle-fg" },
    { variant: "subtle", tone: "success", class: "bg-success-subtle text-success-subtle-fg" },
    { variant: "subtle", tone: "warning", class: "bg-warning-subtle text-warning-subtle-fg" },
    { variant: "subtle", tone: "danger", class: "bg-danger-subtle text-danger-subtle-fg" },
    { variant: "subtle", tone: "info", class: "bg-info-subtle text-info-subtle-fg" },
    { variant: "solid", tone: "neutral", class: "bg-neutral text-neutral-fg" },
    { variant: "solid", tone: "primary", class: "bg-primary text-primary-fg" },
    { variant: "solid", tone: "success", class: "bg-success text-success-fg" },
    { variant: "solid", tone: "warning", class: "bg-warning text-warning-fg" },
    { variant: "solid", tone: "danger", class: "bg-danger text-danger-fg" },
    { variant: "solid", tone: "info", class: "bg-info text-info-fg" },
    { variant: "outline", tone: "neutral", class: "border-border-strong text-fg-muted" },
    { variant: "outline", tone: "primary", class: "border-primary text-primary" },
    { variant: "outline", tone: "success", class: "border-success text-success-subtle-fg" },
    { variant: "outline", tone: "warning", class: "border-warning text-warning-subtle-fg" },
    { variant: "outline", tone: "danger", class: "border-danger text-danger-subtle-fg" },
    { variant: "outline", tone: "info", class: "border-info text-info-subtle-fg" },
  ],
  defaultVariants: { tone: "neutral", variant: "subtle" },
});

export type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, variant }), className)} {...props} />;
}

/* ---------------- StatusBadge ---------------- */
// Trạng thái nghiệp vụ dùng thống nhất toàn hệ thống. Luôn có chữ – không truyền nghĩa chỉ bằng màu.

export const STATUS_META = {
  // Kết quả luật đối chiếu
  PASS: { tone: "success", label: "Khớp" },
  WARN: { tone: "warning", label: "Lưu ý" },
  FAIL: { tone: "danger", label: "Lỗi" },
  SKIPPED: { tone: "neutral", label: "Bỏ qua" },
  // Trạng thái trường dữ liệu (ADR 0003)
  CROSS_CHECKED: { tone: "success", label: "Đã đối chiếu" },
  SINGLE_SOURCE: { tone: "neutral", label: "Một nguồn" },
  CONFLICT: { tone: "danger", label: "Mâu thuẫn" },
  INVALID_FORMAT: { tone: "danger", label: "Sai định dạng" },
  MODEL_UNSURE: { tone: "warning", label: "Cần kiểm tra" },
  USER_CONFIRMED: { tone: "info", label: "Đã xác nhận" },
  // Trạng thái duyệt hồ sơ
  AUTO_APPROVED: { tone: "success", label: "Tự duyệt được" },
  NEEDS_REVIEW: { tone: "warning", label: "Cần người duyệt" },
  // Phân luồng Hải quan
  GREEN_CHANNEL: { tone: "success", label: "Luồng xanh" },
  YELLOW_CHANNEL: { tone: "warning", label: "Luồng vàng" },
  RED_CHANNEL: { tone: "danger", label: "Luồng đỏ" },
} as const satisfies Record<string, { tone: Tone; label: string }>;

export type Status = keyof typeof STATUS_META;

/** Nhãn tiếng Anh tương ứng STATUS_META (nhãn tiếng Việt nằm trong STATUS_META). */
export const STATUS_LABELS_EN: Record<Status, string> = {
  PASS: "Match", WARN: "Note", FAIL: "Error", SKIPPED: "Skipped",
  CROSS_CHECKED: "Cross-checked", SINGLE_SOURCE: "Single source", CONFLICT: "Conflict", INVALID_FORMAT: "Invalid format",
  MODEL_UNSURE: "Needs check", USER_CONFIRMED: "Confirmed",
  AUTO_APPROVED: "Auto-approved", NEEDS_REVIEW: "Needs review",
  GREEN_CHANNEL: "Green channel", YELLOW_CHANNEL: "Yellow channel", RED_CHANNEL: "Red channel",
};

export type StatusBadgeProps = { status: Status; label?: string; className?: string };

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const meta = STATUS_META[status];
  const locale = useUiLocale();
  return (
    <Badge tone={meta.tone} className={className} data-status={status}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? (locale === "en" ? STATUS_LABELS_EN[status] : meta.label)}
    </Badge>
  );
}

/* ---------------- Alert ---------------- */

const ALERT_TONE: Record<Exclude<Tone, "primary">, string> = {
  neutral: "bg-neutral-subtle text-neutral-subtle-fg border-border",
  success: "bg-success-subtle text-success-subtle-fg border-success",
  warning: "bg-warning-subtle text-warning-subtle-fg border-warning",
  danger: "bg-danger-subtle text-danger-subtle-fg border-danger",
  info: "bg-info-subtle text-info-subtle-fg border-info",
};

export type AlertProps = {
  tone?: Exclude<Tone, "primary">;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
};

/** danger/warning dùng role="alert" (đọc ngay); còn lại role="status". */
export function Alert({ tone = "info", title, children, action, className }: AlertProps) {
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-md border px-4 py-3 text-sm", ALERT_TONE[tone], className)}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-surface-muted", className)} {...props} />;
}

/* ---------------- EmptyState ---------------- */

export type EmptyStateProps = {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Hành động tiếp theo – bắt buộc nghĩ tới: người dùng nên làm gì khi trống. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      {icon && <div className="text-fg-subtle" aria-hidden="true">{icon}</div>}
      <p className="text-base font-semibold text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
