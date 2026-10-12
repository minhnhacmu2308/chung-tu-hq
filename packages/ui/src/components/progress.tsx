import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cva, type VariantProps } from "class-variance-authority";
import { useId, type ReactNode } from "react";
import { intlLocale, useMessages, useUiLocale, type Messages } from "../lib/i18n.js";
import { cn } from "../lib/cn.js";

const MESSAGES = {
  vi: { loading: "Đang xử lý" },
  en: { loading: "In progress" },
} satisfies Messages<"loading">;

const trackVariants = cva("relative w-full overflow-hidden rounded-full bg-surface-muted", {
  variants: { size: { sm: "h-1.5", md: "h-2", lg: "h-3" } },
  defaultVariants: { size: "md" },
});

const barVariants = cva("h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none", {
  variants: {
    tone: { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" },
  },
  defaultVariants: { tone: "primary" },
});

export type ProgressProps = VariantProps<typeof trackVariants> &
  VariantProps<typeof barVariants> & {
    /** null = không xác định (đang chạy, chưa biết tiến độ). */
    value: number | null;
    max?: number;
    /** Nhãn hiển thị phía trên thanh. Không có nhãn → dùng aria-label. */
    label?: ReactNode;
    /** Hiện "45%" bên phải nhãn. */
    showValue?: boolean;
    "aria-label"?: string;
    labels?: Partial<Record<"loading", string>>;
    className?: string;
  };

export function Progress({
  value,
  max = 100,
  tone,
  size,
  label,
  showValue = false,
  "aria-label": ariaLabel,
  labels,
  className,
}: ProgressProps) {
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  const labelId = useId();
  const indeterminate = value === null;
  const clamped = indeterminate ? 0 : Math.min(max, Math.max(0, value));
  const ratio = max > 0 ? clamped / max : 0;
  const percent = new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(ratio);

  return (
    <div className={cn("flex w-full flex-col gap-1.5", className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {label && <span id={labelId} className="text-fg">{label}</span>}
          {showValue && (
            <span className="text-fg-muted tabular-nums" aria-hidden="true">
              {indeterminate ? t.loading : percent}
            </span>
          )}
        </div>
      )}
      <ProgressPrimitive.Root
        value={indeterminate ? null : clamped}
        max={max}
        getValueLabel={(v, m) => (m > 0 ? new Intl.NumberFormat(intlLocale(locale), { style: "percent", maximumFractionDigits: 0 }).format(v / m) : "")}
        aria-labelledby={label ? labelId : undefined}
        aria-label={label ? undefined : (ariaLabel ?? t.loading)}
        className={trackVariants({ size })}
      >
        <ProgressPrimitive.Indicator
          className={cn(barVariants({ tone }), indeterminate && "w-1/3 animate-pulse motion-reduce:animate-none")}
          style={indeterminate ? undefined : { width: `${ratio * 100}%` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}
