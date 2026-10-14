"use client";
import type { AdminUser } from "@kb/contracts";
import { Avatar, Badge, createDataTableColumnHelper, DataTable, Dialog, DialogContent, RowActions, StatusBadge, type DataTableColumnVisibility } from "@kb/ui";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS } from "@/mocks/types";
import { ACCOUNT_STATUS, statusLabel } from "../common/admin-display";
import { useAdminSession } from "../shell/use-admin-session";
import { availableUserActions, type UserAction } from "./user-actions";
import { UserActionDialog, UserPanel, USER_ACTION_META } from "./user-panel";

type Row = AdminUser & { roleLabel: string; statusText: string; verifiedText: string };

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("name", {
    header: "Người dùng",
    size: 280,
    minSize: 220,
    meta: { hideable: false },
    cell: (c) => (
      <div className="flex items-center gap-3">
        <Avatar name={c.getValue()} size="sm" />
        <div className="min-w-0">
          <p className="font-medium text-fg">{c.getValue()}</p>
          <p className="text-xs text-fg-subtle">{c.row.original.email}</p>
        </div>
      </div>
    ),
  }),
  // Cột ẩn chỉ để ô tìm kiếm khớp được email.
  col.accessor("email", { header: "Email" }),
  col.accessor("orgName", {
    header: "Doanh nghiệp",
    size: 260,
    meta: { wrap: true, filter: "select" },
    cell: (c) => (
      <Link href={`/admin/orgs/${c.row.original.orgId}`} className="block min-w-40 text-primary hover:underline">{c.getValue()}</Link>
    ),
  }),
  col.accessor("roleLabel", {
    header: "Vai trò",
    size: 170,
    meta: { filter: "select" },
    cell: (c) => (c.row.original.status === "PENDING_JOIN" ? <span className="text-fg-subtle">—</span> : c.getValue()),
  }),
  col.accessor("statusText", { header: "Trạng thái", size: 180, meta: { filter: "select" }, cell: (c) => <StatusBadge status={ACCOUNT_STATUS[c.row.original.status]} /> }),
  col.accessor("verifiedText", {
    header: "Email",
    size: 150,
    meta: { filter: "select", label: "Xác thực email" },
    cell: (c) => <Badge tone={c.row.original.emailVerified ? "success" : "warning"} variant="outline">{c.getValue()}</Badge>,
  }),
  col.accessor((u) => u.lastActiveAt ?? "", {
    id: "lastActive",
    header: "Hoạt động gần nhất",
    size: 170,
    meta: { label: "Hoạt động gần nhất" },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "Chưa đăng nhập"}</span>,
  }),
  col.accessor((u) => u.joinRequestedAt ?? "", {
    id: "joinRequested",
    header: "Xin tham gia",
    size: 150,
    meta: { label: "Xin tham gia" },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "—"}</span>,
  }),
]);

/**
 * Bảng tài khoản + panel chi tiết + hộp xác nhận thao tác. Dùng ở màn Người dùng (mọi doanh nghiệp)
 * và ở tab Thành viên của trang doanh nghiệp (`showOrg={false}`).
 */
export function UserTable({ users, loading, showOrg = true, showJoinRequested = false, emptyTitle }: {
  users: readonly AdminUser[];
  loading: boolean;
  showOrg?: boolean;
  showJoinRequested?: boolean;
  emptyTitle: string;
}) {
  const { can } = useAdminSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ userId: string; action: UserAction } | null>(null);

  const rows = useMemo<Row[]>(
    () => users.map((u) => ({ ...u, roleLabel: ROLE_LABELS[u.role], statusText: statusLabel(ACCOUNT_STATUS[u.status]), verifiedText: u.emailVerified ? "Đã xác thực" : "Chưa xác thực" })),
    [users],
  );
  // Lấy lại theo id từ dữ liệu mới nhất để panel/hộp thoại tự cập nhật sau mỗi thao tác.
  const opened = users.find((u) => u.id === openId);
  const dialogUser = dialog ? users.find((u) => u.id === dialog.userId) : undefined;
  const hidden: DataTableColumnVisibility = { email: false, ...(showOrg ? {} : { orgName: false }), ...(showJoinRequested ? {} : { joinRequested: false }) };

  return (
    <>
      <DataTable
        aria-label="Người dùng"
        columns={COLUMNS}
        data={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.name}
        loading={loading}
        searchable
        columnToggle
        columnVisibility={hidden}
        pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle={emptyTitle}
        rowActions={(r) => (
          <RowActions
            rowLabel={r.name}
            actions={[
              { id: "open", label: "Xem chi tiết", icon: <UserRound />, onSelect: () => setOpenId(r.id) },
              ...(can("SUPPORT")
                ? availableUserActions(r).map((a) => ({
                    id: a,
                    label: USER_ACTION_META[a].label,
                    icon: USER_ACTION_META[a].icon,
                    quick: false,
                    ...(USER_ACTION_META[a].danger ? { tone: "danger" as const } : {}),
                    onSelect: () => setDialog({ userId: r.id, action: a }),
                  }))
                : []),
            ]}
          />
        )}
      />

      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpenId(null)} defaultPresentation="panel">
        <DialogContent title="Tài khoản" size="sm" icon={<UserRound className="h-4 w-4" />}>
          {opened && <UserPanel user={opened} />}
        </DialogContent>
      </Dialog>

      {dialogUser && <UserActionDialog user={dialogUser} action={dialog?.action ?? null} onClose={() => setDialog(null)} />}
    </>
  );
}
