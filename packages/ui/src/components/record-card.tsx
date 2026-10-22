// Thẻ một bản ghi (hồ sơ, email, mặt hàng…) cho danh sách dạng thẻ: đầu thẻ (chọn · biểu tượng · tiêu đề · trạng thái ·
// thao tác), lưới trường "nhãn: giá trị", chân thẻ. Dùng với DataTable `renderCard` (bảng tự truyền ô chọn + thao tác)
// hoặc đứng riêng. Chỉ trình bày – bấm / chọn / bàn phím do nơi chứa quyết định.
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type RecordCardField = {
  label: ReactNode;
  value: ReactNode;
  /** Chiếm cả hàng (giá trị dài: tên đối tác, mô tả). */
  wide?: boolean;
};

export type RecordCardProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Biểu tượng / huy hiệu trước tiêu đề (vd `IconTile`, `Badge` NK/XK). */
  leading?: ReactNode;
  /** Trạng thái ở góc phải đầu thẻ (vd `StatusBadge`). */
  status?: ReactNode;
  fields?: readonly RecordCardField[];
  /** Phần thêm dưới lưới trường (vd tiến độ, danh sách file). */
  children?: ReactNode;
  footer?: ReactNode;
  /** Ô chọn (DataTable truyền vào khi bảng `selectable`). */
  select?: ReactNode;
  /** Thao tác (vd `RowActions`). */
  actions?: ReactNode;
  className?: string;
};

export function RecordCard({ title, subtitle, leading, status, fields, children, footer, select, actions, className }: RecordCardProps) {
  return (
    <div
      data-slot="record-card"
      className={cn(
        "flex h-full min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 text-fg shadow-sm",
        // Nơi chứa là DataTable: rê chuột / đang chọn đổi viền theo phần tử bao (group).
        "group-hover:border-border-strong group-data-[selected]:border-primary group-data-[selected]:bg-primary-subtle",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
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
      {fields && fields.length > 0 && (
        // Thẻ nằm ngang (hình chữ nhật): đủ chỗ thì các trường xếp một hàng 4 cột, hẹp (mobile) thì 2 cột.
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 cq-sm:grid-cols-4">
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
