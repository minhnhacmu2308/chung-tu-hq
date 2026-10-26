"use client";
// Gửi email: các đợt đã gửi (kết quả từng người) + nút soạn email mới.
import type { EmailCampaign } from "@kb/contracts";
import {
  Alert, Button, createDataTableColumnHelper, DataTable, Dialog, DialogContent, fill, HtmlPreview, PageHeader, Stack, StatusBadge, useMessages, type Status,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Mail, PenSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { adminKeys, getEmailCampaign, getMailSettings, listEmailCampaigns } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useAdminSession } from "../shell/use-admin-session";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

type M = Record<keyof (typeof EMAIL_PAGES_MESSAGES)["vi"], string>;
const STATUS: Record<EmailCampaign["status"], Status> = { QUEUED: "EMAIL_QUEUED", SENDING: "EMAIL_SENDING", SENT: "EMAIL_SENT", PARTIAL: "EMAIL_PARTIAL", FAILED: "EMAIL_FAILED" };
const RECIPIENT: Record<"PENDING" | "SENT" | "FAILED", Status> = { PENDING: "EMAIL_QUEUED", SENT: "EMAIL_SENT", FAILED: "EMAIL_FAILED" };

const col = createDataTableColumnHelper<EmailCampaign>();
const makeColumns = (t: M) =>
  col.columns([
    col.accessor("subject", { header: t.colSubject, size: 320, meta: { wrap: true, hideable: false }, cell: (c) => <span className="font-medium text-fg">{c.getValue()}</span> }),
    col.accessor("audienceLabel", { header: t.colAudience, size: 260, meta: { wrap: true } }),
    col.accessor("status", { header: t.colStatus, size: 140, cell: (c) => <StatusBadge status={STATUS[c.getValue()]} /> }),
    col.accessor("sent", {
      header: t.colResult,
      size: 150,
      cell: (c) => (
        <div className="flex flex-col">
          <span className="tabular-nums text-fg">{fill(t.resultN, { sent: c.row.original.sent, total: c.row.original.total })}</span>
          {c.row.original.failed > 0 && <span className="text-xs text-danger-subtle-fg">{fill(t.failedN, { n: c.row.original.failed })}</span>}
        </div>
      ),
    }),
    col.accessor("sentByName", { header: t.colBy, size: 170 }),
    col.accessor("createdAt", { header: t.colAt, size: 150, cell: (c) => <time dateTime={c.getValue()} title={formatDateTime(c.getValue())}>{formatRelative(c.getValue())}</time> }),
  ]);

function CampaignDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const q = useQuery({ queryKey: adminKeys.emailCampaign(id ?? ""), queryFn: () => getEmailCampaign(id!), enabled: !!id });
  const c = q.data;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()} defaultPresentation="panel">
      <DialogContent title={c?.subject ?? t.detail} description={c ? `${c.audienceLabel} · ${formatDateTime(c.createdAt)}` : undefined} icon={<Mail className="h-4 w-4" />} size="lg">
        {q.isError ? (
          <LoadError onRetry={() => void q.refetch()} title={t.loadError} />
        ) : c ? (
          <Stack gap="lg">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={STATUS[c.status]} />
              <span className="text-sm tabular-nums text-fg">{fill(t.resultN, { sent: c.sent, total: c.total })}</span>
              {c.failed > 0 && <span className="text-sm text-danger-subtle-fg">{fill(t.failedN, { n: c.failed })}</span>}
            </div>
            <HtmlPreview title={t.detail} html={c.html} className="h-120" />
            <section aria-label={t.recipients} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-fg">{t.recipients}</h3>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
                {c.recipients.map((r) => (
                  <li key={r.email} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="flex min-w-0 flex-col">
                      <span className="text-fg">{r.name} <span className="text-fg-muted">· {r.email}</span></span>
                      {r.orgName && <span className="text-xs text-fg-muted">{r.orgName}</span>}
                      {r.error && <span className="text-xs text-danger-subtle-fg">{r.error}</span>}
                    </div>
                    <StatusBadge status={RECIPIENT[r.status]} />
                  </li>
                ))}
              </ul>
            </section>
          </Stack>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function EmailCampaignsPage() {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const router = useRouter();
  const { can } = useAdminSession();
  const columns = useMemo(() => makeColumns(t), [t]);
  const campaigns = useQuery({ queryKey: adminKeys.emailCampaigns, queryFn: listEmailCampaigns, refetchInterval: (q) => (q.state.data?.some((c) => c.status === "QUEUED" || c.status === "SENDING") ? 3000 : false) });
  const settings = useQuery({ queryKey: adminKeys.mailSettings, queryFn: getMailSettings, enabled: can("PLATFORM") });
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Stack gap="lg">
      <PageHeader
        title={t.campaignsTitle}
        description={t.campaignsDesc}
        actions={can("SUPPORT") && <Button leftIcon={<PenSquare className="h-4 w-4" />} onClick={() => router.push("/admin/email/compose")}>{t.compose}</Button>}
      />
      {settings.data && !settings.data.configured && (
        <Alert tone="warning" action={<Button asChild size="sm" variant="secondary"><Link href="/admin/email/settings">{t.configureNow}</Link></Button>}>{t.notConfigured}</Alert>
      )}
      {campaigns.isError ? (
        <LoadError onRetry={() => void campaigns.refetch()} title={t.loadError} />
      ) : (
        <DataTable
          aria-label={t.campaignsTitle}
          columns={columns}
          data={campaigns.data ?? []}
          getRowId={(c) => c.id}
          rowLabel={(c) => c.subject}
          loading={campaigns.isLoading}
          searchable
          initialSorting={[{ id: "createdAt", desc: true }]}
          onRowClick={(c) => setOpenId(c.id)}
          emptyTitle={t.noCampaigns}
          emptyDescription={t.noCampaignsDesc}
        />
      )}
      <CampaignDialog id={openId} onClose={() => setOpenId(null)} />
    </Stack>
  );
}
