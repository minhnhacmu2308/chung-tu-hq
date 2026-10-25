// Xem chứng từ gốc: trang giấy, phóng to/thu nhỏ, chuyển trang, tô vùng của một trường (tọa độ % theo trang).
// Nội dung trang do app truyền vào (ảnh trang PDF đã render, hoặc bản dựng lại). Vị trí vùng đến từ dữ liệu
// nên truyền qua biến CSS cục bộ (--rx, --ry…), không hard-code.
import { ChevronLeft, ChevronRight, ExternalLink, FileText, Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Button } from "./button.js";

const MESSAGES = {
  vi: { prev: "Trang trước", next: "Trang sau", page: "Trang {n}/{total}", zoomIn: "Phóng to", zoomOut: "Thu nhỏ", fit: "Vừa khung", zoom: "Mức phóng {n}%" },
  en: { prev: "Previous page", next: "Next page", page: "Page {n} of {total}", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit width", zoom: "Zoom {n}%" },
  zh: { prev: "上一页", next: "下一页", page: "第 {n}/{total} 页", zoomIn: "放大", zoomOut: "缩小", fit: "适合宽度", zoom: "缩放 {n}%" },
} satisfies Messages<"prev" | "next" | "page" | "zoomIn" | "zoomOut" | "fit" | "zoom">;

/**
 * Vùng trên trang, đơn vị % chiều rộng/cao trang (0–100). `page` bắt đầu từ 1.
 * - `label`: vùng của một trường → tô được, bấm được (khi có onRegionClick).
 * - `content`: chữ in trong vùng – dùng khi dựng lại trang từ dữ liệu (không có ảnh gốc). Vùng chỉ có content là trang trí.
 */
export type DocumentRegion = { id: string; page: number; x: number; y: number; w: number; h: number; label?: string; content?: ReactNode };

export type DocumentViewerProps = {
  /** Tên vùng xem cho trình đọc màn hình, vd "Chứng từ gốc: Commercial Invoice". */
  label: string;
  /** Nội dung từng trang (index 0 = trang 1). */
  pages: readonly ReactNode[];
  regions?: readonly DocumentRegion[];
  /** Vùng đang được tô (vd trường người dùng đang rê chuột). Tự chuyển tới trang chứa vùng. */
  highlightId?: string | null;
  /** Bấm vào một vùng (vd để nhảy tới trường tương ứng). Không truyền → vùng chỉ để hiển thị. */
  onRegionClick?: (id: string) => void;
  /** Trang hiện tại (1-based) – điều khiển từ ngoài. */
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  /** Hiện khung mờ cho mọi vùng (không chỉ vùng đang tô). */
  showRegions?: boolean;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  className?: string;
};

/** Bề rộng trang ở mức 100% (px) – khổ A4 dọc. */
export const DOCUMENT_PAGE_WIDTH = 640;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const STEP = 0.25;

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));

export function DocumentViewer({
  label,
  pages,
  regions = [],
  highlightId = null,
  onRegionClick,
  page: pageProp,
  defaultPage = 1,
  onPageChange,
  showRegions = false,
  labels,
  className,
}: DocumentViewerProps) {
  const t = useMessages(MESSAGES, labels);
  const total = Math.max(1, pages.length);
  const [pageState, setPageState] = useState(defaultPage);
  const page = Math.min(total, Math.max(1, pageProp ?? pageState));
  const setPage = useCallback(
    (p: number) => {
      const next = Math.min(total, Math.max(1, p));
      if (pageProp === undefined) setPageState(next);
      onPageChange?.(next);
    },
    [onPageChange, pageProp, total],
  );

  // Vừa khung: tính mức phóng theo bề rộng vùng xem; người dùng bấm +/- thì chuyển sang mức cố định.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(true);
  const [fitZoom, setFitZoom] = useState(1);
  const [manualZoom, setManualZoom] = useState(1);
  const zoom = fit ? fitZoom : manualZoom;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 32; // trừ lề trong
      if (w > 0) setFitZoom(clampZoom(Math.min(1.25, w / DOCUMENT_PAGE_WIDTH)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const zoomBy = (d: number) => {
    setManualZoom(clampZoom(zoom + d));
    setFit(false);
  };

  // Vùng được tô nằm trang khác → chuyển trang, rồi cuộn tới vùng.
  const highlighted = regions.find((r) => r.id === highlightId);
  useEffect(() => {
    if (highlighted && highlighted.page !== page) setPage(highlighted.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi đổi vùng tô
  }, [highlighted?.id, highlighted?.page]);
  const highlightRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    highlightRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [highlightId, page]);

  const pageRegions = regions.filter((r) => r.page === page);

  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-muted", className)}>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-surface px-2 py-1.5">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.prev} disabled={page <= 1} onClick={() => setPage(page - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-16 text-center text-xs tabular-nums text-fg-muted" aria-live="polite">
          {t.page.replace("{n}", String(page)).replace("{total}", String(total))}
        </span>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.next} disabled={page >= total} onClick={() => setPage(page + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.zoomOut} disabled={zoom <= MIN_ZOOM} onClick={() => zoomBy(-STEP)}>
          <Minus className="h-4 w-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-fg-muted" aria-label={t.zoom.replace("{n}", String(Math.round(zoom * 100)))}>
          {Math.round(zoom * 100)}%
        </span>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.zoomIn} disabled={zoom >= MAX_ZOOM} onClick={() => zoomBy(STEP)}>
          <Plus className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={t.fit} aria-pressed={fit} onClick={() => setFit(true)}>
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-4">
        {/* zoom CSS: phóng cả chữ lẫn vùng tô, giữ nguyên tọa độ %. */}
        <div className="mx-auto w-fit" style={{ zoom } as CSSProperties} data-slot="document-zoom">
          <div
            className="relative aspect-[210/297] w-[640px] overflow-hidden rounded-sm border border-border bg-surface text-[11px] leading-snug text-fg shadow-md"
            data-slot="document-page"
            data-page={page}
          >
            <div className="absolute inset-0 p-10">{pages[page - 1]}</div>
            {pageRegions.map((r) => {
              const active = r.id === highlightId;
              const vars = { "--rx": `${r.x}%`, "--ry": `${r.y}%`, "--rw": `${r.w}%`, "--rh": `${r.h}%` } as CSSProperties;
              const cls = cn(
                "absolute left-[var(--rx)] top-[var(--ry)] h-[var(--rh)] w-[var(--rw)] overflow-hidden rounded-sm text-left transition-colors",
                active ? "bg-primary/15 ring-2 ring-primary" : showRegions ? "ring-1 ring-primary/30" : "ring-0",
              );
              const setRef = active ? (el: HTMLElement | null) => void (highlightRef.current = el) : undefined;
              return onRegionClick && r.label ? (
                <button
                  key={r.id}
                  type="button"
                  ref={setRef}
                  style={vars}
                  className={cn(cls, "hover:bg-primary/10 hover:ring-1 hover:ring-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus")}
                  aria-label={r.label ?? r.id}
                  aria-pressed={active}
                  data-region={r.id}
                  onClick={() => onRegionClick(r.id)}
                >
                  {r.content}
                </button>
              ) : (
                <span key={r.id} ref={setRef} style={vars} className={cls} aria-hidden={r.content ? undefined : true} data-region={r.id} data-active={active || undefined}>
                  {r.content}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ===================== DocumentFileViewer ===================== */

const FILE_MESSAGES = {
  vi: { open: "Mở ở tab mới" },
  en: { open: "Open in new tab" },
  zh: { open: "在新标签页打开" },
} satisfies Messages<"open">;

export type DocumentFileViewerProps = {
  /** Tên vùng xem cho trình đọc màn hình, vd "Chứng từ gốc: Commercial Invoice – INV-001.pdf". */
  label: string;
  /** Đường dẫn file gốc (vd presigned URL của kho lưu trữ). */
  src: string;
  /** pdf → trình xem PDF của trình duyệt (lật trang, phóng to, tìm chữ); image → ảnh vừa khung, cuộn khi lớn. */
  type: "pdf" | "image";
  fileName?: string;
  labels?: Partial<Record<keyof (typeof FILE_MESSAGES)["vi"], string>>;
  className?: string;
};

/**
 * Xem FILE GỐC người dùng đã upload (khác DocumentViewer – trang dựng lại từ dữ liệu, có tô vùng trường).
 * Dùng khi có file thật trong kho; app tự lo trạng thái đang tải/lỗi trước khi có `src`.
 */
export function DocumentFileViewer({ label, src, type, fileName, labels, className }: DocumentFileViewerProps) {
  const t = useMessages(FILE_MESSAGES, labels);
  return (
    <section aria-label={label} className={cn("flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface-muted", className)}>
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-1.5">
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-subtle" />
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={fileName}>{fileName}</span>
        <Button asChild size="sm" variant="ghost">
          <a href={src} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            {t.open}
          </a>
        </Button>
      </div>
      {type === "pdf" ? (
        // #navpanes=0&view=FitH: trình xem PDF của trình duyệt ẩn cột ảnh thu nhỏ, trang vừa chiều ngang khung.
        <iframe title={label} src={`${src}#navpanes=0&view=FitH`} className="min-h-0 w-full flex-1 border-0 bg-surface" data-slot="document-file" />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <img src={src} alt={label} className="mx-auto h-auto max-w-full rounded-sm border border-border bg-surface shadow-md" data-slot="document-file" />
        </div>
      )}
    </section>
  );
}
