"use client";
import { LOW_CREDITS, type AdminOrg } from "@kb/contracts";
import { Badge, Button, createDataTableColumnHelper, DataTable, fill, PageHeader, RowActions, SegmentedControl, Stack, StatusBadge, useMessages, useUiLocale } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Building2, Lock, LockOpen, Plus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { adminKeys, listAdminOrgs } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { ORG_STATUS, PLAN_TONE, statusLabel } from "../common/admin-display";
import { ContractStatusBadge } from "@/components/common/billing-display";
import { useAdminSession } from "../shell/use-admin-session";
import { CREATE_ORG_MESSAGES, ORG_LIST_MESSAGES } from "./orgs.messages";
import { CreateOrgDialog } from "./create-org-dialog";
import { OrgActionDialogs, type OrgAction } from "./org-actions";

/** Dòng hiển thị: thêm nhãn chữ để ô tìm kiếm/lọc khớp với điều người dùng nhìn thấy. */
type Row = AdminOrg & { planName: string; statusText: string; balanceSort: number };

const VIEWS = ["all", "active", "suspended", "payg", "contract"] as const;
type View = (typeof VIEWS)[number];

/** Nhóm: trạng thái (đang hoạt động / tạm khóa) hoặc loại gói (Theo lượt / Hợp đồng năm). */
const inView = (o: AdminOrg, v: View) =>
  v === "all" || (v === "payg" ? o.plan.kind === "PAYG" : v === "contract" ? o.plan.kind === "CONTRACT" : v === "suspended" ? o.status === "SUSPENDED" : o.status === "ACTIVE");

const col = createDataTableColumnHelper<Row>();
const makeColumns = (t: (typeof ORG_LIST_MESSAGES)["vi"]) => col.columns([
  col.accessor("name", {
    header: t.colOrg,
    size: 300,
    minSize: 220,
    meta: { hideable: false, wrap: true },
    cell: (c) => (
      <div className="min-w-48">
        <p className="font-medium text-fg">{c.getValue()}</p>
        <p className="font-mono text-xs text-fg-subtle">{fill(t.taxCodeLine, { code: c.row.original.taxCode })}</p>
      </div>
    ),
  }),
  // Cột ẩn chỉ để ô tìm kiếm khớp được MST.
  col.accessor("taxCode", { header: t.taxCodeCol, meta: { cellClassName: "font-mono text-xs" } }),
  col.accessor("planName", {
    header: t.colPlan,
    size: 140,
    meta: { filter: "select" },
    cell: (c) => <Badge tone={PLAN_TONE[c.row.original.plan.code]}>{c.getValue()}</Badge>,
  }),
  col.accessor("statusText", {
    header: t.colStatus,
    size: 160,
    meta: { filter: "select" },
    cell: (c) => <StatusBadge status={ORG_STATUS[c.row.original.status]} />,
  }),
  col.accessor("balanceSort", {
    header: t.colBalance,
    size: 200,
    meta: { label: t.colBalance },
    cell: (c) => {
      const o = c.row.original;
      if (o.plan.kind === "PAYG") {
        const low = o.billing.balance <= LOW_CREDITS;
        return <span className={low ? "font-medium tabular-nums text-warning-subtle-fg" : "tabular-nums text-fg"}>{fill(t.balanceN, { n: formatNumber(o.billing.balance) })}</span>;
      }
      const k = o.billing.contract;
      if (!k?.endsOn) return <span className="text-fg-muted">{t.contractNoEnd}</span>;
      return (
        <span className="flex flex-col items-start gap-1">
          <span className="tabular-nums text-fg">{fill(t.contractUntil, { date: formatDate(k.endsOn) })}</span>
          {k.status !== "ACTIVE" && <ContractStatusBadge contract={k} />}
        </span>
      );
    },
  }),
  col.accessor((o) => o.usage.dossiersThisMonth, {
    id: "dossiers",
    header: t.colDossiers,
    size: 140,
    meta: { align: "end", label: t.colDossiers },
    cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span>,
  }),
  col.accessor((o) => Number(o.usage.aiCostVnd), {
    id: "aiCost",
    header: t.colAiCost,
    size: 140,
    meta: { align: "end", label: t.colAiCost },
    cell: (c) => <span className="tabular-nums">{formatVnd(c.row.original.usage.aiCostVnd)}</span>,
  }),
  col.accessor("memberCount", { header: t.colMembers, size: 120, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor((o) => o.lastActiveAt ?? "", {
    id: "lastActive",
    header: t.colLastActive,
    size: 170,
    meta: { label: t.colLastActive },
    cell: (c) => <span className="text-fg-muted">{c.getValue() ? formatRelative(c.getValue()) : t.never}</span>,
  }),
  col.accessor("createdAt", { header: t.colCreated, size: 140, cell: (c) => <span className="text-fg-muted">{formatDate(c.getValue())}</span> }),
]);

function ListInner() {
  const t = useMessages(ORG_LIST_MESSAGES);
  const tc = useMessages(CREATE_ORG_MESSAGES);
  const [createOpen, setCreateOpen] = useState(false);
  const locale = useUiLocale();
  const columns = useMemo(() => makeColumns(t), [t]);
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
        .filter((o) => inView(o, view))
        .map((o) => ({
          ...o,
          planName: o.plan.kind === "PAYG" ? t.payg : t.contract,
          statusText: statusLabel(ORG_STATUS[o.status], locale),
          // Sắp xếp: doanh nghiệp Theo lượt ít lượt nhất / hợp đồng gần hết hạn nhất lên đầu.
          balanceSort: o.plan.kind === "PAYG" ? o.billing.balance : (o.billing.contract?.daysLeft ?? Number.MAX_SAFE_INTEGER),
        })),
    [orgs.data, view, locale, t],
  );

  const setView = (v: View) => router.replace(v === "all" ? pathname : `${pathname}?view=${v}`, { scroll: false });
  const count = (v: View) => (orgs.data ?? []).filter((o) => inView(o, v)).length;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={can("BILLING") && <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>{tc.open}</Button>}
      />
      {orgs.isError && <LoadError onRetry={() => void orgs.refetch()} title={t.loadError} />}
      <Stack gap="md">
        <SegmentedControl<View>
          label={t.groupLabel}
          hideLabel
          className="justify-start"
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: orgs.data ? fill(t.withCount, { label: t.all, n: orgs.data.length }) : t.all },
            { value: "active", label: orgs.data ? fill(t.withCount, { label: t.active, n: count("active") }) : t.active },
            { value: "suspended", label: orgs.data ? fill(t.withCount, { label: t.suspended, n: count("suspended") }) : t.suspended },
            { value: "payg", label: orgs.data ? fill(t.withCount, { label: t.payg, n: count("payg") }) : t.payg },
            { value: "contract", label: orgs.data ? fill(t.withCount, { label: t.contract, n: count("contract") }) : t.contract },
          ]}
        />
        <DataTable
          aria-label={t.title}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          loading={orgs.isLoading}
          searchable
          columnToggle
          columnVisibility={{ taxCode: false }}
          initialSorting={[{ id: "dossiers", desc: true }]}
          pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
          onRowClick={(r) => router.push(`/admin/orgs/${r.id}`)}
          emptyTitle={t.emptyTitle}
          emptyDescription={t.emptyDescription}
          filtered={view !== "all"}
          onClearFilters={() => setView("all")}
          rowActions={(r) => (
            <RowActions
              rowLabel={r.name}
              actions={[
                { id: "open", label: t.open, icon: <Building2 />, primary: true, onSelect: () => router.push(`/admin/orgs/${r.id}`) },
                ...(can("SUPPORT")
                  ? [
                      r.status === "ACTIVE"
                        ? { id: "suspend", label: t.suspend, icon: <Lock />, tone: "danger" as const, quick: false, onSelect: () => setDialog({ org: r, action: "suspend" }) }
                        : { id: "reactivate", label: t.reactivate, icon: <LockOpen />, quick: false, onSelect: () => setDialog({ org: r, action: "reactivate" }) },
                    ]
                  : []),
              ]}
            />
          )}
        />
      </Stack>
      {dialog && <OrgActionDialogs org={dialog.org} action={dialog.action} onClose={() => setDialog(null)} />}
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
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
