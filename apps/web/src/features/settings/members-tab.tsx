"use client";
import {
  Alert, Avatar, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable,
  Dialog, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger, Field, Input, Select, Stack, fill, toast, useMessages, StatusBadge, type Status,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// kb-allow-raw: menu của thành viên có nhóm radio chọn vai trò – RowActions chỉ nhận thao tác bấm-là-chạy
import { Crown, MoreHorizontal, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { getSession, sessionKeys } from "@/api/session";
import { changeMemberRole, inviteMember, listMembers, setMemberDisabled, settingsKeys } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS, type Member, type Role } from "@/mocks/types";
import { PermissionMatrix } from "@/components/common/permission-matrix";
import { JoinRequestsCard } from "./join-requests-card";
import { MEMBERS_TAB_MESSAGES } from "./members-tab.messages";
import { TransferOwnershipDialog } from "./transfer-ownership-dialog";

const ASSIGNABLE: Role[] = ["ADMIN", "DECLARANT", "APPROVER", "VIEWER"];
const STATUS = { ACTIVE: "ACCOUNT_ACTIVE", INVITED: "ACCOUNT_INVITED", DISABLED: "ACCOUNT_DISABLED" } as const satisfies Record<Member["status"], Status>;

type PermissionId = "permView" | "permCreate" | "permAgent" | "permApprove" | "permConfig" | "permMembers" | "permBilling";
const PERMISSIONS: { id: PermissionId; roles: Role[] }[] = [
  { id: "permView", roles: ["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"] },
  { id: "permCreate", roles: ["OWNER", "ADMIN", "DECLARANT"] },
  { id: "permAgent", roles: ["OWNER", "ADMIN", "DECLARANT"] },
  { id: "permApprove", roles: ["OWNER", "ADMIN", "APPROVER"] },
  { id: "permConfig", roles: ["OWNER", "ADMIN"] },
  { id: "permMembers", roles: ["OWNER", "ADMIN"] },
  { id: "permBilling", roles: ["OWNER"] },
];
const ROLE_ORDER: Role[] = ["OWNER", "ADMIN", "DECLARANT", "APPROVER", "VIEWER"];
const memberAllowed = (permission: string, role: string) => !!PERMISSIONS.find((p) => p.id === permission)?.roles.includes(role as Role);

const col = createDataTableColumnHelper<Member>();

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const t = useMessages(MEMBERS_TAB_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("DECLARANT");
  const invite = useMutation({
    mutationFn: () => inviteMember({ email, role }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.members });
      toast({ tone: "success", title: t.inviteSent, description: `${m.email} · ${roleLabels[m.role]}` });
      setEmail("");
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { invite.reset(); onOpenChange(o); }}>
      <DialogContent title={t.inviteTitle} icon={<UserPlus className="h-4 w-4" />} description={t.inviteDesc} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate();
          }}
        >
          <Stack gap="md">
            {invite.isError && <Alert tone="danger">{invite.error.message}</Alert>}
            <Field label={t.email} required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailPlaceholder} autoFocus />
            </Field>
            <Field label={t.role} hint={t.roleHint}>
              <Select options={ASSIGNABLE.map((r) => ({ value: r, label: roleLabels[r] }))} value={role} onChange={(e) => setRole(e.target.value as Role)} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={invite.isPending} disabled={!email.trim()}>{t.sendInvite}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersTab() {
  const qc = useQueryClient();
  const t = useMessages(MEMBERS_TAB_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: settingsKeys.members, queryFn: listMembers });
  const { data: session } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const onError = (e: Error) => toast({ tone: "danger", title: t.failed, description: e.message });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: settingsKeys.members });
    void qc.invalidateQueries({ queryKey: sessionKeys.me });
  };
  const role = useMutation({
    mutationFn: ({ id, r }: { id: string; r: Role }) => changeMemberRole(id, r),
    onSuccess: (m) => {
      refresh();
      toast({ tone: "success", title: `${m.name} → ${roleLabels[m.role]}` });
    },
    onError,
  });
  const disable = useMutation({
    mutationFn: ({ id, d }: { id: string; d: boolean }) => setMemberDisabled(id, d),
    onSuccess: (m) => {
      refresh();
      toast({ tone: "success", title: fill(m.status === "DISABLED" ? t.locked : t.unlocked, { name: m.name }) });
    },
    onError,
  });
  const meId = session?.user.id;
  const myRole = session?.user.role;
  const isOwner = myRole === "OWNER";
  const isManager = isOwner || myRole === "ADMIN";
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

  const memberMenu = (m: Member) => {
    const locked = m.role === "OWNER" || m.id === meId;
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={fill(t.actionsFor, { name: m.name })}>
            {/* kb-allow-raw: menu có nhóm radio vai trò, xem ghi chú ở import */}
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{t.changeRole}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={m.role} onValueChange={(r) => role.mutate({ id: m.id, r: r as Role })}>
            {ASSIGNABLE.map((r) => (
              <DropdownMenuRadioItem key={r} value={r} disabled={locked}>{roleLabels[r]}</DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          {m.status === "INVITED" && (
            <DropdownMenuItem onSelect={() => toast({ tone: "success", title: fill(t.resent, { email: m.email }) })}>{t.resend}</DropdownMenuItem>
          )}
          <DropdownMenuItem tone="danger" disabled={locked} onSelect={() => disable.mutate({ id: m.id, d: m.status !== "DISABLED" })}>
            {m.status === "DISABLED" ? t.unlock : t.lock}
          </DropdownMenuItem>
          {/* Chỉ Chủ sở hữu thấy; người nhận phải đang hoạt động (backend kiểm lại). */}
          {isOwner && (
            <DropdownMenuItem
              icon={<Crown className="h-4 w-4" />}
              disabled={locked || m.status !== "ACTIVE"}
              onSelect={() => setTransferTarget(m)}
            >
              {t.transfer}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", {
          header: t.member,
          meta: { hideable: false },
          cell: (c) => (
            <div className="flex items-center gap-3">
              <Avatar name={c.getValue()} size="sm" />
              <div className="min-w-0">
                <p className="font-medium text-fg">
                  {c.getValue()} {c.row.original.id === meId && <span className="text-xs text-fg-subtle">{t.you}</span>}
                </p>
                <p className="text-xs text-fg-subtle">{c.row.original.email}</p>
              </div>
            </div>
          ),
        }),
        col.accessor((m) => roleLabels[m.role], { id: "role", header: t.role }),
        col.accessor("status", {
          header: t.status,
          cell: (c) => <StatusBadge status={STATUS[c.getValue()]} />,
        }),
        col.accessor((m) => m.lastActiveAt ?? "", {
          id: "lastActive",
          header: t.lastActive,
          cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : t.neverSignedIn}</span>,
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meId, isOwner, t, roleLabels],
  );

  return (
    <Stack gap="lg">
      {isManager && <JoinRequestsCard />}
      <Stack gap="sm">
        <div>
          <h2 className="text-base font-semibold text-fg">{t.members}</h2>
          <p className="text-sm text-fg-muted">{t.membersDesc}</p>
        </div>
        <DataTable
          aria-label={t.members}
          columns={columns}
          data={data ?? []}
          getRowId={(m) => m.id}
          rowLabel={(m) => m.name}
          rowActions={memberMenu}
          loading={isLoading}
          searchable
          pagination={false}
          toolbarActions={<Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>{t.inviteButton}</Button>}
          emptyTitle={t.empty}
        />
      </Stack>

      <Card>
        <CardHeader>
          <CardTitle>{t.rolesTitle}</CardTitle>
          <CardDescription>{t.rolesDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <PermissionMatrix
            ariaLabel={t.matrixLabel}
            permissions={PERMISSIONS.map((p) => ({ id: p.id, label: t[p.id] }))}
            roles={ROLE_ORDER.map((r) => ({ id: r, label: roleLabels[r] }))}
            allowed={memberAllowed}
          />
        </CardContent>
      </Card>
      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <TransferOwnershipDialog target={transferTarget} onOpenChange={(o) => !o && setTransferTarget(null)} />
    </Stack>
  );
}
