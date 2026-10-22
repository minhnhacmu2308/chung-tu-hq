"use client";
// Bảng email chứng từ (một trạng thái): sắp theo thời gian nhận, tìm / lọc / phân trang; bấm dòng → chi tiết.
import type { InboxMessage, InboxMessageStatus } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, type DataTableColumnVisibility, fill, RowActions, useMessages, type RowAction } from "@kb/ui";
import { Eye, EyeOff, FilePlus2, FolderInput, Info, Paperclip, RotateCcw } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { pendingAttachments } from "./add-to-dossier";
import { openAttachment, type InboxActions } from "./inbox-message-detail";
import { INBOX_MESSAGES } from "./inbox.messages";

type Messages = Record<keyof (typeof INBOX_MESSAGES)["vi"], string>;
type Kinds = Record<keyof (typeof DOC_KIND_LABELS)["vi"], string>;
/** Cột chuỗi phụ cho ô tìm kiếm: tên file + loại chứng từ + gợi ý. */
type Row = InboxMessage & { files: string; suggestionText: string; added: number };

const col = createDataTableColumnHelper<Row>();

function buildColumns(t: Messages, kinds: Kinds) {
  const dash = <span className="text-fg-subtle">—</span>;
  return col.columns([
    col.accessor("subject", {
      header: t.colSubject,
      size: 360,
      minSize: 220,
      meta: { wrap: true, hideable: false },
      cell: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="line-clamp-2 text-fg">{c.getValue()}</span>
          {c.row.original.snippet && <span className="line-clamp-1 text-xs text-fg-muted">{c.row.original.snippet}</span>}
        </div>
      ),
    }),
    col.accessor("receivedAt", {
      header: t.colReceived,
      size: 140,
      cell: (c) => (
        <div className="flex flex-col">
          <time dateTime={c.getValue()} className="text-fg">{formatRelative(c.getValue())}</time>
          <span className="text-xs text-fg-muted">{formatDateTime(c.getValue())}</span>
        </div>
      ),
    }),
    col.accessor("fromName", {
      header: t.colFrom,
      size: 220,
      meta: { filter: "select", wrap: true },
      cell: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-fg">{c.getValue()}</span>
          <span className="truncate text-xs text-fg-muted">{c.row.original.fromEmail}</span>
        </div>
      ),
    }),
    col.accessor("files", {
      header: t.colFiles,
      size: 200,
      meta: { wrap: true },
      cell: (c) => {
        const m = c.row.original;
        const kindsShown = [...new Set(m.attachments.map((a) => kinds[a.kindGuess]))];
        return (
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1 text-fg">
              <Paperclip className="h-3.5 w-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
              {fill(t.filesCount, { n: m.attachments.length })}
              {m.added > 0 && m.added < m.attachments.length && <span className="text-xs text-fg-muted">{fill(t.filesAdded, { added: m.added, n: m.attachments.length })}</span>}
            </span>
            <span className="line-clamp-1 text-xs text-fg-muted" title={m.files}>{kindsShown.join(", ")}</span>
          </div>
        );
      },
    }),
    col.accessor("suggestionText", {
      header: t.colSuggestion,
      size: 230,
      meta: { wrap: true },
      cell: (c) => {
        const s = c.row.original.suggestion;
        if (!s) return dash;
        return (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <span className="line-clamp-1 font-mono text-fg">{s.dossierCode}</span>
            <Badge tone="primary" size="sm">{t[`reason${s.reason}`]}</Badge>
          </div>
        );
      },
    }),
    col.accessor("mailbox", { header: t.colMailbox, size: 200, meta: { filter: "select" } }),
  ]);
}

export function InboxTable({
  status, messages, actions, onOpen, emptyTitle, emptyDescription, emptyAction,
}: {
  status: InboxMessageStatus;
  messages: InboxMessage[];
  actions: InboxActions;
  onOpen: (m: InboxMessage) => void;
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: ReactNode;
}) {
  const t = useMessages(INBOX_MESSAGES);
  const kinds = useMessages(DOC_KIND_LABELS);
  const columns = useMemo(() => buildColumns(t, kinds), [t, kinds]);
  // Trang cha gắn key theo trạng thái → mỗi tab có bộ cột riêng (gợi ý chỉ có ý nghĩa ở mục Mới); người dùng bật/tắt lại được.
  const [visibility, setVisibility] = useState<DataTableColumnVisibility>(() => ({ mailbox: false, ...(status === "NEW" ? {} : { suggestionText: false }) }));
  const rows = useMemo<Row[]>(
    () =>
      messages.map((m) => ({
        ...m,
        files: m.attachments.map((a) => `${a.fileName} ${kinds[a.kindGuess]}`).join(" "),
        suggestionText: m.suggestion ? `${m.suggestion.dossierCode} ${m.suggestion.partner}` : "",
        added: m.attachments.filter((a) => a.status === "ADDED").length,
      })),
    [messages, kinds],
  );

  const rowActions = (m: Row) => {
    const canFile = actions.canUse && m.status === "NEW" && pendingAttachments(m).length > 0;
    const list: RowAction[] = [
      { id: "detail", label: t.viewDetail, icon: <Info />, onSelect: () => onOpen(m) },
      ...(canFile && m.suggestion ? [{ id: "suggested", label: fill(t.addToCode, { code: m.suggestion.dossierCode }), icon: <FolderInput />, onSelect: () => actions.onAddToSuggested(m) }] : []),
      ...(canFile ? [{ id: "add", label: t.addToDossier, icon: <FolderInput />, onSelect: () => actions.onAddTo(m), quick: false }] : []),
      ...(canFile ? [{ id: "create", label: t.createDossier, icon: <FilePlus2 />, onSelect: () => actions.onCreateDossier(m), quick: false }] : []),
      ...(actions.canUse && m.status === "NEW" ? [{ id: "ignore", label: t.ignore, icon: <EyeOff />, onSelect: () => actions.onSetStatus(m, "IGNORED"), quick: false }] : []),
      ...(actions.canUse && m.status === "IGNORED" ? [{ id: "restore", label: t.restore, icon: <RotateCcw />, onSelect: () => actions.onSetStatus(m, "NEW") }] : []),
      ...m.attachments.map((a) => ({ id: `view-${a.id}`, label: fill(t.viewFile, { name: a.fileName }), icon: <Eye />, onSelect: () => openAttachment(a.id), quick: false })),
    ];
    return <RowActions rowLabel={m.subject} actions={list} />;
  };

  return (
    <DataTable
      aria-label={t.listLabel}
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      rowLabel={(r) => r.subject}
      searchable
      columnToggle
      resizable
      initialSorting={[{ id: "receivedAt", desc: true }]}
      columnVisibility={visibility}
      onColumnVisibilityChange={setVisibility}
      pagination={{ initialPageSize: 20, pageSizeOptions: [10, 20, 50, 100] }}
      onRowClick={onOpen}
      rowActions={rowActions}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      {...(emptyAction ? { emptyAction } : {})}
      labels={{ searchPlaceholder: t.searchPlaceholder }}
    />
  );
}
