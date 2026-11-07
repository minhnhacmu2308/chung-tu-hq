// GỠ LỖI TẠM (FPT_DEBUG_TRACE): khung xem body gửi FPT + phản hồi thô ở màn Truyền. Backend tắt cờ → không hiện gì.
// Không tự hỏi định kỳ riêng: tải lại mỗi khi màn Truyền vừa tải lại submission (`refreshAt`) hoặc khi bấm Làm mới. Bỏ tính năng: grep FPT_DEBUG_TRACE.
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, fill, Stack, toast, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Copy, FileSearch, RefreshCw } from "lucide-react";
import { customsKeys, getFptPreview, getFptTrace, type FptPreviewSheet, type FptTraceEntry } from "@/api/customs";
import { formatDateTime, formatNumber, formatTime } from "@/lib/format";
import { FPT_TRACE_MESSAGES } from "./fpt-trace-panel.messages";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const pretty = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

async function copyText(text: string, done: string, failed: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", title: done });
  } catch {
    // Trình duyệt chặn clipboard (http, quyền) → người dùng tự bôi đen chép.
    toast({ tone: "danger", title: failed });
  }
}

export function FptTracePanel({ dossierId, refreshAt }: { dossierId: string; refreshAt: number }) {
  const t = useMessages(FPT_TRACE_MESSAGES);
  const q = useQuery({ queryKey: customsKeys.fptTrace(dossierId), queryFn: () => getFptTrace(dossierId) });
  const { refetch } = q;
  useEffect(() => {
    if (refreshAt) void refetch();
  }, [refreshAt, refetch]);
  if (!q.data?.enabled) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle className="flex items-center gap-2">
            {t.title}
            <Badge tone="warning">{t.debug}</Badge>
          </CardTitle>
          <CardDescription>{t.desc}</CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Truyền lại sau gọi về / khai sửa đổi đi bằng nút trên dòng nghiệp vụ – xem trước ở đây. */}
          <FptPreviewButton dossierId={dossierId} />
          <Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} loading={q.isFetching} onClick={() => void q.refetch()}>
            {t.refresh}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.data.entries.length === 0 ? (
          <EmptyState title={t.emptyTitle} description={t.emptyDesc} />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {q.data.entries.map((e) => (
              <TraceRow key={e.id} e={e} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TraceRow({ e }: { e: FptTraceEntry }) {
  const t = useMessages(FPT_TRACE_MESSAGES);
  const ok = e.status !== null && e.status >= 200 && e.status < 300 && !e.error;
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <Badge tone="neutral" variant="outline" className="font-mono">
            {e.operation}
          </Badge>
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">{e.path}</span>
          {e.dossierId === null && <Badge tone="info">{t.orgWide}</Badge>}
          <Badge tone={ok ? "success" : "danger"} {...(e.status === null ? {} : { className: "font-mono" })}>
            {e.status === null ? t.noConnection : fill(t.httpStatus, { status: e.status })}
          </Badge>
          <span className="text-xs tabular-nums text-fg-subtle">{fill(t.ms, { n: formatNumber(e.durationMs) })}</span>
          <span className="text-xs tabular-nums text-fg-subtle" title={formatDateTime(e.at)}>
            {isToday(e.at) ? formatTime(e.at) : formatDateTime(e.at)}
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-3 pb-3">
          {e.error && <p className="text-sm text-danger">{fill(t.error, { message: e.error })}</p>}
          <Body label={t.request} copyAria={fill(t.copyRequestAria, { op: e.operation })} value={pretty(e.request)} />
          <Body label={t.response} copyAria={fill(t.copyResponseAria, { op: e.operation })} value={e.response === null ? null : pretty(e.response)} />
        </div>
      </details>
    </li>
  );
}

function Body({ label, copyAria, value }: { label: string; copyAria: string; value: string | null }) {
  const t = useMessages(FPT_TRACE_MESSAGES);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg-muted">{label}</span>
        {value !== null && (
          <Button size="sm" variant="ghost" leftIcon={<Copy className="h-3.5 w-3.5" />} aria-label={copyAria} onClick={() => void copyText(value, t.copied, t.copyFailed)}>
            {t.copy}
          </Button>
        )}
      </div>
      {value === null ? (
        <p className="text-sm text-fg-subtle">{t.noResponse}</p>
      ) : (
        <pre className="max-h-96 overflow-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-fg-muted">{value}</pre>
      )}
    </div>
  );
}

/**
 * GỠ LỖI TẠM (FPT_DEBUG_TRACE): nút "Xem trước payload" – body từng tờ sẽ gửi nếu truyền ngay (không gọi FPT). Backend tắt cờ → không hiện.
 * Dựng lại mỗi lần mở hộp (tờ khai có thể vừa sửa).
 */
export function FptPreviewButton({ dossierId }: { dossierId: string }) {
  const t = useMessages(FPT_TRACE_MESSAGES);
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: customsKeys.fptPreview(dossierId), queryFn: () => getFptPreview(dossierId) });
  if (!q.data?.enabled) return null;
  const sheets = q.data.sheets;
  return (
    <>
      <Button
        className="shrink-0"
        variant="secondary"
        leftIcon={<FileSearch className="h-4 w-4" />}
        loading={q.isFetching && open}
        onClick={() => {
          setOpen(true);
          void q.refetch();
        }}
      >
        {t.previewButton}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t.previewTitle} icon={<FileSearch className="h-4 w-4" />} description={t.previewDesc} size="lg">
          {sheets.length === 0 ? (
            <EmptyState title={t.previewEmpty} description={t.previewEmptyDesc} />
          ) : (
            <Stack gap="md">
              {sheets.map((s) => (
                <PreviewSheet key={s.branch} s={s} />
              ))}
            </Stack>
          )}
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={() => setOpen(false)}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewSheet({ s }: { s: FptPreviewSheet }) {
  const t = useMessages(FPT_TRACE_MESSAGES);
  const clean = !s.missing && s.blockers.length === 0 && s.issues.length === 0;
  return (
    <section aria-label={`${fill(t.sheet, { no: s.branch, of: s.of })} ${s.operation}`} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral" variant="outline" className="font-mono">
          {s.operation}
        </Badge>
        <span className="font-mono text-xs text-fg-muted">{s.path}</span>
        {s.of > 1 && <Badge tone="info">{fill(t.sheet, { no: s.branch, of: s.of })}</Badge>}
      </div>
      {clean && (
        <Alert tone="success" title={t.readyTitle}>
          {t.readyDesc}
        </Alert>
      )}
      {s.missing && (
        <Alert tone="danger" title={t.missingTitle}>
          {s.missing}
        </Alert>
      )}
      <IssueList tone="danger" title={t.blockersTitle} items={s.blockers} />
      <IssueList tone="danger" title={t.issuesTitle} items={s.issues} />
      <IssueList tone="warning" title={t.warningsTitle} items={s.warnings} />
      <Body label={t.request} copyAria={fill(t.copyRequestAria, { op: s.operation })} value={pretty(s.request)} />
    </section>
  );
}

function IssueList({ tone, title, items }: { tone: "danger" | "warning"; title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Alert tone={tone} title={title}>
      <ul className="list-disc pl-5">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </Alert>
  );
}
