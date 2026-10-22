"use client";
import { InviteStaffInputSchema, staffCan, type AdminPermission, type Staff, type StaffRole } from "@kb/contracts";
import {
  Alert, Avatar, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Dialog, DialogContent,
  Badge, DialogFooter, Field, fill, Input, PageHeader, RowActions, Select, Stack, StatusBadge, useMessages, useUiLocale,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Lock, LockOpen, ShieldOff, UserCog, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminKeys, changeStaffRole, inviteStaff, listStaff, resetStaffMfa, setStaffDisabled } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { PermissionMatrix } from "@/components/common/permission-matrix";
import { formatRelative } from "@/lib/format";
import { ACCOUNT_STATUS, PERMISSION_LABELS, PERMISSION_ORDER, STAFF_ROLE_LABELS, STAFF_ROLE_ORDER, statusLabel } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { STAFF_PAGE_MESSAGES } from "./staff-page.messages";

type Row = Staff & { roleLabel: string; statusText: string };
const staffAllowed = (permission: string, role: string) => staffCan(role as StaffRole, permission as AdminPermission);

function useRoleOptions() {
  const roleLabels = useMessages(STAFF_ROLE_LABELS);
  return useMemo(() => STAFF_ROLE_ORDER.map((r) => ({ value: r, label: roleLabels[r] })), [roleLabels]);
}

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useMessages(STAFF_PAGE_MESSAGES);
  const roleOptions = useRoleOptions();
  const [draft, setDraft] = useState({ name: "", email: "", role: "SUPPORT" as StaffRole });
  const [errors, setErrors] = useState<Partial<Record<"name" | "email", string>>>({});
  useEffect(() => {
    if (open) {
      setDraft({ name: "", email: "", role: "SUPPORT" });
      setErrors({});
    }
  }, [open]);
  const invite = useAdminMutation({
    mutationFn: inviteStaff,
    success: (s) => fill(t.inviteSent, { email: s.email }),
    errorTitle: t.inviteError,
    onSuccess: () => onOpenChange(false),
  });
  const submit = () => {
    const parsed = InviteStaffInputSchema.safeParse(draft);
    if (!parsed.success) {
      const found: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị theo trường lỗi.
        if (k === "name") found.name ??= t.nameRequired;
        if (k === "email") found.email ??= t.emailInvalid;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    invite.mutate(parsed.data);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.inviteTitle} size="sm" icon={<UserPlus className="h-4 w-4" />} description={t.inviteDescription}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            <Field label={t.name} required {...(errors.name ? { error: errors.name } : {})}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </Field>
            <Field label={t.workEmail} required {...(errors.email ? { error: errors.email } : {})}>
              <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder={t.emailExample} />
            </Field>
            <Field label={t.role} hint={t.roleHint}>
              <Select options={roleOptions} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={invite.isPending}>{t.sendInvite}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const t = useMessages(STAFF_PAGE_MESSAGES);
  const roleLabels = useMessages(STAFF_ROLE_LABELS);
  const permissionLabels = useMessages(PERMISSION_LABELS);
  const locale = useUiLocale();
  const roleOptions = useRoleOptions();
  const { staff: me, can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.staff, queryFn: listStaff });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dialog, setDialog] = useState<{ staff: Staff; action: "role" | "disable" | "enable" | "mfa-reset" } | null>(null);
  const [role, setRole] = useState<StaffRole>("SUPPORT");
  const close = () => setDialog(null);

  const changeRole = useAdminMutation({
    mutationFn: (v: { id: string; role: StaffRole; reason: string }) => changeStaffRole(v.id, { role: v.role, reason: v.reason }),
    success: (s) => `${s.name} → ${roleLabels[s.role]}`,
    errorTitle: t.roleError,
    onSuccess: close,
  });
  const mfaReset = useAdminMutation({
    mutationFn: (v: { id: string; reason: string }) => resetStaffMfa(v.id, { reason: v.reason }),
    success: (s) => fill(t.mfaResetDone, { name: s.name }),
    errorTitle: t.mfaResetError,
    onSuccess: close,
  });
  const toggle = useAdminMutation({
    mutationFn: (v: { id: string; disabled: boolean; reason: string }) => setStaffDisabled(v.id, v.disabled, { reason: v.reason }),
    success: (s) => fill(s.status === "DISABLED" ? t.disabledDone : t.enabledDone, { name: s.name }),
    errorTitle: t.actionError,
    onSuccess: close,
  });

  const rows = useMemo<Row[]>(
    () => (data ?? []).map((s) => ({ ...s, roleLabel: roleLabels[s.role], statusText: statusLabel(ACCOUNT_STATUS[s.status], locale) })),
    [data, roleLabels, locale],
  );
  const meId = me?.id;

  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<Row>();
    return col.columns([
      col.accessor("name", {
        header: t.colStaff,
        size: 300,
        meta: { hideable: false },
        cell: (c) => (
          <div className="flex items-center gap-3">
            <Avatar name={c.getValue()} size="sm" />
            <div className="min-w-0">
              <p className="font-medium text-fg">
                {c.getValue()} {c.row.original.id === meId && <span className="text-xs font-normal text-fg-subtle">{t.you}</span>}
              </p>
              <p className="text-xs text-fg-subtle">{c.row.original.email}</p>
              {c.row.original.mfaEnabled === false && c.row.original.status === "ACTIVE" && (
                <Badge tone="warning" size="sm" className="mt-1">{t.mfaOff}</Badge>
              )}
            </div>
          </div>
        ),
      }),
      col.accessor("roleLabel", { header: t.colRole, size: 180, meta: { filter: "select" } }),
      col.accessor("statusText", { header: t.colStatus, size: 170, cell: (c) => <StatusBadge status={ACCOUNT_STATUS[c.row.original.status]} /> }),
      col.accessor((s) => s.lastActiveAt ?? "", {
        id: "lastActive",
        header: t.colLastActive,
        size: 180,
        meta: { label: t.colLastActive },
        cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : t.neverSignedIn}</span>,
      }),
    ]);
  }, [meId, t]);

  const target = dialog?.staff;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title={t.loadError} />
      ) : (
        <DataTable
          aria-label={t.title}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          loading={isLoading}
          loadingRows={4}
          searchable
          pagination={false}
          emptyTitle={t.empty}
          {...(can("STAFF")
            ? {
                toolbarActions: <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>{t.invite}</Button>,
                rowActions: (r: Row) => {
                  // Không tự đổi vai trò / tự khóa mình; tài khoản chưa kích hoạt chưa khóa được.
                  const self = r.id === meId;
                  return (
                    <RowActions
                      rowLabel={r.name}
                      actions={[
                        { id: "role", label: t.changeRole, icon: <UserCog />, disabled: self, onSelect: () => { setRole(r.role); setDialog({ staff: r, action: "role" }); } },
                        ...(r.mfaEnabled && !self ? [{ id: "mfa-reset", label: t.mfaReset, icon: <ShieldOff />, quick: false, onSelect: () => setDialog({ staff: r, action: "mfa-reset" }) }] : []),
                        r.status === "DISABLED"
                          ? { id: "enable", label: t.unlock, icon: <LockOpen />, quick: false, onSelect: () => setDialog({ staff: r, action: "enable" }) }
                          : { id: "disable", label: t.lock, icon: <Lock />, tone: "danger" as const, quick: false, disabled: self || r.status === "INVITED", onSelect: () => setDialog({ staff: r, action: "disable" }) },
                      ]}
                    />
                  );
                },
              }
            : {})}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t.matrixTitle}</CardTitle>
          <CardDescription>{t.matrixDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionMatrix
            ariaLabel={t.matrixAria}
            permissions={PERMISSION_ORDER.map((p) => ({ id: p, label: permissionLabels[p] }))}
            roles={STAFF_ROLE_ORDER.map((r) => ({ id: r, label: roleLabels[r] }))}
            allowed={staffAllowed}
          />
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <ReasonDialog
        open={dialog?.action === "role"}
        onOpenChange={(o) => !o && close()}
        title={t.changeRoleTitle}
        icon={<UserCog className="h-4 w-4" />}
        description={target ? fill(t.currentRole, { name: target.name, role: roleLabels[target.role] }) : undefined}
        confirmLabel={t.changeRole}
        pending={changeRole.isPending}
        canSubmit={!!target && role !== target.role}
        onConfirm={(reason) => target && changeRole.mutate({ id: target.id, role, reason })}
      >
        <Field label={t.newRole} required>
          <Select options={roleOptions} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} />
        </Field>
        {role === "SUPER_ADMIN" && <Alert tone="warning">{t.superAdminWarning}</Alert>}
      </ReasonDialog>

      <ReasonDialog
        open={dialog?.action === "mfa-reset"}
        onOpenChange={(o) => !o && close()}
        title={t.mfaResetTitle}
        icon={<ShieldOff className="h-4 w-4" />}
        description={target ? `${target.name} · ${target.email}` : undefined}
        confirmLabel={t.reset}
        tone="danger"
        pending={mfaReset.isPending}
        reasonHint={t.mfaResetHint}
        onConfirm={(reason) => target && mfaReset.mutate({ id: target.id, reason })}
      />

      <ReasonDialog
        open={dialog?.action === "disable" || dialog?.action === "enable"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.action === "enable" ? t.unlockTitle : t.lockTitle}
        icon={dialog?.action === "enable" ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        description={target ? `${target.name} · ${target.email}` : undefined}
        confirmLabel={dialog?.action === "enable" ? t.unlock : t.lock}
        tone={dialog?.action === "enable" ? "primary" : "danger"}
        pending={toggle.isPending}
        onConfirm={(reason) => target && dialog && toggle.mutate({ id: target.id, disabled: dialog.action === "disable", reason })}
      />
    </Stack>
  );
}
