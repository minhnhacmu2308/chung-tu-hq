// Disclosure: khối thu gọn/mở rộng có tiêu đề – giấu phần ít dùng (thông tin phụ, lịch sử, từng dòng hàng) để màn gọn.
// Nút tiêu đề là <button aria-expanded aria-controls>; `meta` (số đếm, huy hiệu) nằm trong nút; `actions` (nút phụ của khối) nằm ngoài nút.
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

export type DisclosureProps = {
  title: ReactNode;
  /** Số đếm / huy hiệu cạnh tiêu đề (nằm trong nút mở). */
  meta?: ReactNode;
  /** Nút phụ của khối (vd "Bỏ dòng") – nằm ngoài nút mở, bấm không mở/đóng khối. */
  actions?: ReactNode;
  defaultOpen?: boolean;
  /** Điều khiển từ ngoài – khi có, bấm chỉ gọi onOpenChange. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
};

export function Disclosure({ title, meta, actions, defaultOpen = false, open, onOpenChange, children, className }: DisclosureProps) {
  const [inner, setInner] = useState(defaultOpen);
  const isOpen = open ?? inner;
  const id = useId();
  const toggle = () => {
    if (open === undefined) setInner(!isOpen);
    onOpenChange?.(!isOpen);
  };
  return (
    <section className={cn("min-w-0 rounded-md border border-border bg-surface", className)}>
      <div className="flex min-w-0 items-center gap-2 pr-2">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={id}
          onClick={toggle}
          // Màn hẹp: meta xuống dòng dưới tiêu đề thay vì ép tiêu đề thành cột chữ hẹp.
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-3 py-2.5 text-left text-sm font-medium text-fg hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <ChevronDown aria-hidden="true" className={cn("h-4 w-4 shrink-0 text-fg-subtle", isOpen ? "rotate-0" : "-rotate-90")} />
          <span className="min-w-0 flex-1 basis-40">{title}</span>
          {meta && <span className="flex min-w-0 flex-wrap items-center gap-1 text-xs font-normal text-fg-muted">{meta}</span>}
        </button>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
      <div id={id} hidden={!isOpen} className="border-t border-border px-3 py-3">
        {children}
      </div>
    </section>
  );
}
