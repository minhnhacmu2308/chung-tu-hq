// Giấy tờ khai: khung trang A4 mô phỏng bản in VNACCS (PaperStack > PaperSheet > PaperField).
// Trên màn hình giấy theo giao diện (sáng: trắng, tối: theo nền tối); khi in luôn chữ đen nền trắng và ẩn mọi dấu hiệu trạng thái
// (phần tử có `data-paper-mark`). Quy tắc @media print nằm ở styles/index.css.
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

export type PaperFieldState = "none" | "error" | "missing" | "estimate" | "edited";

const SHEET_MESSAGES = {
  vi: { page: "Trang {n} / {total}" },
  en: { page: "Page {n} / {total}" },
} satisfies Messages<"page">;

const FIELD_MESSAGES = {
  vi: { missing: "Còn thiếu", estimate: "ƯT", edited: "Đã sửa", error: "Có lỗi" },
  en: { missing: "Missing", estimate: "Est.", edited: "Edited", error: "Error" },
} satisfies Messages<"missing" | "estimate" | "edited" | "error">;

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
      className="relative aspect-[210/297] w-full max-w-[210mm] overflow-hidden border border-paper-rule bg-paper p-[10mm] text-paper-fg shadow-md print:aspect-auto print:max-w-none print:border-0 print:shadow-none"
    >
      {header && <div className="mb-3 border-b border-paper-rule pb-2">{header}</div>}
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

export type PaperFieldProps = {
  label: ReactNode;
  value: ReactNode;
  state?: PaperFieldState;
  /** Giá trị cũ để so sánh – hiện gạch ngang cạnh giá trị chính (chỉ trên màn hình). */
  compareTo?: string | null;
  selected?: boolean;
  onSelect?: () => void;
  ariaLabel: string;
  span?: 1 | 2 | 3 | 4 | 6 | 12;
  labels?: Partial<{ missing: string; estimate: string; edited: string; error: string }>;
};

export function PaperField({ label, value, state = "none", compareTo, selected = false, onSelect, ariaLabel, span = 12, labels }: PaperFieldProps) {
  const t = useMessages(FIELD_MESSAGES, labels);
  const cls = cn(
    "relative block min-w-0 border border-paper-rule bg-paper px-1.5 py-1 text-left text-paper-fg",
    SPAN[span],
    state === "error" && "border-danger bg-danger-subtle text-danger-subtle-fg print:bg-paper print:text-paper-fg",
    state === "missing" && "border-dashed border-warning print:border-solid print:border-paper-rule",
    onSelect && "cursor-pointer hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    selected && "ring-2 ring-primary",
    "print:ring-0",
  );
  const body = (
    <>
      <span className="block text-[10px] leading-tight opacity-80">{label}</span>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs">
        <span className={cn("min-w-0 break-words", state === "estimate" && "italic")}>{value}</span>
        {compareTo && (
          <span data-paper-mark className="opacity-70">
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
      <button type="button" aria-label={ariaLabel} aria-pressed={selected} onClick={onSelect} className={cls}>
        {body}
      </button>
    );
  }
  return (
    <div role="group" aria-label={ariaLabel} className={cls}>
      {body}
    </div>
  );
}
