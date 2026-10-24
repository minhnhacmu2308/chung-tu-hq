"use client";
// Panel bên phải của một tài khoản: thông tin, phiên đăng nhập, thao tác hỗ trợ. Mọi thao tác đều hỏi lý do.
import type { AdminUser } from "@kb/contracts";
import { Alert, Avatar, Badge, Button, EmptyState, fill, Stack, StatusBadge, useMessages } from "@kb/ui";
import { KeyRound, Lock, LockOpen, LogOut, MailCheck, MonitorSmartphone } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { resendUserVerification, revokeUserSessions, sendUserPasswordReset, setAdminUserDisabled } from "@/api/admin";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ROLE_LABELS } from "@/mocks/types";
import { ACCOUNT_STATUS } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { availableUserActions, type UserAction } from "./user-actions";
import { USER_PANEL_MESSAGES } from "./users.messages";

type UserActionMeta = { label: string; icon: ReactNode; danger?: boolean };

const USER_ACTION_ICONS: Record<UserAction, Omit<UserActionMeta, "label">> = {
  reset: { icon: <KeyRound className="h-4 w-4" /> },
  verify: { icon: <MailCheck className="h-4 w-4" /> },
  revoke: { icon: <LogOut className="h-4 w-4" /> },
  disable: { icon: <Lock className="h-4 w-4" />, danger: true },
  enable: { icon: <LockOpen className="h-4 w-4" /> },
};

const ACTION_LABEL_KEY = { reset: "actionReset", verify: "actionVerify", revoke: "actionRevoke", disable: "actionDisable", enable: "actionEnable" } as const;

/** Nhãn + icon của các thao tác trên tài khoản theo ngôn ngữ hiện tại. */
export function useUserActionMeta(): Record<UserAction, UserActionMeta> {
  const t = useMessages(USER_PANEL_MESSAGES);
  const out = {} as Record<UserAction, UserActionMeta>;
  for (const a of Object.keys(USER_ACTION_ICONS) as UserAction[]) out[a] = { ...USER_ACTION_ICONS[a], label: t[ACTION_LABEL_KEY[a]] };
  return out;
}

/** Hộp xác nhận (kèm lý do) cho một thao tác trên tài khoản. Dùng chung cho bảng và panel. */
export function UserActionDialog({ user, action, onClose }: { user: AdminUser; action: UserAction | null; onClose: () => void }) {
  const t = useMessages(USER_PANEL_MESSAGES);
  const actionMeta = useUserActionMeta();
  const run = useAdminMutation({
    mutationFn: ({ action: a, reason }: { action: UserAction; reason: string }) => {
      const input = { reason };
      if (a === "reset") return sendUserPasswordReset(user.id, input);
      if (a === "verify") return resendUserVerification(user.id, input);
      if (a === "revoke") return revokeUserSessions(user.id, input);
      return setAdminUserDisabled(user.id, a === "disable", input);
    },
    success: (_u, v) =>
      ({
        reset: fill(t.doneReset, { email: user.email }),
        verify: fill(t.doneVerify, { email: user.email }),
        revoke: fill(t.doneRevoke, { name: user.name }),
        disable: fill(t.doneDisable, { name: user.name }),
        enable: fill(t.doneEnable, { name: user.name }),
      })[v.action],
    errorTitle: t.errorTitle,
    onSuccess: onClose,
  });
  const meta = action ? actionMeta[action] : null;
  return (
    <ReasonDialog
      open={action !== null}
      onOpenChange={(o) => !o && onClose()}
      title={meta ? `${meta.label}?` : ""}
      icon={meta?.icon ?? <KeyRound className="h-4 w-4" />}
      description={`${user.name} · ${user.email}`}
      confirmLabel={meta?.label ?? ""}
      tone={meta?.danger ? "danger" : "primary"}
      pending={run.isPending}
      onConfirm={(reason) => action && run.mutate({ action, reason })}
    >
      {action === "disable" && <Alert tone="warning">{t.disableWarn}</Alert>}
      {action === "reset" && <Alert tone="info">{t.resetInfo}</Alert>}
    </ReasonDialog>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

export function UserPanel({ user }: { user: AdminUser }) {
  const t = useMessages(USER_PANEL_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  const USER_ACTION_META = useUserActionMeta();
  const { can } = useAdminSession();
  const [action, setAction] = useState<UserAction | null>(null);
  const actions = can("SUPPORT") ? availableUserActions(user) : [];

  return (
    <Stack gap="lg">
      <div className="flex items-center gap-3">
        <Avatar name={user.name} size="lg" />
        <div className="min-w-0">
          <p className="text-base font-semibold text-fg">{user.name}</p>
          <p className="break-all text-sm text-fg-muted">{user.email}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-md bg-surface-muted p-4">
        <Row label={t.status}><StatusBadge status={ACCOUNT_STATUS[user.status]} /></Row>
        <Row label={t.email}>
          <Badge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? t.verified : t.unverified}</Badge>
        </Row>
        <div className="col-span-2">
          <Row label={t.org}>
            <Link href={`/admin/orgs/${user.orgId}`} className="text-primary hover:underline">{user.orgName}</Link>
          </Row>
        </div>
        <Row label={t.orgRole}>{user.status === "PENDING_JOIN" ? t.noRolePending : roleLabels[user.role]}</Row>
        <Row label={t.createdAt}>{formatDateTime(user.createdAt)}</Row>
        <Row label={t.lastActive}>{user.lastActiveAt ? formatRelative(user.lastActiveAt) : t.neverSignedIn}</Row>
        {user.joinRequestedAt && <Row label={t.joinRequestedSince}>{formatRelative(user.joinRequestedAt)}</Row>}
      </dl>

      {user.status === "PENDING_JOIN" && (
        <Alert tone="info" title={t.pendingTitle}>
          {t.pendingBody}
        </Alert>
      )}

      <Stack gap="sm">
        <h3 className="text-sm font-semibold text-fg">{fill(t.sessions, { n: user.sessions.length })}</h3>
        {user.sessions.length === 0 ? (
          <EmptyState className="py-6" icon={<MonitorSmartphone />} title={t.noSessions} />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {user.sessions.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
                <MonitorSmartphone className="h-4 w-4 shrink-0 text-fg-subtle" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-fg">{s.device}</p>
                  <p className="text-xs text-fg-subtle">
                    IP <span className="font-mono">{s.ip}</span> · {formatRelative(s.lastSeenAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Stack>

      {actions.length > 0 && (
        <Stack gap="sm">
          <h3 className="text-sm font-semibold text-fg">{t.supportActions}</h3>
          <div className="flex flex-col gap-2">
            {actions.map((a) => (
              <Button key={a} variant={USER_ACTION_META[a].danger ? "danger" : "secondary"} className="justify-start" leftIcon={USER_ACTION_META[a].icon} onClick={() => setAction(a)}>
                {USER_ACTION_META[a].label}
              </Button>
            ))}
          </div>
        </Stack>
      )}

      <UserActionDialog user={user} action={action} onClose={() => setAction(null)} />
    </Stack>
  );
}
