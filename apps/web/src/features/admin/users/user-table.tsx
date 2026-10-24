"use client";
import type { AdminUser } from "@kb/contracts";
import { Avatar, Badge, createDataTableColumnHelper, DataTable, Dialog, DialogContent, RowActions, StatusBadge, useMessages, useUiLocale, type DataTableColumnVisibility } from "@kb/ui";
import { UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatRelative } from "@/lib/format";
import { ROLE_LABELS } from "@/mocks/types";
import { ACCOUNT_STATUS, statusLabel } from "../common/admin-display";
import { useAdminSession } from "../shell/use-admin-session";
import { availableUserActions, type UserAction } from "./user-actions";
import { useUserActionMeta, UserActionDialog, UserPanel } from "./user-panel";
import { USER_TABLE_MESSAGES } from "./users.messages";

type Row = AdminUser & { roleLabel: string; statusText: string; verifiedText: string };

const col = createDataTableColumnHelper<Row>();
type TableMessages = (typeof USER_TABLE_MESSAGES)["vi"];

const makeColumns = (t: TableMessages) => col.columns([
  col.accessor("name", {
    header: t.colUser,
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
  col.accessor("email", { header: t.colEmail }),
  col.accessor("orgName", {
    header: t.colOrg,
    size: 260,
    meta: { wrap: true, filter: "select" },
    cell: (c) => (
      <Link href={`/admin/orgs/${c.row.original.orgId}`} className="block min-w-40 text-primary hover:underline">{c.getValue()}</Link>
    ),
  }),
  col.accessor("roleLabel", {
    header: t.colRole,
    size: 170,
    meta: { filter: "select" },
    cell: (c) => (c.row.original.status === "PENDING_JOIN" ? <span className="text-fg-subtle">—</span> : c.getValue()),
  }),
  col.accessor("statusText", { header: t.colStatus, size: 180, meta: { filter: "select" }, cell: (c) => <StatusBadge status={ACCOUNT_STATUS[c.row.original.status]} /> }),
  col.accessor("verifiedText", {
    header: t.colEmail,
    size: 150,
    meta: { filter: "select", label: t.colVerifiedLabel },
    cell: (c) => <Badge tone={c.row.original.emailVerified ? "success" : "warning"} variant="outline">{c.getValue()}</Badge>,
  }),
  col.accessor((u) => u.lastActiveAt ?? "", {
    id: "lastActive",
    header: t.colLastActive,
    size: 170,
    meta: { label: t.colLastActive },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : t.neverSignedIn}</span>,
  }),
  col.accessor((u) => u.joinRequestedAt ?? "", {
    id: "joinRequested",
    header: t.colJoinRequested,
    size: 150,
    meta: { label: t.colJoinRequested },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "—"}</span>,
  }),
]);

/**
 * Bảng tài khoản + panel chi tiết + hộp xác nhận thao tác. Dùng ở màn Người dùng (mọi doanh nghiệp)
 * và ở tab Thành viên của trang doanh nghiệp (`showOrg={false}`).
 */
export function UserTable({ users, loading, showOrg = true, showJoinRequested = false, emptyTitle, filtered = false, onClearFilters }: {
  users: readonly AdminUser[];
  loading: boolean;
  showOrg?: boolean;
  showJoinRequested?: boolean;
  emptyTitle: string;
  /** Danh sách đã lọc theo nhóm bên ngoài bảng → bảng trống hiện "Không có kết quả phù hợp". */
  filtered?: boolean;
  onClearFilters?: () => void;
}) {
  const t = useMessages(USER_TABLE_MESSAGES);
  const roleLabels = useMessages(ROLE_LABELS);
  const locale = useUiLocale();
  const USER_ACTION_META = useUserActionMeta();
  const columns = useMemo(() => makeColumns(t), [t]);
  const { can } = useAdminSession();
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ userId: string; action: UserAction } | null>(null);

  const rows = useMemo<Row[]>(
    () => users.map((u) => ({ ...u, roleLabel: roleLabels[u.role], statusText: statusLabel(ACCOUNT_STATUS[u.status], locale), verifiedText: u.emailVerified ? t.verified : t.unverified })),
    [users, roleLabels, locale, t],
  );
  // Lấy lại theo id từ dữ liệu mới nhất để panel/hộp thoại tự cập nhật sau mỗi thao tác.
  const opened = users.find((u) => u.id === openId);
  const dialogUser = dialog ? users.find((u) => u.id === dialog.userId) : undefined;
  const hidden: DataTableColumnVisibility = { email: false, ...(showOrg ? {} : { orgName: false }), ...(showJoinRequested ? {} : { joinRequested: false }) };

  return (
    <>
      <DataTable
        aria-label={t.tableLabel}
        columns={columns}
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
        filtered={filtered}
        {...(onClearFilters ? { onClearFilters } : {})}
        rowActions={(r) => (
          <RowActions
            rowLabel={r.name}
            actions={[
              { id: "open", label: t.viewDetail, icon: <UserRound />, onSelect: () => setOpenId(r.id) },
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
        <DialogContent title={t.accountTitle} size="sm" icon={<UserRound className="h-4 w-4" />}>
          {opened && <UserPanel user={opened} />}
        </DialogContent>
      </Dialog>

      {dialogUser && <UserActionDialog user={dialogUser} action={dialog?.action ?? null} onClose={() => setDialog(null)} />}
    </>
  );
}
