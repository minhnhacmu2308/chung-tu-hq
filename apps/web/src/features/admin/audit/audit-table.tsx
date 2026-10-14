"use client";
import type { AdminAuditEntry } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, type DataTableColumnVisibility } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { adminKeys, listAdminAudit } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime } from "@/lib/format";
import { ACTION_LABELS, TARGET_TYPE_LABELS } from "../common/admin-display";

type Row = AdminAuditEntry & { actionLabel: string; org: string };

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("at", {
    header: "Thời điểm",
    size: 160,
    meta: { hideable: false },
    cell: (c) => <span className="whitespace-nowrap tabular-nums text-fg-muted">{formatDateTime(c.getValue())}</span>,
  }),
  col.accessor("staffName", { header: "Người thực hiện", size: 180, meta: { filter: "select" } }),
  col.accessor("actionLabel", { header: "Hành động", size: 210, meta: { filter: "select" }, cell: (c) => <span className="font-medium text-fg">{c.getValue()}</span> }),
  col.accessor("targetLabel", {
    header: "Đối tượng",
    size: 260,
    meta: { wrap: true },
    cell: (c) => (
      <div className="flex min-w-40 flex-col items-start gap-1">
        <Badge tone="neutral" variant="outline" size="sm">{TARGET_TYPE_LABELS[c.row.original.targetType]}</Badge>
        <span className="text-fg">{c.getValue()}</span>
      </div>
    ),
  }),
  col.accessor("org", {
    header: "Doanh nghiệp",
    size: 240,
    meta: { wrap: true, filter: "select" },
    cell: (c) =>
      c.row.original.orgId ? (
        <Link href={`/admin/orgs/${c.row.original.orgId}`} className="text-primary hover:underline">{c.getValue()}</Link>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  }),
  col.accessor("reason", { header: "Lý do", size: 300, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 text-fg">{c.getValue()}</span> }),
  col.accessor((a) => a.detail ?? "", { id: "detail", header: "Thay đổi", size: 220, meta: { wrap: true, label: "Thay đổi" }, cell: (c) => <span className="text-fg-muted">{c.getValue() || "—"}</span> }),
]);

/**
 * Nhật ký quản trị (append-only – không có thao tác sửa/xóa). `orgId` → chỉ dòng của một doanh nghiệp;
 * `from`/`to` (YYYY-MM-DD, theo giờ máy người xem) → lọc theo khoảng ngày.
 */
export function AuditTable({ orgId, from, to, toolbar }: { orgId?: string; from?: string | null; to?: string | null; toolbar?: ReactNode }) {
  const filter = orgId ? { orgId } : {};
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.audit(filter), queryFn: () => listAdminAudit(filter) });

  const rows = useMemo<Row[]>(() => {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return (data ?? [])
      .filter((a) => {
        const t = new Date(a.at).getTime();
        return t >= start && t <= end;
      })
      .map((a) => ({ ...a, actionLabel: ACTION_LABELS[a.action], org: a.orgName ?? "" }));
  }, [data, from, to]);

  const hidden: DataTableColumnVisibility = orgId ? { org: false } : {};
  if (isError) return <LoadError onRetry={() => void refetch()} title="Không tải được nhật ký" />;

  return (
    <DataTable
      aria-label="Nhật ký quản trị"
      columns={COLUMNS}
      data={rows}
      getRowId={(r) => r.id}
      loading={isLoading}
      searchable
      columnToggle
      columnVisibility={hidden}
      pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50, 100] }}
      emptyTitle="Chưa có thao tác quản trị nào"
      emptyDescription={orgId ? "Mọi thao tác của đội vận hành trên doanh nghiệp này sẽ được ghi lại ở đây." : "Thử đổi khoảng ngày."}
      {...(toolbar ? { toolbarActions: toolbar } : {})}
    />
  );
}
