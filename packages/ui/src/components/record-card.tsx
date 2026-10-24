// Thẻ một bản ghi (hồ sơ, email, mặt hàng…) cho danh sách dạng thẻ: đầu thẻ (chọn · biểu tượng · tiêu đề · trạng thái ·
// thao tác), lưới trường "nhãn: giá trị", chân thẻ. Dùng với DataTable `renderCard` (bảng tự truyền ô chọn + thao tác)
// hoặc đứng riêng. Chỉ trình bày – bấm / chọn / bàn phím do nơi chứa quyết định.
// Có `tone` → đầu thẻ nền dịu theo tông + họa tiết mờ dần + `art` (icon lớn chìm) – chỉ trang trí (aria-hidden).
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import type { Tone } from "./feedback.js";

export type RecordCardField = {
  label: ReactNode;
  value: ReactNode;
  /** Chiếm cả hàng (giá trị dài: tên đối tác, mô tả). */
  wide?: boolean;
};

export type RecordCardPattern = "dots" | "grid" | "diagonal";

export type RecordCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Biểu tượng / huy hiệu trước tiêu đề (vd `IconTile`, `Badge` NK/XK). */
  leading?: ReactNode;
  /** Trạng thái cạnh tiêu đề (vd `StatusBadge`). */
  status?: ReactNode;
  fields?: readonly RecordCardField[];
  /** Phần thêm dưới lưới trường (vd tiến độ, danh sách file). */
  children?: ReactNode;
  footer?: ReactNode;
  /** Ô chọn (DataTable truyền vào khi bảng `selectable`). */
  select?: ReactNode;
  /** Thao tác (vd `RowActions`). */
  actions?: ReactNode;
  /** Tông màu đầu thẻ (nền dịu + họa tiết). Bỏ trống → đầu thẻ trơn. */
  tone?: Tone;
  /** Họa tiết nền đầu thẻ (khi có `tone`). */
  pattern?: RecordCardPattern;
  /** Hình trang trí lớn, mờ ở góc phải đầu thẻ (vd icon lucide phương thức vận chuyển). */
  art?: ReactNode;
  className?: string;
};

const HEAD_TONE: Record<Tone, string> = {
  neutral: "bg-neutral-subtle text-neutral-subtle-fg",
  primary: "bg-primary-subtle text-primary-subtle-fg",
  success: "bg-success-subtle text-success-subtle-fg",
  warning: "bg-warning-subtle text-warning-subtle-fg",
  danger: "bg-danger-subtle text-danger-subtle-fg",
  info: "bg-info-subtle text-info-subtle-fg",
};

/** Họa tiết lặp (vẽ bằng currentColor → theo màu tông, tự đổi sáng / tối). */
function Pattern({ kind }: { kind: RecordCardPattern }) {
  const id = useId();
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full opacity-25 [mask-image:linear-gradient(to_left,black,transparent_75%)]">
      <defs>
        <pattern id={id} width="14" height="14" patternUnits="userSpaceOnUse">
          {kind === "dots" && <circle cx="2" cy="2" r="1.4" fill="currentColor" />}
          {kind === "grid" && <path d="M14 0H0V14" fill="none" stroke="currentColor" strokeWidth="1" />}
          {kind === "diagonal" && <path d="M-2 16L16 -2M5 19L19 5" fill="none" stroke="currentColor" strokeWidth="1.2" />}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function RecordCard({
  title, subtitle, leading, status, fields, children, footer, select, actions, tone, pattern = "dots", art, className,
}: RecordCardProps) {
  const head = (
    <div className="relative z-10 flex min-w-0 items-start gap-3">
      {select && <div className="flex shrink-0 items-center pt-0.5">{select}</div>}
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Trạng thái nằm cùng dòng tiêu đề, tự xuống hàng khi hẹp – không chiếm cột riêng làm tiêu đề bị bóp. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <div className="min-w-0 break-words text-sm font-semibold text-fg">{title}</div>
          {status}
        </div>
        {subtitle && <div className="min-w-0 break-words text-sm text-fg-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-start">{actions}</div>}
    </div>
  );
  return (
    <div
      data-slot="record-card"
      className={cn(
        "flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 text-fg shadow-sm",
        // Nơi chứa là DataTable: rê chuột / đang chọn đổi viền theo phần tử bao (group).
        "group-hover:border-border-strong group-hover:shadow-md group-data-[selected]:border-primary group-data-[selected]:ring-1 group-data-[selected]:ring-primary",
        className,
      )}
    >
      {tone ? (
        <div data-slot="record-card-head" className={cn("relative -mx-4 -mt-4 border-b border-border px-4 pt-4 pb-3", HEAD_TONE[tone])}>
          <Pattern kind={pattern} />
          {art && (
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-3 right-10 opacity-20 [&>svg]:h-16 [&>svg]:w-16">
              {art}
            </span>
          )}
          {head}
        </div>
      ) : (
        head
      )}
      {fields && fields.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
          {fields.map((f, i) => (
            <div key={i} className={cn("flex min-w-0 flex-col gap-0.5", f.wide && "col-span-2")}>
              <dt className="text-xs text-fg-muted">{f.label}</dt>
              <dd className="min-w-0 break-words text-sm text-fg">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
      {footer && <div className="mt-auto border-t border-border pt-3 text-xs text-fg-muted">{footer}</div>}
    </div>
  );
}
