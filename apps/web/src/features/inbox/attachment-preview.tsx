"use client";
// Xem trước file đính kèm email ngay trên trang (popup), không mở tab mới: PDF qua trình xem PDF của trình duyệt, ảnh vừa khung.
// Tải file về thành blob rồi mới hiển thị: header của route file (CSP sandbox, nosniff) giữ nguyên an toàn khi mở trực tiếp,
// còn trong popup thì trình xem PDF không bị chặn bởi sandbox.
import type { InboxAttachment } from "@kb/contracts";
import { Button, Dialog, DialogContent, DialogFooter, EmptyState, formatBytes, Spinner, useMessages, useUiLocale } from "@kb/ui";
import { Download, ExternalLink, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { inboxAttachmentUrl } from "@/api/mailbox";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { INBOX_MESSAGES } from "./inbox.messages";

type Kind = "pdf" | "image" | "other";
const kindOf = (fileName: string): Kind => {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return ext === "pdf" ? "pdf" : ext === "png" || ext === "jpg" || ext === "jpeg" ? "image" : "other";
};

type Loaded = { status: "loading" } | { status: "error" } | { status: "ready"; url: string };

/** Lấy file thành object URL (mock trả sẵn blob URL); thu hồi khi đóng / đổi file. */
function useAttachmentBlob(id: string | null): Loaded {
  const [state, setState] = useState<Loaded>({ status: "loading" });
  useEffect(() => {
    if (!id) return;
    let url: string | null = null;
    let cancelled = false;
    setState({ status: "loading" });
    const src = inboxAttachmentUrl(id);
    const load = src.startsWith("blob:")
      ? Promise.resolve(src)
      : fetch(src, { credentials: "same-origin" }).then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          return URL.createObjectURL(await r.blob());
        });
    load.then(
      (u) => {
        url = u;
        if (cancelled) URL.revokeObjectURL(u);
        else setState({ status: "ready", url: u });
      },
      () => !cancelled && setState({ status: "error" }),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

export function AttachmentPreviewDialog({ attachment, onOpenChange }: { attachment: InboxAttachment | null; onOpenChange: (open: boolean) => void }) {
  const t = useMessages(INBOX_MESSAGES);
  const kinds = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  const a = attachment;
  const kind = a ? kindOf(a.fileName) : "other";
  const file = useAttachmentBlob(a && kind !== "other" ? a.id : null);
  return (
    <Dialog open={a !== null} onOpenChange={onOpenChange}>
      {a && (
        <DialogContent
          title={a.fileName}
          icon={<FileText className="h-4 w-4" />}
          description={`${kinds[a.kindGuess]} · ${formatBytes(a.size, locale)}`}
          size="xl"
        >
          <div className="flex h-160 max-h-full min-h-80 flex-col overflow-hidden rounded-md border border-border bg-surface-muted">
            {kind === "other" ? (
              <EmptyState icon={<FileText />} title={t.previewUnsupportedTitle} description={t.previewUnsupported} className="m-auto" />
            ) : file.status === "loading" ? (
              <div className="m-auto"><Spinner label={t.previewLoading} /></div>
            ) : file.status === "error" ? (
              <EmptyState illustration="error" illustrationSize="sm" title={t.previewError} description={t.previewErrorHint} className="m-auto" />
            ) : kind === "pdf" ? (
              // #navpanes=0&view=FitH: ẩn cột ảnh thu nhỏ, trang vừa chiều ngang khung.
              <iframe title={a.fileName} src={`${file.url}#navpanes=0&view=FitH`} className="min-h-0 w-full flex-1 border-0 bg-surface" data-slot="attachment-preview" />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <img src={file.url} alt={a.fileName} className="mx-auto h-auto max-w-full rounded-sm border border-border bg-surface shadow-md" data-slot="attachment-preview" />
              </div>
            )}
          </div>
          <DialogFooter>
            {kind === "other" ? (
              <Button variant="secondary" asChild>
                <a href={inboxAttachmentUrl(a.id)} download={a.fileName}><Download className="h-4 w-4" aria-hidden="true" />{t.download}</a>
              </Button>
            ) : (
              file.status === "ready" && (
                <Button variant="ghost" asChild>
                  <a href={file.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" aria-hidden="true" />{t.openNewTab}</a>
                </Button>
              )
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t.close}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
