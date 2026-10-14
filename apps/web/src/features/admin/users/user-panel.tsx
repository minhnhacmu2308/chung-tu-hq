"use client";
// Panel bên phải của một tài khoản: thông tin, phiên đăng nhập, thao tác hỗ trợ. Mọi thao tác đều hỏi lý do.
import type { AdminUser } from "@kb/contracts";
import { Alert, Avatar, Badge, Button, EmptyState, Stack, StatusBadge } from "@kb/ui";
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

export const USER_ACTION_META: Record<UserAction, { label: string; icon: ReactNode; danger?: boolean }> = {
  reset: { label: "Gửi email đặt lại mật khẩu", icon: <KeyRound /> },
  verify: { label: "Gửi lại email xác thực", icon: <MailCheck /> },
  revoke: { label: "Đăng xuất mọi phiên", icon: <LogOut /> },
  disable: { label: "Khóa tài khoản", icon: <Lock />, danger: true },
  enable: { label: "Mở khóa tài khoản", icon: <LockOpen /> },
};

/** Hộp xác nhận (kèm lý do) cho một thao tác trên tài khoản. Dùng chung cho bảng và panel. */
export function UserActionDialog({ user, action, onClose }: { user: AdminUser; action: UserAction | null; onClose: () => void }) {
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
        reset: `Đã gửi email đặt lại mật khẩu tới ${user.email}`,
        verify: `Đã gửi lại email xác thực tới ${user.email}`,
        revoke: `Đã đăng xuất mọi phiên của ${user.name}`,
        disable: `Đã khóa ${user.name}`,
        enable: `Đã mở khóa ${user.name}`,
      })[v.action],
    errorTitle: "Không thực hiện được",
    onSuccess: onClose,
  });
  const meta = action ? USER_ACTION_META[action] : null;
  return (
    <ReasonDialog
      open={action !== null}
      onOpenChange={(o) => !o && onClose()}
      title={meta ? `${meta.label}?` : ""}
      description={`${user.name} · ${user.email}`}
      confirmLabel={meta?.label ?? ""}
      tone={meta?.danger ? "danger" : "primary"}
      pending={run.isPending}
      onConfirm={(reason) => action && run.mutate({ action, reason })}
    >
      {action === "disable" && <Alert tone="warning">Tài khoản bị đăng xuất ngay và không đăng nhập lại được cho tới khi mở khóa. Hồ sơ người này phụ trách vẫn giữ nguyên.</Alert>}
      {action === "reset" && <Alert tone="info">Người dùng tự đặt mật khẩu mới qua liên kết trong email. Đội vận hành không xem hay đặt mật khẩu thay.</Alert>}
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
        <Row label="Trạng thái"><StatusBadge status={ACCOUNT_STATUS[user.status]} /></Row>
        <Row label="Email">
          <Badge tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? "Đã xác thực" : "Chưa xác thực"}</Badge>
        </Row>
        <div className="col-span-2">
          <Row label="Doanh nghiệp">
            <Link href={`/admin/orgs/${user.orgId}`} className="text-primary hover:underline">{user.orgName}</Link>
          </Row>
        </div>
        <Row label="Vai trò trong doanh nghiệp">{user.status === "PENDING_JOIN" ? "Chưa có – chờ chủ doanh nghiệp duyệt" : ROLE_LABELS[user.role]}</Row>
        <Row label="Tạo tài khoản">{formatDateTime(user.createdAt)}</Row>
        <Row label="Hoạt động gần nhất">{user.lastActiveAt ? formatRelative(user.lastActiveAt) : "Chưa đăng nhập"}</Row>
        {user.joinRequestedAt && <Row label="Xin tham gia từ">{formatRelative(user.joinRequestedAt)}</Row>}
      </dl>

      {user.status === "PENDING_JOIN" && (
        <Alert tone="info" title="Việc duyệt thuộc về chủ doanh nghiệp">
          Đội vận hành không duyệt thay. Nếu yêu cầu treo lâu, liên hệ chủ doanh nghiệp để họ duyệt hoặc từ chối trong màn Thành viên.
        </Alert>
      )}

      <Stack gap="sm">
        <h3 className="text-sm font-semibold text-fg">Phiên đăng nhập ({user.sessions.length})</h3>
        {user.sessions.length === 0 ? (
          <EmptyState className="py-6" icon={<MonitorSmartphone />} title="Không có phiên nào đang mở" />
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
          <h3 className="text-sm font-semibold text-fg">Thao tác hỗ trợ</h3>
          <div className="flex flex-col gap-2">
            {actions.map((a) => (
              <Button key={a} variant={USER_ACTION_META[a].danger ? "danger" : "secondary"} className="justify-start" onClick={() => setAction(a)}>
                <span aria-hidden="true" className="inline-flex [&>svg]:h-4 [&>svg]:w-4">{USER_ACTION_META[a].icon}</span>
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
