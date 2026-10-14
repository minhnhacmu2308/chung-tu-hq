"use client";
import { SendAnnouncementInputSchema, type Announcement, type AnnouncementAudience, type AnnouncementKind, type PlanCode } from "@kb/contracts";
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, DatePicker, Dialog, DialogContent, DialogFooter, Field, Input, PageHeader, RowActions,
  SegmentedControl, Select, Stack, StatusBadge, Textarea,
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

type PlanNames = Partial<Record<PlanCode, string>>;
type Row = Announcement & { kindLabel: string; audienceText: string; statusText: string };
const status = (a: Announcement) => (a.status === "SENT" ? "ANNOUNCEMENT_SENT" : "ANNOUNCEMENT_WITHDRAWN");

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("title", {
    header: "Thông báo",
    size: 420,
    minSize: 260,
    meta: { hideable: false, wrap: true },
    cell: (c) => (
      <div className="flex min-w-56 flex-col gap-0.5">
        <p className="font-medium text-fg">{c.getValue()}</p>
        <p className="text-sm text-fg-muted">{c.row.original.body}</p>
        {c.row.original.maintenanceDate && <p className="text-xs text-fg-subtle">Ngày bảo trì: {formatDate(c.row.original.maintenanceDate)}</p>}
      </div>
    ),
  }),
  col.accessor("kindLabel", {
    header: "Loại",
    size: 120,
    meta: { filter: "select" },
    cell: (c) => <Badge tone={c.row.original.kind === "MAINTENANCE" ? "warning" : "info"}>{c.getValue()}</Badge>,
  }),
  col.accessor("audienceText", { header: "Gửi tới", size: 180, meta: { filter: "select" } }),
  col.accessor("recipients", { header: "Doanh nghiệp nhận", size: 160, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("statusText", { header: "Trạng thái", size: 140, cell: (c) => <StatusBadge status={status(c.row.original)} /> }),
  col.accessor("sentAt", { header: "Gửi lúc", size: 160, cell: (c) => <span className="whitespace-nowrap text-fg-muted">{formatDateTime(c.getValue())}</span> }),
  col.accessor("sentByName", { header: "Người gửi", size: 170 }),
]);

type Draft = { kind: AnnouncementKind; title: string; body: string; audience: AnnouncementAudience; maintenanceDate: string | null };
const EMPTY: Draft = { kind: "INFO", title: "", body: "", audience: "ALL", maintenanceDate: null };

function ComposeDialog({ open, onOpenChange, planNames }: { open: boolean; onOpenChange: (o: boolean) => void; planNames: PlanNames }) {
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
    success: (a) => `Đã gửi tới ${formatNumber(a.recipients)} doanh nghiệp`,
    errorTitle: "Không gửi được thông báo",
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
        if (k === "title" || k === "body" || k === "maintenanceDate") found[k] ??= i.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    send.mutate(parsed.data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Soạn thông báo hệ thống" icon={<Megaphone className="h-4 w-4" />} description="Hiện trong panel Thông báo của mọi thành viên thuộc doanh nghiệp nhận.">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            <SegmentedControl<AnnouncementKind>
              label="Loại thông báo"
              className="justify-start"
              value={draft.kind}
              onChange={(kind) => setDraft({ ...draft, kind })}
              options={[
                { value: "INFO", label: ANNOUNCEMENT_KIND_LABELS.INFO },
                { value: "MAINTENANCE", label: ANNOUNCEMENT_KIND_LABELS.MAINTENANCE },
              ]}
            />
            <Field label="Tiêu đề" required {...(errors.title ? { error: errors.title } : {})}>
              <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={120} />
            </Field>
            <Field label="Nội dung" required hint="Viết cho người dùng cuối: chuyện gì, khi nào, họ cần làm gì." {...(errors.body ? { error: errors.body } : {})}>
              <Textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={4} maxLength={1000} />
            </Field>
            {draft.kind === "MAINTENANCE" && (
              <Field label="Ngày bảo trì" required className="cq-md:max-w-xs" hint="Giờ cụ thể ghi trong nội dung." {...(errors.maintenanceDate ? { error: errors.maintenanceDate } : {})}>
                <DatePicker value={draft.maintenanceDate} onChange={(maintenanceDate) => setDraft({ ...draft, maintenanceDate })} />
              </Field>
            )}
            <Field
              label="Gửi tới"
              className="cq-md:max-w-xs"
              hint={recipients === undefined ? "Đang đếm doanh nghiệp nhận…" : `${formatNumber(recipients)} doanh nghiệp sẽ nhận (không tính doanh nghiệp đang tạm khóa).`}
            >
              <Select
                value={draft.audience}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value as AnnouncementAudience })}
                options={[{ value: "ALL", label: audienceLabel("ALL") }, ...(plans.data ?? []).map((p) => ({ value: p.code, label: audienceLabel(p.code, planNames) }))]}
              />
            </Field>
            {recipients === 0 && <Alert tone="warning">Không có doanh nghiệp nào thuộc nhóm này – chọn nhóm khác.</Alert>}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={send.isPending} disabled={recipients === 0}>Gửi thông báo</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AnnouncementsPage() {
  const { can } = useAdminSession();
  const list = useQuery({ queryKey: adminKeys.announcements, queryFn: listAnnouncements });
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans });
  const [composeOpen, setComposeOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Announcement | null>(null);
  const withdraw = useAdminMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => withdrawAnnouncement(id, { reason }),
    success: (a) => `Đã thu hồi “${a.title}”`,
    errorTitle: "Không thu hồi được thông báo",
    onSuccess: () => setWithdrawing(null),
  });

  const planNames = useMemo<PlanNames>(() => Object.fromEntries((plans.data ?? []).map((p) => [p.code, p.name])), [plans.data]);
  const rows = useMemo<Row[]>(
    () => (list.data ?? []).map((a) => ({ ...a, kindLabel: ANNOUNCEMENT_KIND_LABELS[a.kind], audienceText: audienceLabel(a.audience, planNames), statusText: statusLabel(status(a)) })),
    [list.data, planNames],
  );
  const canSend = can("SUPPORT");

  return (
    <Stack gap="lg">
      <PageHeader
        title="Thông báo hệ thống"
        description="Thông báo và lịch bảo trì gửi tới khách hàng. Người dùng thấy trong panel Thông báo của ứng dụng."
        actions={canSend && <Button leftIcon={<Megaphone className="h-4 w-4" />} onClick={() => setComposeOpen(true)}>Soạn thông báo</Button>}
      />
      {list.isError ? (
        <LoadError onRetry={() => void list.refetch()} title="Không tải được danh sách thông báo" />
      ) : (
        <DataTable
          aria-label="Thông báo hệ thống"
          columns={COLUMNS}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.title}
          loading={list.isLoading}
          loadingRows={3}
          searchable
          pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20] }}
          emptyTitle="Chưa gửi thông báo nào"
          emptyDescription="Soạn thông báo khi có tính năng mới hoặc lịch bảo trì."
          {...(canSend ? { emptyAction: <Button size="sm" onClick={() => setComposeOpen(true)}>Soạn thông báo</Button> } : {})}
          {...(canSend
            ? {
                rowActions: (r: Row) => (
                  <RowActions
                    rowLabel={r.title}
                    actions={[{ id: "withdraw", label: "Thu hồi", icon: <Undo2 />, tone: "danger" as const, disabled: r.status === "WITHDRAWN", onSelect: () => setWithdrawing(r) }]}
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
        title="Thu hồi thông báo?"
        icon={<Undo2 className="h-4 w-4" />}
        description={withdrawing?.title}
        confirmLabel="Thu hồi"
        tone="danger"
        pending={withdraw.isPending}
        onConfirm={(reason) => withdrawing && withdraw.mutate({ id: withdrawing.id, reason })}
      >
        <Alert tone="warning">Thông báo biến mất khỏi panel của khách. Người đã đọc rồi thì không thu hồi được điều họ đã thấy.</Alert>
      </ReasonDialog>
    </Stack>
  );
}
