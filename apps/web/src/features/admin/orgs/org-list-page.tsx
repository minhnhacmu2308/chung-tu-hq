"use client";
import type { AdminOrg } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, PageHeader, RowActions, SegmentedControl, Stack, StatusBadge } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, Lock, LockOpen } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { adminKeys, listAdminOrgs } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { ORG_STATUS, PLAN_TONE, statusLabel } from "../common/admin-display";
import { QuotaMeter } from "../common/quota-meter";
import { useAdminSession } from "../shell/use-admin-session";
import { OrgActionDialogs, type OrgAction } from "./org-actions";

/** Dòng hiển thị: thêm nhãn chữ để ô tìm kiếm/lọc khớp với điều người dùng nhìn thấy. */
type Row = AdminOrg & { planName: string; statusText: string; usageRatio: number };

const VIEWS = ["all", "active", "suspended", "trial"] as const;
type View = (typeof VIEWS)[number];

const col = createDataTableColumnHelper<Row>();
const COLUMNS = col.columns([
  col.accessor("name", {
    header: "Doanh nghiệp",
    size: 300,
    minSize: 220,
    meta: { hideable: false, wrap: true },
    cell: (c) => (
      <div className="min-w-48">
        <p className="font-medium text-fg">{c.getValue()}</p>
        <p className="font-mono text-xs text-fg-subtle">MST {c.row.original.taxCode}</p>
      </div>
    ),
  }),
  // Cột ẩn chỉ để ô tìm kiếm khớp được MST.
  col.accessor("taxCode", { header: "MST", meta: { cellClassName: "font-mono text-xs" } }),
  col.accessor("planName", {
    header: "Gói",
    size: 140,
    meta: { filter: "select" },
    cell: (c) => <Badge tone={PLAN_TONE[c.row.original.plan.code]}>{c.getValue()}</Badge>,
  }),
  col.accessor("statusText", {
    header: "Trạng thái",
    size: 160,
    meta: { filter: "select" },
    cell: (c) => <StatusBadge status={ORG_STATUS[c.row.original.status]} />,
  }),
  col.accessor("usageRatio", {
    header: "Hồ sơ tháng này",
    size: 190,
    meta: { label: "Hồ sơ tháng này" },
    cell: (c) => {
      const o = c.row.original;
      return <QuotaMeter compact used={o.usage.dossiersThisMonth} limit={o.plan.dossiersPerMonth} bonus={o.quotaBonus} />;
    },
  }),
  col.accessor((o) => Number(o.usage.aiCostVnd), {
    id: "aiCost",
    header: "Chi phí AI",
    size: 140,
    meta: { align: "end", label: "Chi phí AI" },
    cell: (c) => <span className="tabular-nums">{formatVnd(c.row.original.usage.aiCostVnd)}</span>,
  }),
  col.accessor("memberCount", { header: "Thành viên", size: 120, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor((o) => o.lastActiveAt ?? "", {
    id: "lastActive",
    header: "Hoạt động gần nhất",
    size: 170,
    meta: { label: "Hoạt động gần nhất" },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : "Chưa có"}</span>,
  }),
  col.accessor("createdAt", { header: "Ngày đăng ký", size: 140, cell: (c) => <span className="text-fg-muted">{formatDate(c.getValue())}</span> }),
]);

function ListInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: View = VIEWS.includes(raw as View) ? (raw as View) : "all";
  const { can } = useAdminSession();
  const orgs = useQuery({ queryKey: adminKeys.orgs, queryFn: listAdminOrgs });
  const [dialog, setDialog] = useState<{ org: AdminOrg; action: OrgAction } | null>(null);

  const rows = useMemo<Row[]>(
    () =>
      (orgs.data ?? [])
        .filter((o) => view === "all" || (view === "trial" ? o.plan.code === "TRIAL" : view === "suspended" ? o.status === "SUSPENDED" : o.status === "ACTIVE"))
        .map((o) => {
          const limit = o.plan.dossiersPerMonth + o.quotaBonus;
          return { ...o, planName: o.plan.name, statusText: statusLabel(ORG_STATUS[o.status]), usageRatio: limit > 0 ? o.usage.dossiersThisMonth / limit : 0 };
        }),
    [orgs.data, view],
  );

  const setView = (v: View) => router.replace(v === "all" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  const count = (v: View) => (orgs.data ?? []).filter((o) => (v === "trial" ? o.plan.code === "TRIAL" : v === "suspended" ? o.status === "SUSPENDED" : o.status === "ACTIVE")).length;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Doanh nghiệp"
        description="Mọi doanh nghiệp khách hàng trên hệ thống: gói, mức dùng trong tháng, trạng thái. Chỉ có số liệu tổng hợp – không mở được nội dung hồ sơ hay chứng từ của khách."
      />
      {orgs.isError && <LoadError onRetry={() => void orgs.refetch()} title="Không tải được danh sách doanh nghiệp" />}
      <Stack gap="md">
        <SegmentedControl<View>
          label="Nhóm doanh nghiệp"
          hideLabel
          className="justify-start"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: orgs.data ? `Tất cả (${orgs.data.length})` : "Tất cả" },
            { value: "active", label: orgs.data ? `Đang hoạt động (${count("active")})` : "Đang hoạt động" },
            { value: "suspended", label: orgs.data ? `Tạm khóa (${count("suspended")})` : "Tạm khóa" },
            { value: "trial", label: orgs.data ? `Dùng thử (${count("trial")})` : "Dùng thử" },
          ]}
        />
        <DataTable
          aria-label="Doanh nghiệp"
          columns={COLUMNS}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          loading={orgs.isLoading}
          searchable
          columnToggle
          columnVisibility={{ taxCode: false }}
          initialSorting={[{ id: "usageRatio", desc: true }]}
          pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
          onRowClick={(r) => router.push(`/admin/orgs/${r.id}`)}
          emptyTitle="Không có doanh nghiệp nào trong nhóm này"
          emptyDescription="Chọn nhóm khác để xem."
          rowActions={(r) => (
            <RowActions
              rowLabel={r.name}
              actions={[
                { id: "open", label: "Mở trang doanh nghiệp", icon: <Building2 />, onSelect: () => router.push(`/admin/orgs/${r.id}`) },
                ...(can("SUPPORT")
                  ? [
                      r.status === "ACTIVE"
                        ? { id: "suspend", label: "Tạm khóa", icon: <Lock />, tone: "danger" as const, quick: false, onSelect: () => setDialog({ org: r, action: "suspend" }) }
                        : { id: "reactivate", label: "Mở khóa", icon: <LockOpen />, quick: false, onSelect: () => setDialog({ org: r, action: "reactivate" }) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      </Stack>
      {dialog && <OrgActionDialogs org={dialog.org} action={dialog.action} onClose={() => setDialog(null)} />}
    </Stack>
  );
}

export function OrgListPage() {
  return (
    <Suspense>
      <ListInner />
    </Suspense>
  );
}
