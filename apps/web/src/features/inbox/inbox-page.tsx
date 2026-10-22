"use client";
// Hộp thư chứng từ: email có file đính kèm lấy từ Gmail / Outlook đã kết nối; xếp file vào hồ sơ (có gợi ý hồ sơ khớp) hoặc bỏ qua.
import type { InboxMessage, InboxMessageStatus } from "@kb/contracts";
import { Alert, Button, EmptyState, fill, PageHeader, SkeletonTable, Stack, Tabs, TabsContent, TabsList, TabsTrigger, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MailPlus, RefreshCw, Settings2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { inboxKeys, listInbox, mailboxKeys, requestMailSync, setInboxMessageStatus } from "@/api/mailbox";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { AddToDossierDialog, pendingAttachments, useAddToDossier } from "./add-to-dossier";
import { InboxMessageDetail, type InboxActions } from "./inbox-message-detail";
import { InboxTable } from "./inbox-table";
import { INBOX_MESSAGES } from "./inbox.messages";
import { isSyncing, useMailboxOverview, useMailboxSession } from "./use-mailbox";

const FILTERS = ["NEW", "DONE", "IGNORED"] as const satisfies readonly InboxMessageStatus[];
const SETTINGS_HREF = "/settings?tab=integrations";

export function InboxPage() {
  const t = useMessages(INBOX_MESSAGES);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Bộ lọc nằm trên URL (?status=done|ignored) để F5 / chia sẻ link vẫn đúng; đổi bằng history API cho tức thì (không tải lại trang).
  const [status, setStatusFilter] = useState<InboxMessageStatus>(() => FILTERS.find((f) => f.toLowerCase() === params.get("status")) ?? "NEW");
  const [dialogFor, setDialogFor] = useState<InboxMessage | null>(null);
  // Giữ id (không giữ bản sao) để chi tiết cập nhật theo danh sách sau khi xếp file / bỏ qua.
  const [detailId, setDetailId] = useState<string | null>(null);

  const { canUse, session } = useMailboxSession();
  const overview = useMailboxOverview();
  const syncing = isSyncing(overview.data);
  // Đang lấy thư → hỏi lại danh sách email cùng nhịp để email mới hiện ngay khi lấy xong.
  const inbox = useQuery({ queryKey: inboxKeys.list, queryFn: listInbox, refetchInterval: syncing ? 2000 : false });
  const connections = overview.data?.connections ?? [];
  const reauth = connections.filter((c) => c.status === "REAUTH");

  const counts = useMemo(() => {
    const c: Record<InboxMessageStatus, number> = { NEW: 0, DONE: 0, IGNORED: 0 };
    for (const m of inbox.data ?? []) c[m.status]++;
    return c;
  }, [inbox.data]);
  const visible = useMemo(() => (inbox.data ?? []).filter((m) => m.status === status), [inbox.data, status]);
  const detail = (detailId && inbox.data?.find((m) => m.id === detailId)) || null;

  const sync = useMutation({
    mutationFn: () => requestMailSync(),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: mailboxKeys.overview });
      if (r.queued === 0) toast({ tone: "warning", title: t.fetchNone });
    },
    onError: toastMutationError(t.fetchFailed),
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "NEW" | "IGNORED" }) => setInboxMessageStatus(v.id, v.status),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: inboxKeys.all });
      toast({ tone: "success", title: v.status === "IGNORED" ? t.ignored : t.restored });
    },
    onError: toastMutationError(t.statusFailed),
  });
  const quickAdd = useAddToDossier();

  const actions: InboxActions = {
    canUse,
    addingId: quickAdd.isPending ? (quickAdd.variables?.messageId ?? null) : null,
    onAddToSuggested: (m) => m.suggestion && quickAdd.mutate({ messageId: m.id, dossierId: m.suggestion.dossierId, code: m.suggestion.dossierCode, attachmentIds: pendingAttachments(m).map((a) => a.id) }),
    onAddTo: setDialogFor,
    onCreateDossier: (m) => router.push(`/dossiers/new?inbox=${encodeURIComponent(m.id)}`),
    onSetStatus: (m, s) => setStatus.mutate({ id: m.id, status: s }),
  };

  const setFilter = (v: string) => {
    const f = FILTERS.find((x) => x === v) ?? "NEW";
    setStatusFilter(f);
    const next = new URLSearchParams(window.location.search);
    if (f === "NEW") next.delete("status");
    else next.set("status", f.toLowerCase());
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };

  const loading = inbox.isLoading || overview.isLoading;
  const noMailbox = !loading && !overview.isError && connections.length === 0 && (inbox.data?.length ?? 0) === 0;
  const emptyFor: Record<InboxMessageStatus, [string, string]> = {
    NEW: [t.emptyNewTitle, t.emptyNewBody],
    DONE: [t.emptyDoneTitle, t.emptyDoneBody],
    IGNORED: [t.emptyIgnoredTitle, t.emptyIgnoredBody],
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          canUse && connections.length > 0 && (
            <Button leftIcon={<RefreshCw className="h-4 w-4" />} loading={syncing || sync.isPending} onClick={() => sync.mutate()}>
              {syncing ? t.fetching : t.fetch}
            </Button>
          )
        }
      />
      {(inbox.isError || overview.isError) && (
        <LoadError title={t.loadError} onRetry={() => { void inbox.refetch(); void overview.refetch(); }} />
      )}
      {session && !canUse && <Alert tone="info">{t.readOnly}</Alert>}
      {reauth.map((c) => (
        <Alert key={c.id} tone="warning" action={<Button size="sm" variant="secondary" asChild><Link href={SETTINGS_HREF}>{t.openSettings}</Link></Button>}>
          {fill(t.reauthAlert, { email: c.email })}
        </Alert>
      ))}

      {loading ? (
        <SkeletonTable rows={6} />
      ) : noMailbox ? (
        <EmptyState
          illustration="empty"
          title={t.noMailboxTitle}
          description={t.noMailboxBody}
          action={
            <Button asChild>
              <Link href={SETTINGS_HREF}>
                <MailPlus className="h-4 w-4" aria-hidden="true" />
                {t.connectMailbox}
              </Link>
            </Button>
          }
        />
      ) : (
        !inbox.isError && (
          <Tabs value={status} onValueChange={setFilter}>
            <TabsList aria-label={t.filterLabel}>
              <TabsTrigger value="NEW">{fill(t.tabNew, { n: counts.NEW })}</TabsTrigger>
              <TabsTrigger value="DONE">{fill(t.tabDone, { n: counts.DONE })}</TabsTrigger>
              <TabsTrigger value="IGNORED">{fill(t.tabIgnored, { n: counts.IGNORED })}</TabsTrigger>
            </TabsList>
            {FILTERS.map((f) => (
              <TabsContent key={f} value={f}>
                <InboxTable
                  status={f}
                  messages={visible}
                  actions={actions}
                  onOpen={(m) => setDetailId(m.id)}
                  emptyTitle={emptyFor[f][0]}
                  emptyDescription={emptyFor[f][1]}
                  {...(f === "NEW" && connections.length === 0
                    ? { emptyAction: <Button size="sm" variant="secondary" asChild><Link href={SETTINGS_HREF}><Settings2 className="h-4 w-4" aria-hidden="true" />{t.connectMailbox}</Link></Button> }
                    : {})}
                />
              </TabsContent>
            ))}
          </Tabs>
        )
      )}

      <InboxMessageDetail m={detail} actions={actions} onOpenChange={(o) => !o && setDetailId(null)} />
      <AddToDossierDialog message={dialogFor} onOpenChange={(o) => !o && setDialogFor(null)} />
    </Stack>
  );
}
