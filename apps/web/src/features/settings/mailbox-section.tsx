"use client";
// Tài khoản & tích hợp → Hộp thư chứng từ: kết nối Gmail / Outlook (OAuth, chỉ quyền đọc), lấy thư, kết nối lại, gỡ kết nối.
// Callback OAuth chuyển về /settings?tab=integrations&mailbox=connected|error… → báo kết quả rồi xóa tham số khỏi URL.
import type { MailConnection, MailProvider } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogClose, DialogContent, DialogFooter, EmptyState, fill,
  IconTile, SkeletonList, Stack, StatusBadge, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail, MailPlus, PlugZap, RefreshCw, Unplug } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { disconnectMailbox, mailboxKeys, requestMailSync, startMailConnect } from "@/api/mailbox";
import { LoadError } from "@/components/common/load-error";
import { useMailboxOverview, useMailboxSession } from "@/features/inbox/use-mailbox";
import { formatDateTime, formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { reasonText } from "@/lib/reason-codes";
import { MAILBOX_SECTION_MESSAGES } from "./mailbox-section.messages";

// kb-allow-raw: tên sản phẩm của Google / Microsoft (tên riêng, không dịch)
const PROVIDER_NAME: Record<MailProvider, string> = { GMAIL: "Gmail", OUTLOOK: "Outlook" };
const STATUS = { ACTIVE: "MAILBOX_ACTIVE", SYNCING: "MAILBOX_SYNCING", ERROR: "MAILBOX_ERROR", REAUTH: "MAILBOX_REAUTH" } as const;

/** Kết quả callback OAuth trên URL → toast một lần, rồi bỏ tham số (F5 không báo lại). */
function useConnectCallbackToast() {
  const t = useMessages(MAILBOX_SECTION_MESSAGES);
  const locale = useUiLocale();
  const params = useSearchParams();
  const pathname = usePathname();
  const qc = useQueryClient();
  const result = params.get("mailbox");
  useEffect(() => {
    if (result !== "connected" && result !== "error") return;
    const email = params.get("email") ?? "";
    if (result === "connected") toast({ tone: "success", title: fill(t.connected, { email }), description: t.connectedHint });
    else {
      const provider = params.get("provider");
      // Server gửi tên hiển thị ("Gmail" / "Outlook", tham số của mã lý do) – nhận cả mã GMAIL / OUTLOOK.
      const code = provider?.toUpperCase();
      const name = code === "GMAIL" || code === "OUTLOOK" ? PROVIDER_NAME[code] : "";
      toast({ tone: "danger", title: t.connectError, description: reasonText(params.get("reason") ?? "MAILBOX_AUTH_FAILED", { provider: name, email }, t.connectFailed, locale) });
    }
    void qc.invalidateQueries({ queryKey: mailboxKeys.overview });
    const next = new URLSearchParams(params.toString());
    for (const k of ["mailbox", "email", "reason", "provider"]) next.delete(k);
    // History API: bỏ tham số ngay, không tải lại trang (Next đồng bộ useSearchParams).
    window.history.replaceState(null, "", `${pathname}?${next.toString()}`);
    // Chỉ chạy khi tham số kết quả xuất hiện.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
}

function ConnectionRow({ c, onSync, onConnect, onDisconnect, syncPending, canUse, canDisconnect }: {
  c: MailConnection;
  onSync: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  syncPending: boolean;
  canUse: boolean;
  canDisconnect: boolean;
}) {
  const t = useMessages(MAILBOX_SECTION_MESSAGES);
  const locale = useUiLocale();
  const broken = c.status === "REAUTH" || c.status === "ERROR";
  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex items-start gap-3">
        <IconTile icon={<Mail />} size="md" tone={c.status === "ACTIVE" || c.status === "SYNCING" ? "primary" : "neutral"} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-all text-sm font-medium text-fg">{c.email}</span>
            <Badge tone="neutral" size="sm">{PROVIDER_NAME[c.provider]}</Badge>
            <StatusBadge status={STATUS[c.status]} />
          </div>
          <p className="text-xs text-fg-muted">
            {c.lastSyncedAt ? (
              <time dateTime={c.lastSyncedAt} title={formatDateTime(c.lastSyncedAt)}>{fill(t.lastSynced, { when: formatRelative(c.lastSyncedAt), n: c.lastSyncCount })}</time>
            ) : (
              t.neverSynced
            )}
            <span aria-hidden="true"> · </span>
            {fill(t.connectedBy, { name: c.connectedByName })}
          </p>
        </div>
      </div>
      {broken && c.lastError && <Alert tone={c.status === "REAUTH" ? "warning" : "danger"}>{reasonText(c.lastError, { email: c.email }, undefined, locale)}</Alert>}
      {canUse && (
        <div className="flex flex-wrap items-center gap-2">
          {c.status !== "REAUTH" && (
            <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} loading={c.status === "SYNCING" || syncPending} onClick={onSync}>{t.sync}</Button>
          )}
          {broken && <Button size="sm" leftIcon={<PlugZap className="h-4 w-4" />} onClick={onConnect}>{t.reconnect}</Button>}
          {canDisconnect && <Button size="sm" variant="ghost" leftIcon={<Unplug className="h-4 w-4" />} onClick={onDisconnect}>{t.disconnect}</Button>}
        </div>
      )}
    </li>
  );
}

export function MailboxSection() {
  const t = useMessages(MAILBOX_SECTION_MESSAGES);
  const qc = useQueryClient();
  useConnectCallbackToast();
  const { canUse, canDisconnect } = useMailboxSession();
  const overview = useMailboxOverview();
  const [removing, setRemoving] = useState<MailConnection | null>(null);

  const connect = useMutation({
    mutationFn: (provider: MailProvider) => startMailConnect(provider),
    // Trang đồng ý của Google / Microsoft (mock: quay về ngay trang này kèm kết quả).
    onSuccess: (r) => window.location.assign(r.url),
    onError: toastMutationError(t.connectFailed),
  });
  const sync = useMutation({
    mutationFn: (c: MailConnection) => requestMailSync(c.id),
    onSuccess: (_r, c) => {
      void qc.invalidateQueries({ queryKey: mailboxKeys.overview });
      toast({ tone: "info", title: fill(t.syncStarted, { email: c.email }) });
    },
    onError: toastMutationError(t.syncFailed),
  });
  const remove = useMutation({
    mutationFn: (c: MailConnection) => disconnectMailbox(c.id),
    onSuccess: (_r, c) => {
      void qc.invalidateQueries({ queryKey: mailboxKeys.overview });
      toast({ tone: "success", title: fill(t.disconnected, { email: c.email }) });
      setRemoving(null);
    },
    onError: toastMutationError(t.disconnectFailed),
  });

  const providers = overview.data?.providers ?? [];
  const connections = overview.data?.connections ?? [];
  const unconfigured = providers.filter((p) => !p.configured);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <IconTile icon={<Inbox />} />
          <div className="min-w-0 flex-1">
            <CardTitle as="h3">{t.title}</CardTitle>
            <CardDescription>{t.description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-fg-muted">
            <li>{t.pointReadOnly}</li>
            <li>{t.pointFilter}</li>
            <li>{t.pointSince}</li>
          </ul>

          {overview.isError ? (
            <LoadError onRetry={() => void overview.refetch()} />
          ) : overview.isLoading ? (
            <SkeletonList rows={2} />
          ) : (
            <>
              {canUse ? (
                <Stack gap="sm">
                  <div className="flex flex-wrap gap-2">
                    {(["GMAIL", "OUTLOOK"] as const).map((p) => (
                      <Button
                        key={p}
                        variant="secondary"
                        leftIcon={<MailPlus className="h-4 w-4" />}
                        disabled={!providers.find((x) => x.provider === p)?.configured}
                        loading={connect.isPending && connect.variables === p}
                        onClick={() => connect.mutate(p)}
                      >
                        {p === "GMAIL" ? t.connectGmail : t.connectOutlook}
                      </Button>
                    ))}
                  </div>
                  {unconfigured.map((p) => (
                    <p key={p.provider} className="text-xs text-fg-subtle">{fill(t.notConfigured, { provider: PROVIDER_NAME[p.provider] })}</p>
                  ))}
                </Stack>
              ) : (
                <p className="text-sm text-fg-subtle">{t.viewerHint}</p>
              )}

              {connections.length ? (
                <ul aria-label={t.listLabel} className="flex flex-col gap-2">
                  {connections.map((c) => (
                    <ConnectionRow
                      key={c.id}
                      c={c}
                      canUse={canUse}
                      canDisconnect={canUse && canDisconnect(c.connectedBy)}
                      syncPending={sync.isPending && sync.variables?.id === c.id}
                      onSync={() => sync.mutate(c)}
                      onConnect={() => connect.mutate(c.provider)}
                      onDisconnect={() => setRemoving(c)}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<Mail />} title={t.empty} description={t.emptyHint} className="py-6" />
              )}

              {connections.length > 0 && (
                <div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/inbox">
                      <Inbox className="h-4 w-4" aria-hidden="true" />
                      {t.openInbox}
                    </Link>
                  </Button>
                </div>
              )}
            </>
          )}
        </Stack>
      </CardContent>

      <Dialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent title={t.disconnectTitle} size="sm" icon={<Unplug className="h-4 w-4" />}>
          <form onSubmit={(e) => { e.preventDefault(); if (removing) remove.mutate(removing); }}>
            <p className="text-sm text-fg-muted">{fill(t.disconnectBody, { email: removing?.email ?? "" })}</p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">{t.keep}</Button>
              </DialogClose>
              <Button type="submit" variant="danger" loading={remove.isPending}>{t.disconnect}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
