// Giấy tờ khai: khung trang A4 mô phỏng bản in VNACCS (PaperStack > PaperSheet > PaperField).
// Trên màn hình giấy theo giao diện (sáng: trắng, tối: theo nền tối); khi in luôn chữ đen nền trắng và ẩn mọi dấu hiệu trạng thái
// (phần tử có `data-paper-mark`). Quy tắc @media print nằm ở styles/index.css.
import { TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

export type PaperFieldState = "none" | "error" | "missing" | "estimate" | "edited";

const SHEET_MESSAGES = {
  vi: { page: "Trang {n} / {total}" },
  en: { page: "Page {n} / {total}" },
} satisfies Messages<"page">;

const FIELD_MESSAGES = {
  vi: { missing: "Còn thiếu", estimate: "ƯT", edited: "Đã sửa", error: "Có lỗi", compare: "ước tính" },
  en: { missing: "Missing", estimate: "Est.", edited: "Edited", error: "Error", compare: "estimate" },
} satisfies Messages<"missing" | "estimate" | "edited" | "error" | "compare">;

export function PaperStack({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div data-print-root className={cn("flex flex-col items-center gap-6", className)}>
      {children}
    </div>
  );
}

export type PaperSheetProps = {
  page: number;
  total: number;
  header?: ReactNode;
  /** Chữ mờ chéo trang (vd "BẢN NHÁP"); null/bỏ trống = không có. */
  watermark?: string | null;
  id?: string;
  children: ReactNode;
  labels?: Partial<{ page: string }>;
};

export function PaperSheet({ page, total, header, watermark, id, children, labels }: PaperSheetProps) {
  const t = useMessages(SHEET_MESSAGES, labels);
  const name = t.page.replace("{n}", String(page)).replace("{total}", String(total));
  return (
    <section
      id={id}
      role="region"
      aria-label={name}
      data-paper-sheet
      className="@container/paper relative min-h-[297mm] w-full max-w-[210mm] border border-paper-rule bg-paper p-[10mm] text-paper-fg shadow-md print:min-h-0 print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      {header && <div className="mb-3 border-b border-paper-rule pb-2 print:mb-1 print:pb-1">{header}</div>}
      <div className="relative grid grid-cols-12 gap-px">{children}</div>
      {watermark && (
        <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
          <span aria-hidden="true" className="-rotate-[30deg] whitespace-nowrap text-6xl font-bold uppercase tracking-widest text-paper-fg opacity-10">{watermark}</span>
        </div>
      )}
    </section>
  );
}

const SPAN = {
  1: "col-span-1", 2: "col-span-2", 3: "col-span-3", 4: "col-span-4", 6: "col-span-6", 12: "col-span-12",
} as const;

/**
 * Hai vùng nằm cạnh nhau như mẫu in (vận đơn | địa điểm…), chiếm cả bề ngang trang. Đo theo bề rộng TRANG GIẤY (container `paper`),
 * không theo vùng nội dung của ứng dụng: trang hẹp (mobile) → một cột; khi in luôn hai cột.
 */
export function PaperColumns({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("col-span-12 grid min-w-0 grid-cols-1 paper-wide:grid-cols-2 print:grid-cols-2", className)}>{children}</div>;
}

export type PaperFieldProps = {
  /** Chỉ nội dung dòng chữ (phrasing content), không chứa phần tử tương tác (không Abbreviation/button/link) – ô có thể là <button>. */
  label: ReactNode;
  /** Như `label`: chỉ nội dung dòng chữ, không phần tử tương tác. */
  value: ReactNode;
  state?: PaperFieldState;
  /** Giá trị cũ để so sánh – hiện gạch ngang cạnh giá trị chính (chỉ trên màn hình). */
  compareTo?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  /** Tên đầy đủ của ô (đọc trước giá trị và trạng thái) – hiển thị dưới dạng sr-only, không ghi đè aria-label. */
  ariaLabel: string;
  span?: 1 | 2 | 3 | 4 | 6 | 12;
  /** "end": căn phải giá trị (số tiền, số lượng). */
  align?: "end";
  labels?: Partial<{ missing: string; estimate: string; edited: string; error: string; compare: string }>;
  /** Phần tử gốc (button khi có onSelect, ngược lại div) – để làm đích Tooltip asChild. */
  ref?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, "children" | "onSelect">;

export function PaperField({ label, value, state = "none", compareTo, selected = false, onSelect, ariaLabel, span = 12, align, labels, ref, className, onClick, ...rest }: PaperFieldProps) {
  const t = useMessages(FIELD_MESSAGES, labels);
  const cls = cn(
    // In: nhãn và giá trị cùng một dòng, chữ nhỏ – mỗi trang giấy vừa một trang A4 như mẫu VNACCS.
    "relative block min-w-0 border border-paper-rule bg-paper px-1.5 py-1 text-left text-paper-fg print:flex print:flex-wrap print:items-baseline print:gap-x-1.5 print:px-1 print:py-0",
    SPAN[span],
    state === "error" && "border-danger bg-danger-subtle text-danger-subtle-fg print:border-paper-rule print:bg-paper print:text-paper-fg",
    state === "missing" && "border-dashed border-warning print:border-solid print:border-paper-rule",
    onSelect && "cursor-pointer hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    selected && "ring-2 ring-primary",
    "print:ring-0",
    className,
  );
  const body = (
    <>
      <span className="sr-only">{ariaLabel}</span>
      {" "}
      <span aria-hidden="true" className="block text-[10px] leading-tight opacity-80 print:text-[7pt] print:opacity-100">{label}</span>
      {" "}
      <span className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs print:flex-auto print:text-[7.5pt] print:leading-tight", align === "end" && "justify-end text-right")}>
        <span className={cn("min-w-0 break-words", state === "estimate" && "italic print:not-italic")}>{value}</span>
        {compareTo && (
          <span data-paper-mark className="opacity-70">
            <span className="sr-only">{t.compare} </span>
            <s>{compareTo}</s>
          </span>
        )}
        {state === "estimate" && (
          <span data-paper-mark className="rounded-sm border border-current px-0.5 text-[9px] not-italic leading-none">{t.estimate}</span>
        )}
        {state === "missing" && (
          <span data-paper-mark className="font-sans text-[10px] font-medium text-warning-subtle-fg">{t.missing}</span>
        )}
      </span>
      {state === "error" && (
        <span data-paper-mark role="img" aria-label={t.error} className="absolute right-1 top-1">
          <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" />
        </span>
      )}
      {state === "edited" && (
        <span data-paper-mark className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary">
          <span className="sr-only">{t.edited}</span>
        </span>
      )}
    </>
  );
  if (onSelect) {
    return (
      <button
        {...rest}
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        aria-pressed={selected}
        onClick={(e) => {
          onClick?.(e);
          onSelect();
        }}
        className={cls}
      >
        {body}
      </button>
    );
  }
  return (
    <div {...rest} ref={ref as Ref<HTMLDivElement>} onClick={onClick} className={cls}>
      {body}
    </div>
  );
}
