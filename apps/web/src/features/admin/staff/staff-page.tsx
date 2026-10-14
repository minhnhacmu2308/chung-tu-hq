"use client";
import { InviteStaffInputSchema, STAFF_PERMISSIONS, type Staff, type StaffRole } from "@kb/contracts";
import {
  Alert, Avatar, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Dialog, DialogContent,
  Badge, DialogFooter, Field, Input, PageHeader, RowActions, Select, Stack, StatusBadge,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Check, Lock, LockOpen, ShieldOff, UserCog, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { adminKeys, changeStaffRole, inviteStaff, listStaff, resetStaffMfa, setStaffDisabled } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatRelative } from "@/lib/format";
import { ACCOUNT_STATUS, PERMISSION_LABELS, PERMISSION_ORDER, STAFF_ROLE_LABELS, STAFF_ROLE_ORDER, statusLabel } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";

type Row = Staff & { roleLabel: string; statusText: string };
const ROLE_OPTIONS = STAFF_ROLE_ORDER.map((r) => ({ value: r, label: STAFF_ROLE_LABELS[r] }));

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
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
    success: (s) => `Đã gửi lời mời tới ${s.email}`,
    errorTitle: "Không mời được quản trị viên",
    onSuccess: () => onOpenChange(false),
  });
  const submit = () => {
    const parsed = InviteStaffInputSchema.safeParse(draft);
    if (!parsed.success) {
      const found: typeof errors = {};
      for (const i of parsed.error.issues) {
        const k = i.path[0];
        if (k === "name" || k === "email") found[k] ??= i.message;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    invite.mutate(parsed.data);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Mời quản trị viên" size="sm" icon={<UserPlus className="h-4 w-4" />} description="Người được mời nhận email, tự đặt mật khẩu rồi đăng nhập ở trang đăng nhập chung." allowPresentationToggle={false}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            <Field label="Họ tên" required {...(errors.name ? { error: errors.name } : {})}>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Email công việc" required {...(errors.email ? { error: errors.email } : {})}>
              <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="ten@khaibao.vn" />
            </Field>
            <Field label="Vai trò" hint="Xem bảng “Vai trò làm được gì” bên dưới. Đổi được sau.">
              <Select options={ROLE_OPTIONS} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as StaffRole })} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={invite.isPending}>Gửi lời mời</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffPage() {
  const { staff: me, can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.staff, queryFn: listStaff });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [dialog, setDialog] = useState<{ staff: Staff; action: "role" | "disable" | "enable" | "mfa-reset" } | null>(null);
  const [role, setRole] = useState<StaffRole>("SUPPORT");
  const close = () => setDialog(null);

  const changeRole = useAdminMutation({
    mutationFn: (v: { id: string; role: StaffRole; reason: string }) => changeStaffRole(v.id, { role: v.role, reason: v.reason }),
    success: (s) => `${s.name} → ${STAFF_ROLE_LABELS[s.role]}`,
    errorTitle: "Không đổi được vai trò",
    onSuccess: close,
  });
  const mfaReset = useAdminMutation({
    mutationFn: (v: { id: string; reason: string }) => resetStaffMfa(v.id, { reason: v.reason }),
    success: (s) => `Đã đặt lại xác thực 2 lớp của ${s.name}`,
    errorTitle: "Không đặt lại được xác thực 2 lớp",
    onSuccess: close,
  });
  const toggle = useAdminMutation({
    mutationFn: (v: { id: string; disabled: boolean; reason: string }) => setStaffDisabled(v.id, v.disabled, { reason: v.reason }),
    success: (s) => (s.status === "DISABLED" ? `Đã khóa ${s.name}` : `Đã mở khóa ${s.name}`),
    errorTitle: "Không thực hiện được",
    onSuccess: close,
  });

  const rows = useMemo<Row[]>(() => (data ?? []).map((s) => ({ ...s, roleLabel: STAFF_ROLE_LABELS[s.role], statusText: statusLabel(ACCOUNT_STATUS[s.status]) })), [data]);
  const meId = me?.id;

  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<Row>();
    return col.columns([
      col.accessor("name", {
        header: "Quản trị viên",
        size: 300,
        meta: { hideable: false },
        cell: (c) => (
          <div className="flex items-center gap-3">
            <Avatar name={c.getValue()} size="sm" />
            <div className="min-w-0">
              <p className="font-medium text-fg">
                {c.getValue()} {c.row.original.id === meId && <span className="text-xs font-normal text-fg-subtle">(bạn)</span>}
              </p>
              <p className="text-xs text-fg-subtle">{c.row.original.email}</p>
              {c.row.original.mfaEnabled === false && c.row.original.status === "ACTIVE" && (
                <Badge tone="warning" size="sm" className="mt-1">Chưa bật xác thực 2 lớp</Badge>
              )}
            </div>
          </div>
        ),
      }),
      col.accessor("roleLabel", { header: "Vai trò", size: 180, meta: { filter: "select" } }),
      col.accessor("statusText", { header: "Trạng thái", size: 170, cell: (c) => <StatusBadge status={ACCOUNT_STATUS[c.row.original.status]} /> }),
      col.accessor((s) => s.lastActiveAt ?? "", {
        id: "lastActive",
        header: "Hoạt động gần nhất",
        size: 180,
        meta: { label: "Hoạt động gần nhất" },
        cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "Chưa đăng nhập"}</span>,
      }),
    ]);
  }, [meId]);

  const target = dialog?.staff;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Quản trị viên"
        description="Người của KhaiBáo AI được vào khu Quản trị hệ thống. Đăng nhập chung trang với ứng dụng; quyền quản trị gắn theo tài khoản, không phải vai trò trong doanh nghiệp."
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được danh sách quản trị viên" />
      ) : (
        <DataTable
          aria-label="Quản trị viên"
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          loading={isLoading}
          loadingRows={4}
          searchable
          pagination={false}
          emptyTitle="Chưa có quản trị viên"
          {...(can("STAFF")
            ? {
                toolbarActions: <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Mời quản trị viên</Button>,
                rowActions: (r: Row) => {
                  // Không tự đổi vai trò / tự khóa mình; tài khoản chưa kích hoạt chưa khóa được.
                  const self = r.id === meId;
                  return (
                    <RowActions
                      rowLabel={r.name}
                      actions={[
                        { id: "role", label: "Đổi vai trò", icon: <UserCog />, disabled: self, onSelect: () => { setRole(r.role); setDialog({ staff: r, action: "role" }); } },
                        ...(r.mfaEnabled && !self ? [{ id: "mfa-reset", label: "Đặt lại xác thực 2 lớp", icon: <ShieldOff />, quick: false, onSelect: () => setDialog({ staff: r, action: "mfa-reset" }) }] : []),
                        r.status === "DISABLED"
                          ? { id: "enable", label: "Mở khóa", icon: <LockOpen />, quick: false, onSelect: () => setDialog({ staff: r, action: "enable" }) }
                          : { id: "disable", label: "Khóa tài khoản", icon: <Lock />, tone: "danger" as const, quick: false, disabled: self || r.status === "INVITED", onSelect: () => setDialog({ staff: r, action: "disable" }) },
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
          <CardTitle>Vai trò làm được gì</CardTitle>
          <CardDescription>Thao tác vai trò không được làm sẽ không hiện trên màn hình. Mọi thao tác ghi đều kèm lý do và vào nhật ký quản trị.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-160 text-sm">
              <caption className="sr-only">Quyền theo vai trò quản trị</caption>
              <thead>
                <tr className="border-b border-border text-left text-fg-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">Quyền</th>
                  {STAFF_ROLE_ORDER.map((r) => <th key={r} scope="col" className="px-2 py-2 text-center font-medium">{STAFF_ROLE_LABELS[r]}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_ORDER.map((p) => (
                  <tr key={p} className="border-b border-border last:border-0">
                    <th scope="row" className="py-2 pr-4 text-left font-normal text-fg">{PERMISSION_LABELS[p]}</th>
                    {STAFF_ROLE_ORDER.map((r) => (
                      <td key={r} className="px-2 py-2 text-center">
                        {STAFF_PERMISSIONS[r].includes(p) ? <Check className="mx-auto h-4 w-4 text-success" aria-label="Có" /> : <span className="text-fg-subtle" aria-label="Không">–</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />

      <ReasonDialog
        open={dialog?.action === "role"}
        onOpenChange={(o) => !o && close()}
        title="Đổi vai trò quản trị viên"
        icon={<UserCog className="h-4 w-4" />}
        description={target ? `${target.name} · đang là ${STAFF_ROLE_LABELS[target.role]}` : undefined}
        confirmLabel="Đổi vai trò"
        pending={changeRole.isPending}
        canSubmit={!!target && role !== target.role}
        onConfirm={(reason) => target && changeRole.mutate({ id: target.id, role, reason })}
      >
        <Field label="Vai trò mới" required>
          <Select options={ROLE_OPTIONS} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} />
        </Field>
        {role === "SUPER_ADMIN" && <Alert tone="warning">Quản trị cấp cao đổi được gói, khóa API và phân quyền của mọi quản trị viên khác.</Alert>}
      </ReasonDialog>

      <ReasonDialog
        open={dialog?.action === "mfa-reset"}
        onOpenChange={(o) => !o && close()}
        title="Đặt lại xác thực 2 lớp?"
        icon={<ShieldOff className="h-4 w-4" />}
        description={target ? `${target.name} · ${target.email}` : undefined}
        confirmLabel="Đặt lại"
        tone="danger"
        pending={mfaReset.isPending}
        reasonHint="Dùng khi người này mất hoặc đổi điện thoại. Họ bị đăng xuất và phải thiết lập lại ở lần đăng nhập sau."
        onConfirm={(reason) => target && mfaReset.mutate({ id: target.id, reason })}
      />

      <ReasonDialog
        open={dialog?.action === "disable" || dialog?.action === "enable"}
        onOpenChange={(o) => !o && close()}
        title={dialog?.action === "enable" ? "Mở khóa quản trị viên?" : "Khóa quản trị viên?"}
        icon={dialog?.action === "enable" ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
        description={target ? `${target.name} · ${target.email}` : undefined}
        confirmLabel={dialog?.action === "enable" ? "Mở khóa" : "Khóa tài khoản"}
        tone={dialog?.action === "enable" ? "primary" : "danger"}
        pending={toggle.isPending}
        onConfirm={(reason) => target && dialog && toggle.mutate({ id: target.id, disabled: dialog.action === "disable", reason })}
      />
    </Stack>
  );
}
