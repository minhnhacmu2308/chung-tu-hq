"use client";
// Chi tiết một email chứng từ (mở khi bấm dòng trong bảng): người gửi, hộp thư nhận, thời gian, trích nội dung,
// file đính kèm (đã vào hồ sơ nào), gợi ý hồ sơ và các nút xếp file.
import type { InboxAttachment, InboxMessage } from "@kb/contracts";
import {
  Badge, Button, cn, Dialog, DialogContent, DialogFooter, fill, formatBytes, StatusBadge, Tooltip, useMessages, useUiLocale,
} from "@kb/ui";
import { Eye, EyeOff, FilePlus2, FileText, FolderInput, Lightbulb, Mail, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { pendingAttachments } from "./add-to-dossier";
import { INBOX_MESSAGES } from "./inbox.messages";

export const STATUS = { NEW: "INBOX_NEW", DONE: "INBOX_DONE", IGNORED: "INBOX_IGNORED" } as const;

function AttachmentRow({ a, onPreview }: { a: InboxAttachment; onPreview: (a: InboxAttachment) => void }) {
  const t = useMessages(INBOX_MESSAGES);
  const kinds = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-surface-muted px-2 py-1.5">
      <FileText className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm text-fg" title={a.fileName}>{a.fileName}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
          <span>{`${kinds[a.kindGuess]} · ${formatBytes(a.size, locale)}`}</span>
          {a.status === "ADDED" && a.dossierId ? (
            <Badge tone="success" size="sm">
              <Link href={`/dossiers/${a.dossierId}`} className="underline-offset-2 hover:underline">{fill(t.addedTo, { code: a.dossierCode ?? "—" })}</Link>
            </Badge>
          ) : (
            <Badge tone="neutral" size="sm">{t.pending}</Badge>
          )}
        </span>
      </div>
      <Tooltip content={fill(t.viewFile, { name: a.fileName })}>
        <Button size="icon-sm" variant="ghost" aria-label={fill(t.viewFile, { name: a.fileName })} onClick={() => onPreview(a)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
    </li>
  );
}

export type InboxActions = {
  canUse: boolean;
  onAddToSuggested: (m: InboxMessage) => void;
  onAddTo: (m: InboxMessage) => void;
  onCreateDossier: (m: InboxMessage) => void;
  onSetStatus: (m: InboxMessage, status: "NEW" | "IGNORED") => void;
  /** Hỏi xác nhận rồi xóa email khỏi hộp thư chứng từ; `onDone` sau khi xóa xong (vd bỏ chọn). */
  onDelete: (messages: InboxMessage[], onDone?: () => void) => void;
  /** Xem trước file đính kèm trong popup (không chuyển trang). */
  onPreview: (a: InboxAttachment) => void;
  /** Email đang được thêm vào hồ sơ gợi ý (khóa nút). */
  addingId: string | null;
};

function Meta({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", wide && "cq-md:col-span-2")}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

export function InboxMessageDetail({ m, actions, onOpenChange }: { m: InboxMessage | null; actions: InboxActions; onOpenChange: (open: boolean) => void }) {
  const t = useMessages(INBOX_MESSAGES);
  return (
    <Dialog open={m !== null} onOpenChange={onOpenChange} defaultPresentation="panel">
      {m && (
        <DialogContent
          title={m.subject}
          icon={<Mail className="h-4 w-4" />}
          description={fill(t.from, { name: m.fromName })}
          size="lg"
        >
          <DetailBody m={m} actions={actions} />
          <DialogFooter>
            {actions.canUse && (
              <Button variant="ghost" className="mr-auto text-danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => actions.onDelete([m])}>{t.delete}</Button>
            )}
            {actions.canUse && m.status === "NEW" && (
              <Button variant="ghost" leftIcon={<EyeOff className="h-4 w-4" />} onClick={() => actions.onSetStatus(m, "IGNORED")}>{t.ignore}</Button>
            )}
            {actions.canUse && m.status === "IGNORED" && (
              <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => actions.onSetStatus(m, "NEW")}>{t.restore}</Button>
            )}
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{t.close}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function DetailBody({ m, actions }: { m: InboxMessage; actions: InboxActions }) {
  const t = useMessages(INBOX_MESSAGES);
  const pending = pendingAttachments(m);
  const s = m.suggestion;
  const canFile = actions.canUse && m.status === "NEW" && pending.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-3 rounded-md border border-border bg-surface-muted p-3 cq-md:grid-cols-2">
        <Meta label={t.detailSubject} wide>{m.subject}</Meta>
        <Meta label={t.detailFrom}>
          {m.fromName} <span className="text-fg-muted">{`<${m.fromEmail}>`}</span>
        </Meta>
        <Meta label={t.detailMailbox}>{m.mailbox}</Meta>
        <Meta label={t.detailReceived}>
          <time dateTime={m.receivedAt}>{formatDateTime(m.receivedAt)}</time> <span className="text-fg-muted">· {formatRelative(m.receivedAt)}</span>
        </Meta>
        <Meta label={t.detailStatus}>
          <StatusBadge status={STATUS[m.status]} />
        </Meta>
      </dl>

      {m.snippet && (
        <section className="flex flex-col gap-1.5" aria-labelledby={`${m.id}-content`}>
          <h3 id={`${m.id}-content`} className="text-xs font-medium text-fg-muted">{t.detailContent}</h3>
          <p className="whitespace-pre-line text-sm text-fg">{m.snippet}</p>
        </section>
      )}

      <section className="flex flex-col gap-1.5" aria-labelledby={`${m.id}-files`}>
        <h3 id={`${m.id}-files`} className="text-xs font-medium text-fg-muted">{fill(t.attachments, { n: m.attachments.length })}</h3>
        <ul aria-labelledby={`${m.id}-files`} className="flex flex-col gap-1.5">
          {m.attachments.map((a) => <AttachmentRow key={a.id} a={a} onPreview={actions.onPreview} />)}
        </ul>
      </section>

      {(s || canFile) && (
        <section className="flex flex-col gap-3 rounded-md border border-border p-3" aria-label={t.detailSuggestion}>
          {s ? (
            <div className="flex min-w-0 items-start gap-2 text-sm">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/dossiers/${s.dossierId}`} className="min-w-0 break-words font-medium text-fg underline-offset-2 hover:underline">
                  {fill(t.suggestion, { code: s.dossierCode, partner: s.partner })}
                </Link>
                <Badge tone="primary" size="sm">{t[`reason${s.reason}`]}</Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg-muted">{t.noSuggestion}</p>
          )}
          {canFile && (
            <div className="flex flex-wrap items-center gap-2">
              {s && (
                <Button size="sm" leftIcon={<FolderInput className="h-4 w-4" />} loading={actions.addingId === m.id} onClick={() => actions.onAddToSuggested(m)}>
                  {t.addToSuggested}
                </Button>
              )}
              <Button size="sm" variant={s ? "secondary" : "primary"} {...(s ? {} : { leftIcon: <FolderInput className="h-4 w-4" /> })} onClick={() => actions.onAddTo(m)}>
                {t.addToDossier}
              </Button>
              <Button size="sm" variant="ghost" leftIcon={<FilePlus2 className="h-4 w-4" />} onClick={() => actions.onCreateDossier(m)}>
                {t.createDossier}
              </Button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
