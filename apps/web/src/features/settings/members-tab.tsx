"use client";
import {
  Alert, Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable,
  Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Field, Input, Select, Stack, toast,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// kb-allow-raw: menu của thành viên có nhóm radio chọn vai trò – RowActions chỉ nhận thao tác bấm-là-chạy
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { getSession, sessionKeys } from "@/api/session";
import { changeMemberRole, inviteMember, listMembers, setMemberDisabled, settingsKeys } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS, type Member, type Role } from "@/mocks/types";
import { PermissionMatrix } from "@/components/common/permission-matrix";

const ASSIGNABLE: Role[] = ["ADMIN", "DECLARANT", "APPROVER", "VIEWER"];
const STATUS: Record<Member["status"], { tone: "success" | "warning" | "neutral"; label: string }> = {
  ACTIVE: { tone: "success", label: "Đang hoạt động" },
  INVITED: { tone: "warning", label: "Đã mời" },
  DISABLED: { tone: "neutral", label: "Đã khóa" },
};

const PERMISSIONS: { label: string; roles: Role[] }[] = [
  { label: "Xem hồ sơ, tờ khai", roles: ["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"] },
  { label: "Tạo hồ sơ, upload, sửa kết quả đọc", roles: ["OWNER", "ADMIN", "DECLARANT"] },
  { label: "Chạy AI Agent, dựng tờ khai", roles: ["OWNER", "ADMIN", "DECLARANT"] },
  { label: "Phê duyệt tờ khai, truyền Hải quan", roles: ["OWNER", "ADMIN", "APPROVER"] },
  { label: "Cấu hình Skill AI, kết nối, chứng thư số", roles: ["OWNER", "ADMIN"] },
  { label: "Mời / khóa thành viên", roles: ["OWNER", "ADMIN"] },
  { label: "Gói dịch vụ, thanh toán, chuyển quyền sở hữu", roles: ["OWNER"] },
];
const ROLE_ORDER: Role[] = ["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"];
const memberAllowed = (permission: string, role: string) => !!PERMISSIONS.find((p) => p.label === permission)?.roles.includes(role as Role);

const col = createDataTableColumnHelper<Member>();

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("DECLARANT");
  const invite = useMutation({
    mutationFn: () => inviteMember({ email, role }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.members });
      toast({ tone: "success", title: "Đã gửi lời mời", description: `${m.email} · ${ROLE_LABELS[m.role]}` });
      setEmail("");
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { invite.reset(); onOpenChange(o); }}>
      <DialogContent title="Mời thành viên" icon={<UserPlus className="h-4 w-4" />} description="Người được mời nhận email, tự đặt mật khẩu và vào thẳng doanh nghiệp này." size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Stack gap="md">
            {invite.isError && <Alert tone="danger">{invite.error.message}</Alert>}
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" autoFocus />
            </Field>
            <Field label="Vai trò" hint="Đổi được sau">
              <Select options={ASSIGNABLE.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} value={role} onChange={(e) => setRole(e.target.value as Role)} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={invite.isPending} disabled={!email.trim()}>Gửi lời mời</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersTab() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: settingsKeys.members, queryFn: listMembers });
  const { data: session } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const onError = (e: Error) => toast({ tone: "danger", title: "Không thực hiện được", description: e.message });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: settingsKeys.members });
    void qc.invalidateQueries({ queryKey: sessionKeys.me });
  };
  const role = useMutation({
    mutationFn: ({ id, r }: { id: string; r: Role }) => changeMemberRole(id, r),
    onSuccess: (m) => {
      refresh();
      toast({ tone: "success", title: `${m.name} → ${ROLE_LABELS[m.role]}` });
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: ({ id, d }: { id: string; d: boolean }) => setMemberDisabled(id, d),
    onSuccess: (m) => {
      refresh();
      toast({ tone: "success", title: m.status === "DISABLED" ? `Đã khóa ${m.name}` : `Đã mở khóa ${m.name}` });
    },
    onError,
  });
  const meId = session?.user.id;

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", {
          header: "Thành viên",
          meta: { hideable: false },
          cell: (c) => (
            <div className="flex items-center gap-3">
              <Avatar name={c.getValue()} size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-fg">
                  {c.getValue()} {c.row.original.id === meId && <span className="text-xs text-fg-subtle">(bạn)</span>}
                </p>
                <p className="text-xs text-fg-subtle">{c.row.original.email}</p>
              </div>
            </div>
          ),
        }),
        col.accessor((m) => ROLE_LABELS[m.role], { id: "role", header: "Vai trò" }),
        col.accessor("status", {
          header: "Trạng thái",
          cell: (c) => <Badge tone={STATUS[c.getValue()].tone}>{STATUS[c.getValue()].label}</Badge>,
        }),
        col.accessor((m) => m.lastActiveAt ?? "", {
          id: "lastActive",
          header: "Hoạt động gần nhất",
          cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "Chưa đăng nhập"}</span>,
        }),
        col.display({
          id: "actions",
          header: () => <span className="sr-only">Thao tác</span>,
          cell: (c) => {
            const m = c.row.original;
            const locked = m.role === "OWNER" || m.id === meId;
            return (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label={`Thao tác cho ${m.name}`}>
                    {/* kb-allow-raw: menu có nhóm radio vai trò, xem ghi chú ở import */}
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Đổi vai trò</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={m.role} onValueChange={(r) => role.mutate({ id: m.id, r: r as Role })}>
                    {ASSIGNABLE.map((r) => (
                      <DropdownMenuRadioItem key={r} value={r} disabled={locked}>{ROLE_LABELS[r]}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  <DropdownMenuSeparator />
                  {m.status === "INVITED" && (
                    <DropdownMenuItem onSelect={() => toast({ tone: "success", title: `Đã gửi lại lời mời tới ${m.email}` })}>Gửi lại lời mời</DropdownMenuItem>
                  )}
                  <DropdownMenuItem tone="danger" disabled={locked} onSelect={() => disable.mutate({ id: m.id, d: m.status !== "DISABLED" })}>
                    {m.status === "DISABLED" ? "Mở khóa tài khoản" : "Khóa tài khoản"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          },
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meId],
  );

  return (
    <Stack gap="lg">
      <Stack gap="sm">
        <div>
          <h2 className="text-base font-semibold text-fg">Thành viên</h2>
          <p className="text-sm text-fg-muted">Nhân viên của doanh nghiệp dùng chung dữ liệu hồ sơ. Mỗi người đăng nhập bằng email riêng.</p>
        </div>
        <DataTable
          aria-label="Thành viên"
          columns={columns}
          data={data ?? []}
          getRowId={(m) => m.id}
          loading={isLoading}
          searchable
          pagination={false}
          toolbarActions={<Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Mời thành viên</Button>}
          emptyTitle="Chưa có thành viên"
        />
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>Vai trò làm được gì</CardTitle>
          <CardDescription>Người duyệt có thể khác người tạo tờ khai (nguyên tắc 4 mắt) – bật trong cấu hình quy trình.</CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionMatrix
            ariaLabel="Quyền theo vai trò"
            permissions={PERMISSIONS.map((p) => ({ id: p.label, label: p.label }))}
            roles={ROLE_ORDER.map((r) => ({ id: r, label: ROLE_LABELS[r] }))}
            allowed={memberAllowed}
          />
        </CardContent>
      </Card>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </Stack>
  );
}
