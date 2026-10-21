// Giấy tờ khai: khung trang A4 mô phỏng bản in VNACCS (PaperStack > PaperSheet > PaperField).
// Trên màn hình giấy theo giao diện (sáng: trắng, tối: theo nền tối), mỗi ô có khung để bấm sửa; khi in theo đúng kiểu bản in VNACCS:
// không khung ô, nhãn và giá trị cùng dòng (giá trị chữ đơn cách), chỉ kẻ ngang giữa các khối và kẻ dọc giữa hai cột; chữ đen nền trắng,
// ẩn mọi dấu hiệu trạng thái (phần tử có `data-paper-mark`). Quy tắc @media print nằm ở styles/index.css.
import { TriangleAlert } from "lucide-react";
import { Fragment, type HTMLAttributes, type ReactNode, type Ref } from "react";
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
      className="@container/paper relative min-h-[297mm] w-full max-w-[210mm] border border-paper-rule bg-paper p-3 text-paper-fg shadow-md sm:p-[10mm] print:min-h-0 print:max-w-none print:border-0 print:p-0 print:shadow-none"
    >
      {header && <div className="mb-3 border-b border-paper-rule pb-2 print:mb-1 print:pb-1">{header}</div>}
      <div data-paper-body className="relative grid grid-cols-12 gap-px print:gap-0">{children}</div>
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
  return <div className={cn("col-span-12 grid min-w-0 grid-cols-1 paper-wide:grid-cols-2 print:grid-cols-2 print:divide-x print:divide-paper-rule", className)}>{children}</div>;
}

/**
 * Nhãn cột của nhóm ô lặp (in một lần phía trên các dòng, như mẫu VNACCS: "Số vận đơn", "Tên sắc thuế | Tổng tiền thuế"…).
 * Chỉ để nhìn (aria-hidden): mỗi ô PaperField của dòng lặp vẫn mang tên đầy đủ trong `ariaLabel`.
 */
export function PaperLabel({ children, span = 12, align }: { children?: ReactNode; span?: 1 | 2 | 3 | 4 | 6 | 12; align?: "end" }) {
  return (
    <div aria-hidden="true" className={cn("min-w-0 px-1.5 pt-0.5 text-[10px] leading-tight text-paper-fg opacity-80 print:px-1 print:pt-0 print:text-[7pt] print:opacity-100", SPAN[span], align === "end" && "text-right")}>
      {children}
    </div>
  );
}

/** Chữ có điểm ngắt dòng chỉ sau dấu phân cách ("/", ":", "-", ".", khoảng trắng): "18/10/" + "2026", không bao giờ giữa một cụm số. */
function breakAtSeparators(node: ReactNode): ReactNode {
  if (typeof node !== "string") return node;
  const parts = node.split(/(?<=[/:. -])/);
  return parts.map((p, i) => (
    <Fragment key={i}>
      {p}
      {i < parts.length - 1 && <wbr />}
    </Fragment>
  ));
}

export type PaperFieldProps = {
  /** Chỉ nội dung dòng chữ (phrasing content), không chứa phần tử tương tác (không Abbreviation/button/link) – ô có thể là <button>. */
  label: ReactNode;
  /** Như `label`: chỉ nội dung dòng chữ, không phần tử tương tác. */
  value: ReactNode;
  state?: PaperFieldState;
  /** Bản ngắn của giá trị (vd chỉ mã, không kèm tên): hiện thay `value` trên trang giấy hẹp và khi in. */
  compact?: ReactNode;
  /**
   * Không bẻ giữa một cụm (giờ, ngày, số tờ khai, mã): chỉ xuống dòng sau dấu phân cách ("18/10/" + "2026"); cụm không có dấu phân cách
   * thì xuống dòng nguyên cụm, chữ nhỏ lại một chút. Không cắt bớt giá trị.
   */
  keepTogether?: boolean;
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

export function PaperField({ label, value, compact, keepTogether = false, state = "none", compareTo, selected = false, onSelect, ariaLabel, span = 12, align, labels, ref, className, onClick, ...rest }: PaperFieldProps) {
  const t = useMessages(FIELD_MESSAGES, labels);
  const cls = cn(
    // In: nhãn và giá trị cùng một dòng, chữ nhỏ – mỗi trang giấy vừa một trang A4 như mẫu VNACCS.
    "relative block min-w-0 border border-paper-rule bg-paper px-1.5 py-1 text-left text-paper-fg print:flex print:flex-wrap print:items-baseline print:gap-x-1.5 print:px-1 print:py-0",
    SPAN[span],
    // Cụm không bẻ (giờ, mã) trong ô 1 cột của trang hẹp: lề ngang và chữ nhỏ lại để "01:" / "USD" vừa ô; trang rộng chữ như ô khác.
    keepTogether && "px-0.5 paper-wide:px-1",
    state === "error" && "border-danger bg-danger-subtle text-danger-subtle-fg",
    state === "missing" && "border-dashed border-warning",
    onSelect && "cursor-pointer hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    selected && "ring-2 ring-primary",
    // In như mẫu VNACCS: không khung ô, không nền trạng thái.
    "print:border-0 print:bg-transparent print:text-paper-fg print:ring-0",
    className,
  );
  const body = (
    <>
      <span className="sr-only">{ariaLabel}</span>
      {" "}
      <span aria-hidden="true" className={cn("block text-[10px] leading-tight opacity-80 print:shrink-0 print:text-[7pt] print:opacity-100", span >= 6 && "print:min-w-[13em]")}>{label}</span>
      {" "}
      <span className={cn("flex min-w-0 flex-wrap items-baseline gap-x-2 font-mono text-xs print:flex-auto print:text-[7.5pt] print:leading-tight", keepTogether && "text-[10px] tracking-tight paper-wide:text-xs paper-wide:tracking-normal print:text-[7.5pt]! print:tracking-normal!", align === "end" && "justify-end text-right")}>
        <span className={cn("min-w-0", keepTogether ? "break-normal" : "break-words", state === "estimate" && "italic print:not-italic")}>
          {compact != null ? (
            <>
              <span data-paper-full className="hidden paper-wide:inline">{keepTogether ? breakAtSeparators(value) : value}</span>
              <span data-paper-compact className="paper-wide:hidden">{keepTogether ? breakAtSeparators(compact) : compact}</span>
            </>
          ) : keepTogether ? breakAtSeparators(value) : value}
        </span>
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
