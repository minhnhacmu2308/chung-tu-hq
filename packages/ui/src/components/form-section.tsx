import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type FormSectionProps = {
  title: ReactNode;
  /** Giải thích ngắn nhóm trường này dùng để làm gì. */
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * Một nhóm trường của form dài. Màn rộng: tiêu đề + mô tả ở cột trái, các ô nhập ở cột phải (dễ quét mắt);
 * màn hẹp: xếp dọc. Đặt nhiều FormSection liên tiếp – tự có đường kẻ ngăn giữa các nhóm.
 */
export function FormSection({ title, description, children, className }: FormSectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn("grid gap-4 border-b border-border py-6 first:pt-0 last:border-b-0 last:pb-0 cq-lg:grid-cols-3 cq-lg:gap-8", className)}
    >
      <div className="flex flex-col gap-1">
        <h3 id={id} className="text-sm font-semibold text-fg">{title}</h3>
        {description && <p className="text-sm leading-relaxed text-fg-muted">{description}</p>}
      </div>
      <div className="flex min-w-0 flex-col gap-4 cq-lg:col-span-2">{children}</div>
    </section>
  );
}
