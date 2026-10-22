"use client";
// Một email chứng từ: người gửi, tiêu đề, file đính kèm (đã vào hồ sơ nào), gợi ý hồ sơ và các nút xếp file.
import type { InboxAttachment, InboxMessage } from "@kb/contracts";
import {
  Badge, Button, Card, CardContent, fill, formatBytes, IconTile, RowActions, StatusBadge, Tooltip, useMessages, useUiLocale, type RowAction,
} from "@kb/ui";
import { Eye, EyeOff, FilePlus2, FileText, FolderInput, Lightbulb, Mail, RotateCcw } from "lucide-react";
import Link from "next/link";
import { inboxAttachmentUrl } from "@/api/mailbox";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { pendingAttachments } from "./add-to-dossier";
import { INBOX_MESSAGES } from "./inbox.messages";

const STATUS = { NEW: "INBOX_NEW", DONE: "INBOX_DONE", IGNORED: "INBOX_IGNORED" } as const;

export const openAttachment = (id: string) => window.open(inboxAttachmentUrl(id), "_blank", "noopener");

function AttachmentRow({ a }: { a: InboxAttachment }) {
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
        <Button size="icon-sm" variant="ghost" aria-label={fill(t.viewFile, { name: a.fileName })} onClick={() => openAttachment(a.id)}>
          <Eye className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Tooltip>
    </li>
  );
}

export type InboxCardActions = {
  canUse: boolean;
  onAddToSuggested: (m: InboxMessage) => void;
  onAddTo: (m: InboxMessage) => void;
  onCreateDossier: (m: InboxMessage) => void;
  onSetStatus: (m: InboxMessage, status: "NEW" | "IGNORED") => void;
  /** Email đang được thêm vào hồ sơ gợi ý (khóa nút). */
  addingId: string | null;
};

export function InboxMessageCard({ m, actions }: { m: InboxMessage; actions: InboxCardActions }) {
  const t = useMessages(INBOX_MESSAGES);
  const pending = pendingAttachments(m);
  const s = m.suggestion;
  const canFile = actions.canUse && m.status === "NEW" && pending.length > 0;
  const rowActions: RowAction[] = [
    ...(actions.canUse && m.status === "NEW" ? [{ id: "ignore", label: t.ignore, icon: <EyeOff />, onSelect: () => actions.onSetStatus(m, "IGNORED") }] : []),
    ...(actions.canUse && m.status === "IGNORED" ? [{ id: "restore", label: t.restore, icon: <RotateCcw />, onSelect: () => actions.onSetStatus(m, "NEW") }] : []),
    ...m.attachments.map((a) => ({ id: `view-${a.id}`, label: fill(t.viewFile, { name: a.fileName }), icon: <Eye />, onSelect: () => openAttachment(a.id), quick: false })),
  ];

  return (
    <Card className="group" aria-label={m.subject}>
      <CardContent className="flex flex-col gap-3 pt-4 pb-4">
        <div className="flex items-start gap-3">
          <IconTile icon={<Mail />} size="md" tone={m.status === "NEW" ? "primary" : "neutral"} className="cq-max-sm:hidden" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="min-w-0 break-words text-sm font-semibold text-fg">{m.subject}</h2>
              {m.status !== "NEW" && <StatusBadge status={STATUS[m.status]} />}
            </div>
            <p className="truncate text-sm text-fg-muted" title={`${m.fromName} <${m.fromEmail}>`}>
              {fill(t.from, { name: m.fromName })} <span className="text-fg-subtle">{`<${m.fromEmail}>`}</span>
            </p>
            <p className="flex flex-wrap gap-x-3 text-xs text-fg-subtle">
              <time dateTime={m.receivedAt} title={formatDateTime(m.receivedAt)}>{formatRelative(m.receivedAt)}</time>
              <span className="min-w-0 truncate">{fill(t.viaMailbox, { mailbox: m.mailbox })}</span>
            </p>
          </div>
          <RowActions rowLabel={m.subject} actions={rowActions} className="shrink-0" />
        </div>

        {m.snippet && <p className="line-clamp-2 text-sm text-fg-muted">{m.snippet}</p>}

        <div className="flex flex-col gap-1.5">
          <p id={`${m.id}-files`} className="text-xs font-medium text-fg-muted">{fill(t.attachments, { n: m.attachments.length })}</p>
          <ul aria-labelledby={`${m.id}-files`} className="grid gap-1.5 cq-md:grid-cols-2">
            {m.attachments.map((a) => <AttachmentRow key={a.id} a={a} />)}
          </ul>
        </div>

        {(s || canFile) && (
          <div className="flex flex-col gap-3 border-t border-border pt-3 cq-lg:flex-row cq-lg:items-center cq-lg:justify-between">
            {s ? (
              <div className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <Link href={`/dossiers/${s.dossierId}`} className="min-w-0 break-words font-medium text-fg underline-offset-2 hover:underline">
                    {fill(t.suggestion, { code: s.dossierCode, partner: s.partner })}
                  </Link>
                  <Badge tone="primary" size="sm">{t[`reason${s.reason}`]}</Badge>
                </div>
              </div>
            ) : (
              <span />
            )}
            {canFile && (
              <div className="flex flex-wrap items-center gap-2 cq-lg:shrink-0 cq-lg:justify-end">
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
