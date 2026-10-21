"use client";
import { SendAnnouncementInputSchema, type Announcement, type AnnouncementAudience, type AnnouncementKind, type PlanCode } from "@kb/contracts";
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, DatePicker, Dialog, DialogContent, DialogFooter, Field, Input, PageHeader, RowActions,
  fill, SegmentedControl, Select, Stack, StatusBadge, Textarea, useMessages, useUiLocale,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminKeys, listAdminOrgs, listAdminPlans, listAnnouncements, sendAnnouncement, withdrawAnnouncement } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { ANNOUNCEMENT_KIND_LABELS, audienceLabel, statusLabel } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { ANNOUNCEMENTS_MESSAGES } from "./announcements-page.messages";

type T = Record<keyof (typeof ANNOUNCEMENTS_MESSAGES)["vi"], string>;

type PlanNames = Partial<Record<PlanCode, string>>;
type Row = Announcement & { kindLabel: string; audienceText: string; statusText: string };
const status = (a: Announcement) => (a.status === "SENT" ? ("ANNOUNCEMENT_SENT" as const) : ("ANNOUNCEMENT_WITHDRAWN" as const));

const col = createDataTableColumnHelper<Row>();
const makeColumns = (t: T) => col.columns([
  col.accessor("title", {
    header: t.colTitle,
    size: 420,
    minSize: 260,
    meta: { hideable: false, wrap: true },
    cell: (c) => (
      <div className="flex min-w-56 flex-col gap-0.5">
        <p className="font-medium text-fg">{c.getValue()}</p>
        <p className="text-sm text-fg-muted">{c.row.original.body}</p>
        {c.row.original.maintenanceDate && <p className="text-xs text-fg-subtle">{fill(t.maintenanceDay, { date: formatDate(c.row.original.maintenanceDate) })}</p>}
      </div>
    ),
  }),
  col.accessor("kindLabel", {
    header: t.colKind,
    size: 120,
    meta: { filter: "select" },
    cell: (c) => <Badge tone={c.row.original.kind === "MAINTENANCE" ? "warning" : "info"}>{c.getValue()}</Badge>,
  }),
  col.accessor("audienceText", { header: t.colAudience, size: 180, meta: { filter: "select" } }),
  col.accessor("recipients", { header: t.colRecipients, size: 160, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("statusText", { header: t.colStatus, size: 140, cell: (c) => <StatusBadge status={status(c.row.original)} /> }),
  col.accessor("sentAt", { header: t.colSentAt, size: 160, cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.getValue())}</span> }),
  col.accessor("sentByName", { header: t.colSentBy, size: 170 }),
]);

type Draft = { kind: AnnouncementKind; title: string; body: string; audience: AnnouncementAudience; maintenanceDate: string | null };
const EMPTY: Draft = { kind: "INFO", title: "", body: "", audience: "ALL", maintenanceDate: null };

function ComposeDialog({ open, onOpenChange, planNames }: { open: boolean; onOpenChange: (o: boolean) => void; planNames: PlanNames }) {
  const t = useMessages(ANNOUNCEMENTS_MESSAGES);
  const kindLabels = useMessages(ANNOUNCEMENT_KIND_LABELS);
  const locale = useUiLocale();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<"title" | "body" | "maintenanceDate", string>>>({});
  useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setErrors({});
    }
  }, [open]);

  const orgs = useQuery({ queryKey: adminKeys.orgs, queryFn: listAdminOrgs, enabled: open });
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans, enabled: open });
  // Cùng quy tắc với lúc gửi: doanh nghiệp đang tạm khóa không nhận.
  const recipients = orgs.data?.filter((o) => o.status === "ACTIVE" && (draft.audience === "ALL" || o.plan.code === draft.audience)).length;

  const send = useAdminMutation({
    mutationFn: sendAnnouncement,
    success: (a) => fill(t.sentToast, { n: formatNumber(a.recipients) }),
    errorTitle: t.sendError,
    onSuccess: () => onOpenChange(false),
  });

  const submit = () => {
    const parsed = SendAnnouncementInputSchema.safeParse({
      title: draft.title,
      body: draft.body,
      kind: draft.kind,
      audience: draft.audience,
      ...(draft.kind === "MAINTENANCE" && draft.maintenanceDate ? { maintenanceDate: draft.maintenanceDate } : {}),
    });
    if (!parsed.success) {
      const found: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt: ngôn ngữ khác dùng nhãn theo ô.
        if (k === "title" || k === "body" || k === "maintenanceDate") {
          found[k] ??= locale === "vi" ? i.message : k === "title" ? t.titleInvalid : k === "body" ? t.bodyInvalid : t.maintenanceRequired;
        }
      }
      setErrors(found);
      return;
    }
    setErrors({});
    send.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.composeTitle} icon={<Megaphone className="h-4 w-4" />} description={t.composeDescription}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            <SegmentedControl<AnnouncementKind>
              label={t.kindLabel}
              className="justify-start"
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind })}
              options={[
                { value: "INFO", label: kindLabels.INFO },
                { value: "MAINTENANCE", label: kindLabels.MAINTENANCE },
              ]}
            />
            <Field label={t.titleField} required {...(errors.title ? { error: errors.title } : {})}>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} />
            </Field>
            <Field label={t.bodyField} required hint={t.bodyHint} {...(errors.body ? { error: errors.body } : {})}>
              <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} maxLength={1000} />
            </Field>
            {draft.kind === "MAINTENANCE" && (
              <Field label={t.maintenanceField} required className="cq-md:max-w-xs" hint={t.maintenanceHint} {...(errors.maintenanceDate ? { error: errors.maintenanceDate } : {})}>
                <DatePicker value={draft.maintenanceDate} onChange={(maintenanceDate) => setDraft({ ...draft, maintenanceDate })} />
              </Field>
            )}
            <Field
              label={t.colAudience}
              className="cq-md:max-w-xs"
              hint={recipients === undefined ? t.counting : fill(t.willReceive, { n: formatNumber(recipients) })}
            >
              <Select
                value={draft.audience}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value as AnnouncementAudience })}
                options={[{ value: "ALL", label: audienceLabel("ALL", {}, locale) }, ...(plans.data ?? []).map((p) => ({ value: p.code, label: audienceLabel(p.code, planNames, locale) }))]}
              />
            </Field>
            {recipients === 0 && <Alert tone="warning">{t.noRecipients}</Alert>}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={send.isPending} disabled={recipients === 0}>{t.send}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AnnouncementsPage() {
  const t = useMessages(ANNOUNCEMENTS_MESSAGES);
  const kindLabels = useMessages(ANNOUNCEMENT_KIND_LABELS);
  const locale = useUiLocale();
  const columns = useMemo(() => makeColumns(t), [t]);
  const { can } = useAdminSession();
  const list = useQuery({ queryKey: adminKeys.announcements, queryFn: listAnnouncements });
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans });
  const [composeOpen, setComposeOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Announcement | null>(null);
  const withdraw = useAdminMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => withdrawAnnouncement(id, { reason }),
    success: (a) => fill(t.withdrawnToast, { title: a.title }),
    errorTitle: t.withdrawError,
    onSuccess: () => setWithdrawing(null),
  });

  const planNames = useMemo<PlanNames>(() => Object.fromEntries((plans.data ?? []).map((p) => [p.code, p.name])), [plans.data]);
  const rows = useMemo<Row[]>(
    () => (list.data ?? []).map((a) => ({ ...a, kindLabel: kindLabels[a.kind], audienceText: audienceLabel(a.audience, planNames, locale), statusText: statusLabel(status(a), locale) })),
    [list.data, planNames, kindLabels, locale],
  );
  const canSend = can("SUPPORT");

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={canSend && <Button leftIcon={<Megaphone className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>{t.compose}</Button>}
      />
      {list.isError ? (
        <LoadError onRetry={() => void list.refetch()} title={t.loadError} />
      ) : (
        <DataTable
          aria-label={t.title}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.title}
          loading={list.isLoading}
          loadingRows={3}
          searchable
          pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20] }}
          emptyTitle={t.emptyTitle}
          emptyDescription={t.emptyDescription}
          {...(canSend ? { emptyAction: <Button size="sm" onClick={() => setComposeOpen(true)}>{t.compose}</Button> } : {})}
          {...(canSend
            ? {
                rowActions: (r: Row) => (
                  <RowActions
                    rowLabel={r.title}
                    actions={[{ id: "withdraw", label: t.withdraw, icon: <Undo2 />, tone: "danger" as const, disabled: r.status === "WITHDRAWN", onSelect: () => setWithdrawing(r) }]}
                  />
                ),
              }
            : {})}
        />
      )}

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} planNames={planNames} />

      <ReasonDialog
        open={withdrawing !== null}
        onOpenChange={(o) => !o && setWithdrawing(null)}
        title={t.withdrawTitle}
        icon={<Undo2 className="h-4 w-4" />}
        description={withdrawing?.title}
        confirmLabel={t.withdraw}
        tone="danger"
        pending={withdraw.isPending}
        onConfirm={(reason) => withdrawing && withdraw.mutate({ id: withdrawing.id, reason })}
      >
        <Alert tone="warning">{t.withdrawWarning}</Alert>
      </ReasonDialog>
    </Stack>
  );
}
