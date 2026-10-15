// Kéo thả / chọn file + danh sách file đang upload. Chỉ hiển thị: upload thật do app làm.
import { CheckCircle2, CircleAlert, FileText, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { intlLocale, useMessages, useUiLocale, type Messages, type UiLocale } from "../lib/i18n.js";
import { cn } from "../lib/cn.js";
import { Progress } from "./progress.js";

const MESSAGES = {
  vi: {
    title: "Kéo thả tệp vào đây",
    browse: "hoặc bấm để chọn tệp",
    accept: "Định dạng: {accept}",
    maxSize: "Tối đa {size} mỗi tệp",
    maxFiles: "Tối đa {n} tệp",
    rejectType: "{name}: sai định dạng",
    rejectSize: "{name}: vượt quá {size}",
    rejectCount: "{name}: vượt quá số lượng {n} tệp",
    rejectedTitle: "Không nhận các tệp sau",
    list: "Tệp tải lên",
    queued: "Chờ tải",
    uploading: "Đang tải",
    done: "Đã tải",
    error: "Lỗi",
    remove: "Xóa {name}",
    retry: "Thử lại {name}",
    progressOf: "Tiến độ tải {name}",
  },
  en: {
    title: "Drag and drop files here",
    browse: "or click to browse",
    accept: "Formats: {accept}",
    maxSize: "Up to {size} per file",
    maxFiles: "Up to {n} files",
    rejectType: "{name}: unsupported format",
    rejectSize: "{name}: larger than {size}",
    rejectCount: "{name}: more than {n} files",
    rejectedTitle: "These files were not accepted",
    list: "Uploaded files",
    queued: "Queued",
    uploading: "Uploading",
    done: "Uploaded",
    error: "Error",
    remove: "Remove {name}",
    retry: "Retry {name}",
    progressOf: "Upload progress for {name}",
  },
} satisfies Messages<
  | "title" | "browse" | "accept" | "maxSize" | "maxFiles" | "rejectType" | "rejectSize" | "rejectCount"
  | "rejectedTitle" | "list" | "queued" | "uploading" | "done" | "error" | "remove" | "retry" | "progressOf"
>;
type UploadMessageKey = keyof (typeof MESSAGES)["vi"];

const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));

/** Dung lượng dễ đọc theo ngôn ngữ: 1,5 MB / 1.5 MB. */
export function formatBytes(bytes: number, locale: UiLocale = "vi"): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  const n = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: u === 0 ? 0 : 1 }).format(v);
  return `${n} ${units[u]}`;
}

export type RejectReason = "type" | "size" | "count";
export type RejectedFile = { file: File; reason: RejectReason; message: string };

/** accept kiểu input file: ".pdf,.zip,image/*,application/pdf". */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept
    .split(",")
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => (a.startsWith(".") ? name.endsWith(a) : a.endsWith("/*") ? type.startsWith(a.slice(0, -1)) : type === a));
}

/* ===================== FileDropzone ===================== */

export type FileDropzoneProps = {
  onFiles: (files: File[]) => void;
  onReject?: (rejected: RejectedFile[]) => void;
  accept?: string;
  multiple?: boolean;
  /** Byte. */
  maxSize?: number;
  /** Số tệp tối đa trong một lần chọn/thả. */
  maxFiles?: number;
  disabled?: boolean;
  /** md = vùng thả lớn (cả bộ chứng từ); sm = một dòng gọn, đặt trong ô của từng loại chứng từ. */
  size?: "md" | "sm";
  labels?: Partial<Record<UploadMessageKey, string>>;
  className?: string;
};

export function FileDropzone({
  onFiles,
  onReject,
  accept,
  multiple = true,
  maxSize,
  maxFiles,
  disabled = false,
  size = "md",
  labels,
  className,
}: FileDropzoneProps) {
  const sm = size === "sm";
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);

  const limit = multiple ? maxFiles : 1;
  const sizeText = maxSize !== undefined ? formatBytes(maxSize, locale) : "";

  const handle = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const ok: File[] = [];
    const bad: RejectedFile[] = [];
    for (const f of files) {
      if (!matchesAccept(f, accept)) bad.push({ file: f, reason: "type", message: fill(t.rejectType, { name: f.name }) });
      else if (maxSize !== undefined && f.size > maxSize) bad.push({ file: f, reason: "size", message: fill(t.rejectSize, { name: f.name, size: sizeText }) });
      else if (limit !== undefined && ok.length >= limit) bad.push({ file: f, reason: "count", message: fill(t.rejectCount, { name: f.name, n: limit }) });
      else ok.push(f);
    }
    setRejected(bad);
    if (bad.length) onReject?.(bad);
    if (ok.length) onFiles(ok);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    handle(e.dataTransfer?.files ?? null);
  };

  const hints = [
    accept ? fill(t.accept, { accept }) : null,
    maxSize !== undefined ? fill(t.maxSize, { size: sizeText }) : null,
    limit !== undefined && multiple ? fill(t.maxFiles, { n: limit }) : null,
  ].filter(Boolean);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-describedby={hints.length ? hintId : undefined}
        data-dragging={dragging || undefined}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "flex w-full items-center rounded-lg border-dashed border-border-strong bg-surface text-center transition-colors",
          sm ? "flex-row justify-center gap-2 border px-3 py-2.5" : "flex-col gap-2 border-2 px-6 py-8",
          "hover:border-primary hover:bg-surface-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
          "data-[dragging]:border-primary data-[dragging]:bg-primary-subtle",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <UploadCloud aria-hidden="true" className={cn(sm ? "h-4 w-4 shrink-0" : "h-8 w-8", dragging ? "text-primary" : "text-fg-subtle")} />
        <span className={cn("text-sm text-fg", sm ? "text-fg-muted" : "font-medium")}>{t.title}</span>
        {t.browse && <span className="text-sm text-primary">{t.browse}</span>}
        {hints.length > 0 && (
          // Dạng gọn: gợi ý định dạng/dung lượng chỉ để trình đọc màn hình đọc, không chiếm chỗ.
          <span id={hintId} className={sm ? "sr-only" : "text-xs text-fg-subtle"}>
            {hints.join(" · ")}
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      {rejected.length > 0 && (
        <div role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-sm text-danger-subtle-fg">
          <p className="font-medium">{t.rejectedTitle}</p>
          <ul className="mt-1 list-disc pl-5">
            {rejected.map((r, i) => (
              <li key={`${r.file.name}-${i}`} data-reason={r.reason}>
                {r.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ===================== FileUploadList ===================== */

export type UploadStatus = "queued" | "uploading" | "done" | "error";
export type UploadItem = {
  id: string;
  name: string;
  /** Byte. */
  size: number;
  status: UploadStatus;
  /** 0–100, khi đang tải. */
  progress?: number;
  error?: string;
};

export type FileUploadListProps = {
  items: readonly UploadItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  labels?: Partial<Record<UploadMessageKey, string>>;
  className?: string;
};

const STATUS_STYLE: Record<UploadStatus, string> = {
  queued: "text-fg-subtle",
  uploading: "text-primary",
  done: "text-success-subtle-fg",
  error: "text-danger-subtle-fg",
};

const iconBtn =
  "inline-flex h-7 w-7 items-center justify-center rounded-sm text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function FileUploadList({ items, onRemove, onRetry, labels, className }: FileUploadListProps) {
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  if (!items.length) return null;
  return (
    <ul aria-label={t.list} className={cn("flex flex-col divide-y divide-border rounded-lg border border-border bg-surface", className)}>
      {items.map((it) => (
        <li key={it.id} data-status={it.status} className="flex items-center gap-3 px-3 py-2.5">
          <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-medium text-fg">{it.name}</span>
              <span className="shrink-0 text-xs text-fg-subtle tabular-nums">{formatBytes(it.size, locale)}</span>
            </div>
            {it.status === "uploading" && (
              <Progress size="sm" value={it.progress ?? null} aria-label={fill(t.progressOf, { name: it.name })} />
            )}
            {it.status === "error" && it.error && <span className="text-xs text-danger-subtle-fg">{it.error}</span>}
          </div>
          <span className={cn("inline-flex shrink-0 items-center gap-1 text-xs font-medium", STATUS_STYLE[it.status])}>
            {it.status === "done" && <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}
            {it.status === "error" && <CircleAlert aria-hidden="true" className="h-4 w-4" />}
            {t[it.status]}
          </span>
          {it.status === "error" && onRetry && (
            <button type="button" className={iconBtn} aria-label={fill(t.retry, { name: it.name })} onClick={() => onRetry(it.id)}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          {onRemove && (
            <button type="button" className={iconBtn} aria-label={fill(t.remove, { name: it.name })} onClick={() => onRemove(it.id)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
