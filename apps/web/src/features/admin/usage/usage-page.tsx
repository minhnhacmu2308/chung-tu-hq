"use client";
import type { OrgUsageRow } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, Field, fill, Grid, PageHeader, Select, SkeletonStats, Stack, StatCard, useMessages, useUiLocale, type DataTableColumnVisibility } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Coins, FileText, FolderOpen, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { adminKeys, getUsageReport, listUsageMonths } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatVnd } from "@/lib/format";
import { monthLabel, PLAN_TONE } from "../common/admin-display";
import { USAGE_MESSAGES } from "./usage-page.messages";

type UsageMessages = (typeof USAGE_MESSAGES)["vi"];

const money = (key: keyof OrgUsageRow, header: string, size = 150) =>
  col.accessor((r) => Number(r[key]), {
    id: key,
    header,
    size,
    meta: { align: "end", label: header },
    cell: (c) => <span className="tabular-nums">{formatVnd(String(c.row.original[key]))}</span>,
  });

const col = createDataTableColumnHelper<OrgUsageRow>();
const makeColumns = (m: UsageMessages) => col.columns([
  col.accessor("orgName", {
    header: m.colOrg,
    size: 280,
    minSize: 220,
    meta: { hideable: false, wrap: true },
    cell: (c) => <Link href={`/admin/orgs/${c.row.original.orgId}?tab=plan`} className="block min-w-48 font-medium text-primary hover:underline">{c.getValue()}</Link>,
  }),
  col.accessor("planName", { header: m.colPlan, size: 140, meta: { filter: "select" }, cell: (c) => <Badge tone={PLAN_TONE[c.row.original.planCode]}>{c.getValue()}</Badge> }),
  col.accessor("dossiers", { header: m.colDossiers, size: 100, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("pages", { header: m.colPages, size: 130, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("aiCalls", { header: m.colAiCalls, size: 150, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("hsItems", { header: m.colHsItems, size: 170, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("customsMessages", { header: m.colCustomsMessages, size: 190, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  money("readCostVnd", m.colReadCost),
  money("hsCostVnd", m.colHsCost),
  money("customsCostVnd", m.colCustomsCost),
  money("totalCostVnd", m.colTotalCost),
  money("planPriceVnd", m.colPlanPrice),
  col.accessor((r) => Number(r.marginVnd), {
    id: "marginVnd",
    header: m.colMargin,
    size: 170,
    meta: { align: "end", label: m.colMargin },
    // Âm = đang lỗ: có chữ "Lỗ" đi kèm, không chỉ dựa vào màu.
    cell: (c) =>
      c.getValue() < 0 ? (
        <span className="inline-flex items-center justify-end gap-2">
          <Badge tone="danger" size="sm">{m.loss}</Badge>
          <span className="tabular-nums text-danger-subtle-fg">{formatVnd(c.row.original.marginVnd)}</span>
        </span>
      ) : (
        <span className="tabular-nums">{formatVnd(c.row.original.marginVnd)}</span>
      ),
  }),
]);

function UsageInner() {
  const m = useMessages(USAGE_MESSAGES);
  const locale = useUiLocale();
  const columns = useMemo(() => makeColumns(m), [m]);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const months = useQuery({ queryKey: adminKeys.usageMonths, queryFn: listUsageMonths });
  const requested = params.get("month");
  const month = months.data?.includes(requested ?? "") ? requested! : months.data?.[0];
  const report = useQuery({ queryKey: adminKeys.usage(month ?? ""), queryFn: () => getUsageReport(month!), enabled: !!month });
  // Mặc định gọn: ẩn phần tách giá vốn/số lượng theo nhà cung cấp (AI, HSCodePro, Customs Hub); bật lại qua nút "Cột".
  const [columnVisibility, setColumnVisibility] = useState<DataTableColumnVisibility>({ readCostVnd: false, hsCostVnd: false, customsCostVnd: false, aiCalls: false, hsItems: false, customsMessages: false });

  const t = report.data?.totals;
  const failed = months.isError || report.isError;

  return (
    <Stack gap="lg">
      <PageHeader
        title={m.title}
        description={m.description}
        actions={
          <Field label={m.period} className="w-48">
            <Select
              value={month ?? ""}
              disabled={!months.data}
              onChange={(e) => router.replace(`${pathname}?month=${e.target.value}`, { scroll: false })}
              options={(months.data ?? []).map((mo, i) => ({ value: mo, label: i === 0 ? fill(m.running, { month: monthLabel(mo, locale) }) : monthLabel(mo, locale) }))}
            />
          </Field>
        }
      />

      {failed && <LoadError onRetry={() => void (months.isError ? months.refetch() : report.refetch())} title={m.loadError} />}

      {!failed &&
        (t ? (
          <Grid cols={{ base: 2, xl: 4 }} stagger>
            <StatCard icon={<FolderOpen />} label={m.statDossiers} value={t.dossiers} hint={fill(m.statDossiersHint, { n: formatNumber(report.data!.rows.length) })} />
            <StatCard icon={<FileText />} tone="info" label={m.statPages} value={t.pages} hint={fill(m.statPagesHint, { n: formatNumber(t.aiCalls) })} />
            <StatCard icon={<Coins />} tone="warning" label={m.statCost} value={formatVnd(t.totalCostVnd)} hint={t.dossiers > 0 ? fill(m.perDossier, { amount: formatVnd(String(Math.round(Number(t.totalCostVnd) / t.dossiers))) }) : m.noDossiers} />
            <StatCard
              icon={<TrendingUp />}
              tone={Number(t.marginVnd) < 0 ? "danger" : "success"}
              label={m.statMargin}
              value={formatVnd(t.marginVnd)}
              hint={fill(m.revenue, { amount: formatVnd(t.revenueVnd) })}
              hintTone={Number(t.marginVnd) < 0 ? "danger" : "default"}
            />
          </Grid>
        ) : (
          <SkeletonStats />
        ))}

      {!failed && (
        <DataTable
          aria-label={month ? fill(m.tableLabelMonth, { month: monthLabel(month, locale) }) : m.tableLabel}
          columns={columns}
          data={report.data?.rows ?? []}
          getRowId={(r) => r.orgId}
          rowLabel={(r) => r.orgName}
          loading={months.isLoading || report.isLoading}
          searchable
          columnToggle
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          initialSorting={[{ id: "totalCostVnd", desc: true }]}
          pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50] }}
          emptyTitle={m.empty}
        />
      )}
    </Stack>
  );
}

export function UsagePage() {
  return (
    <Suspense>
      <UsageInner />
    </Suspense>
  );
}
