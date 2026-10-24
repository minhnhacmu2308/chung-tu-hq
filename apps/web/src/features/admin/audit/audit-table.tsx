"use client";
import type { AdminAuditEntry, AdminTargetType } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, useMessages, type DataTableColumnVisibility } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { adminKeys, listAdminAudit } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDateTime } from "@/lib/format";
import { ACTION_LABELS, TARGET_TYPE_LABELS } from "../common/admin-display";
import { AUDIT_MESSAGES } from "./audit.messages";

type Row = AdminAuditEntry & { actionLabel: string; org: string };

const col = createDataTableColumnHelper<Row>();
const makeColumns = (t: Record<keyof (typeof AUDIT_MESSAGES)["vi"], string>, targetLabels: Record<AdminTargetType, string>) => col.columns([
  col.accessor("at", {
    header: t.colAt,
    size: 160,
    meta: { hideable: false },
    cell: (c) => <span className="whitespace-nowrap tabular-nums text-fg-muted">{formatDateTime(c.getValue())}</span>,
  }),
  col.accessor("staffName", { header: t.colStaff, size: 180, meta: { filter: "select" } }),
  col.accessor("actionLabel", { header: t.colAction, size: 210, meta: { filter: "select" }, cell: (c) => <span className="font-medium text-fg">{c.getValue()}</span> }),
  col.accessor("targetLabel", {
    header: t.colTarget,
    size: 260,
    meta: { wrap: true },
    cell: (c) => (
      <div className="flex min-w-40 flex-col items-start gap-1">
        <Badge tone="neutral" variant="outline" size="sm">{targetLabels[c.row.original.targetType]}</Badge>
        <span className="text-fg">{c.getValue()}</span>
      </div>
    ),
  }),
  col.accessor("org", {
    header: t.colOrg,
    size: 240,
    meta: { wrap: true, filter: "select" },
    cell: (c) =>
      c.row.original.orgId ? (
        <Link href={`/admin/orgs/${c.row.original.orgId}`} className="text-primary hover:underline">{c.getValue()}</Link>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  }),
  col.accessor("reason", { header: t.colReason, size: 300, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 text-fg">{c.getValue()}</span> }),
  col.accessor((a) => a.detail ?? "", { id: "detail", header: t.colDetail, size: 220, meta: { wrap: true, label: t.colDetail }, cell: (c) => <span className="text-fg-muted">{c.getValue() || "—"}</span> }),
]);

/**
 * Nhật ký quản trị (append-only – không có thao tác sửa/xóa). `orgId` → chỉ dòng của một doanh nghiệp;
 * `from`/`to` (YYYY-MM-DD, theo giờ máy người xem) → lọc theo khoảng ngày.
 */
export function AuditTable({ orgId, from, to, toolbar, onClearRange }: {
  orgId?: string;
  from?: string | null;
  to?: string | null;
  toolbar?: ReactNode;
  /** Bỏ khoảng ngày đang lọc (nút "Xóa bộ lọc" khi khoảng ngày không có bản ghi nào). */
  onClearRange?: () => void;
}) {
  const t = useMessages(AUDIT_MESSAGES);
  const targetLabels = useMessages(TARGET_TYPE_LABELS);
  const actionLabels = useMessages(ACTION_LABELS);
  const columns = useMemo(() => makeColumns(t, targetLabels), [t, targetLabels]);
  const filter = orgId ? { orgId } : {};
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.audit(filter), queryFn: () => listAdminAudit(filter) });

  const rows = useMemo<Row[]>(() => {
    const start = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const end = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return (data ?? [])
      .filter((a) => {
        const at = new Date(a.at).getTime();
        return at >= start && at <= end;
      })
      .map((a) => ({ ...a, actionLabel: actionLabels[a.action], org: a.orgName ?? "" }));
  }, [data, from, to, actionLabels]);

  const hidden: DataTableColumnVisibility = orgId ? { org: false } : {};
  if (isError) return <LoadError onRetry={() => void refetch()} title={t.loadError} />;

  return (
    <DataTable
      aria-label={t.tableLabel}
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      loading={isLoading}
      searchable
      columnToggle
      columnVisibility={hidden}
      pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50, 100] }}
      emptyTitle={t.empty}
      emptyDescription={orgId ? t.emptyOrg : t.emptyAll}
      filtered={!!(from || to)}
      {...(onClearRange ? { onClearFilters: onClearRange } : {})}
      {...(toolbar ? { toolbarActions: toolbar } : {})}
    />
  );
}
