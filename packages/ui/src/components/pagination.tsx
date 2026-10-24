// Phân trang: số trang có dấu …, trước/sau, chọn số dòng mỗi trang, "1–20 / 135" theo locale.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/cn.js";
import { intlLocale, useMessages, useUiLocale, type Messages } from "../lib/i18n.js";
import { Select } from "./inputs.js";

const MESSAGES = {
  vi: { nav: "Phân trang", prev: "Trang trước", next: "Trang sau", page: "Trang {n}", pageSize: "Số dòng mỗi trang", perPage: "{n} / trang" },
  en: { nav: "Pagination", prev: "Previous page", next: "Next page", page: "Page {n}", pageSize: "Rows per page", perPage: "{n} / page" },
  zh: { nav: "分页", prev: "上一页", next: "下一页", page: "第 {n} 页", pageSize: "每页行数", perPage: "{n} 条/页" },
} satisfies Messages<"nav" | "prev" | "next" | "page" | "pageSize" | "perPage">;

export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Danh sách nút trang (0-based) có dấu … ở hai đầu.
 * Luôn có trang đầu, trang cuối và `siblings` trang hai bên trang hiện tại.
 */
export function getPageItems(current: number, total: number, siblings = 1): PageItem[] {
  if (total <= 0) return [0];
  // Đủ chỗ hiển thị hết: đầu + cuối + hiện tại + 2*siblings + 2 dấu …
  if (total <= 5 + siblings * 2) return Array.from({ length: total }, (_, i) => i);
  const first = 0;
  const last = total - 1;
  const start = Math.max(first + 1, Math.min(current - siblings, last - 1 - siblings * 2 - 1));
  const end = Math.min(last - 1, Math.max(current + siblings, first + 1 + siblings * 2 + 1));
  const items: PageItem[] = [first];
  if (start > first + 1) items.push("ellipsis-start");
  for (let i = start; i <= end; i++) items.push(i);
  if (end < last - 1) items.push("ellipsis-end");
  items.push(last);
  return items;
}

export type PaginationProps = {
  /** Trang hiện tại, bắt đầu từ 0. */
  pageIndex: number;
  pageSize: number;
  /** Tổng số dòng (toàn bộ, không chỉ trang hiện tại). */
  rowCount: number;
  onPageChange: (pageIndex: number) => void;
  /** Bỏ trống để ẩn bộ chọn số dòng. */
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
  siblings?: number;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  className?: string;
};

const pageBtn = cn(
  "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-sm text-fg-muted transition-colors",
  "hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  "disabled:pointer-events-none disabled:opacity-40",
);

export function Pagination({
  pageIndex,
  pageSize,
  rowCount,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  siblings = 1,
  labels,
  className,
}: PaginationProps) {
  const t = useMessages(MESSAGES, labels);
  const nf = new Intl.NumberFormat(intlLocale(useUiLocale()));
  const total = Math.max(1, Math.ceil(rowCount / Math.max(1, pageSize)));
  const current = Math.min(Math.max(0, pageIndex), total - 1);
  const from = rowCount === 0 ? 0 : current * pageSize + 1;
  const to = Math.min(rowCount, (current + 1) * pageSize);
  const items = getPageItems(current, total, siblings);
  const fill = (s: string, n: number | string) => s.replace("{n}", String(n));

  return (
    <nav aria-label={t.nav} className={cn("flex flex-wrap items-center justify-between gap-3 text-sm", className)}>
      <p className="text-fg-muted" aria-live="polite">
        {nf.format(from)}–{nf.format(to)} / {nf.format(rowCount)}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <Select
            aria-label={t.pageSize}
            className="h-8 w-auto"
            value={String(pageSize)}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            // Luôn có giá trị hiện tại trong danh sách (vd initialPageSize = 8 không nằm trong [10, 20, 50, 100]).
            options={[...new Set([...pageSizeOptions, pageSize])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: fill(t.perPage, nf.format(n)) }))}
          />
        )}
        <ul className="flex items-center gap-0.5">
          <li>
            <button type="button" className={pageBtn} aria-label={t.prev} disabled={current === 0} onClick={() => onPageChange(current - 1)}>
              <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            </button>
          </li>
          {items.map((it) =>
            typeof it === "number" ? (
              <li key={it}>
                <button
                  type="button"
                  className={cn(pageBtn, it === current && "bg-primary-subtle font-medium text-primary-subtle-fg hover:bg-primary-subtle hover:text-primary-subtle-fg")}
                  aria-label={fill(t.page, nf.format(it + 1))}
                  aria-current={it === current ? "page" : undefined}
                  onClick={() => it !== current && onPageChange(it)}
                >
                  {nf.format(it + 1)}
                </button>
              </li>
            ) : (
              <li key={it} aria-hidden="true" className="inline-flex h-8 min-w-8 items-center justify-center text-fg-subtle">
                …
              </li>
            ),
          )}
          <li>
            <button type="button" className={pageBtn} aria-label={t.next} disabled={current >= total - 1} onClick={() => onPageChange(current + 1)}>
              <ChevronRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </li>
        </ul>
      </div>
    </nav>
  );
}
