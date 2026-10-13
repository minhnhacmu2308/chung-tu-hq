import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { CountUp } from "./count-up.js";
import { Skeleton, type Tone } from "./feedback.js";
import { Card } from "./layout.js";

const CHIP: Record<Tone, string> = {
  neutral: "bg-neutral-subtle text-neutral-subtle-fg",
  primary: "bg-primary-subtle text-primary-subtle-fg",
  success: "bg-success-subtle text-success-subtle-fg",
  warning: "bg-warning-subtle text-warning-subtle-fg",
  danger: "bg-danger-subtle text-danger-subtle-fg",
  info: "bg-info-subtle text-info-subtle-fg",
};

export type StatCardProps = {
  label: string;
  /** Số đếm nguyên (`number`) sẽ chạy đếm lên; chuỗi đã định dạng (tiền, %, "11/12") hiển thị nguyên văn. */
  value: number | string;
  /** Dòng phụ dưới con số. */
  hint?: ReactNode;
  /** Tô dòng phụ để báo cần chú ý (vd "1 hồ sơ đã quá hạn"). Luôn kèm chữ – không truyền nghĩa chỉ bằng màu. */
  hintTone?: "default" | "danger";
  icon?: ReactNode;
  /** Màu ô icon. */
  tone?: Tone;
  loading?: boolean;
  className?: string;
};

/** Thẻ chỉ số (KPI) dùng thống nhất ở mọi màn tổng quan: nhãn, con số lớn, dòng phụ, icon trong ô màu dịu. */
export function StatCard({ label, value, hint, hintTone = "default", icon, tone = "primary", loading = false, className }: StatCardProps) {
  return (
    <Card aria-label={label} className={cn("flex items-start justify-between gap-3 p-5", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm text-fg-muted">{label}</p>
        {loading ? (
          <Skeleton className="my-1 h-8 w-16" />
        ) : (
          <p className="text-3xl font-semibold leading-tight tracking-tight text-fg">{typeof value === "number" ? <CountUp value={value} /> : value}</p>
        )}
        {hint && <p className={cn("text-xs", hintTone === "danger" ? "text-danger-subtle-fg" : "text-fg-subtle")}>{hint}</p>}
      </div>
      {icon && (
        <span aria-hidden="true" className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md [&>svg]:h-5 [&>svg]:w-5", CHIP[tone])}>
          {icon}
        </span>
      )}
    </Card>
  );
}
