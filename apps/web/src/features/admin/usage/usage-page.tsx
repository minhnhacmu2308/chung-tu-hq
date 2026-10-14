"use client";
import type { OrgUsageRow } from "@kb/contracts";
import { Badge, createDataTableColumnHelper, DataTable, Field, Grid, PageHeader, Select, SkeletonStats, Stack, StatCard, type DataTableColumnVisibility } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Coins, FileText, FolderOpen, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { adminKeys, getUsageReport, listUsageMonths } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatVnd } from "@/lib/format";
import { monthLabel, PLAN_TONE } from "../common/admin-display";

const money = (key: keyof OrgUsageRow, header: string, size = 150) =>
  col.accessor((r) => Number(r[key]), {
    id: key,
    header,
    size,
    meta: { align: "end", label: header },
    cell: (c) => <span className="tabular-nums">{formatVnd(String(c.row.original[key]))}</span>,
  });

const col = createDataTableColumnHelper<OrgUsageRow>();
const COLUMNS = col.columns([
  col.accessor("orgName", {
    header: "Doanh nghiệp",
    size: 280,
    minSize: 220,
    meta: { hideable: false, wrap: true },
    cell: (c) => <Link href={`/admin/orgs/${c.row.original.orgId}?tab=plan`} className="block min-w-48 font-medium text-primary hover:underline">{c.getValue()}</Link>,
  }),
  col.accessor("planName", { header: "Gói", size: 140, meta: { filter: "select" }, cell: (c) => <Badge tone={PLAN_TONE[c.row.original.planCode]}>{c.getValue()}</Badge> }),
  col.accessor("dossiers", { header: "Hồ sơ", size: 100, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("pages", { header: "Trang đã đọc", size: 130, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  col.accessor("aiCalls", { header: "Lệnh gọi trả phí", size: 150, meta: { align: "end" }, cell: (c) => <span className="tabular-nums">{formatNumber(c.getValue())}</span> }),
  money("readCostVnd", "Đọc chứng từ"),
  money("hsCostVnd", "Gợi ý mã HS"),
  money("customsCostVnd", "Customs Hub"),
  money("totalCostVnd", "Giá vốn"),
  money("planPriceVnd", "Giá gói"),
  col.accessor((r) => Number(r.marginVnd), {
    id: "marginVnd",
    header: "Biên ước tính",
    size: 170,
    meta: { align: "end", label: "Biên ước tính" },
    // Âm = đang lỗ: có chữ "Lỗ" đi kèm, không chỉ dựa vào màu.
    cell: (c) =>
      c.getValue() < 0 ? (
        <span className="inline-flex items-center justify-end gap-2">
          <Badge tone="danger" size="sm">Lỗ</Badge>
          <span className="tabular-nums text-danger-subtle-fg">{formatVnd(c.row.original.marginVnd)}</span>
        </span>
      ) : (
        <span className="tabular-nums">{formatVnd(c.row.original.marginVnd)}</span>
      ),
  }),
]);

function UsageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const months = useQuery({ queryKey: adminKeys.usageMonths, queryFn: listUsageMonths });
  const requested = params.get("month");
  const month = months.data?.includes(requested ?? "") ? requested! : months.data?.[0];
  const report = useQuery({ queryKey: adminKeys.usage(month ?? ""), queryFn: () => getUsageReport(month!), enabled: !!month });
  // Mặc định gọn: ẩn phần tách giá vốn theo loại lệnh gọi; bật lại qua nút "Cột".
  const [columnVisibility, setColumnVisibility] = useState<DataTableColumnVisibility>({ readCostVnd: false, hsCostVnd: false, customsCostVnd: false, aiCalls: false });

  const t = report.data?.totals;
  const failed = months.isError || report.isError;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Sử dụng & chi phí"
        description="Mức dùng và giá vốn (AI + API trả phí của bên thứ ba) theo từng doanh nghiệp, tính từ usage_events. Biên ước tính = giá gói − giá vốn, chưa gồm chi phí vận hành khác."
        actions={
          <Field label="Kỳ báo cáo" className="w-48">
            <Select
              value={month ?? ""}
              disabled={!months.data}
              onChange={(e) => router.replace(`${pathname}?month=${e.target.value}`, { scroll: false })}
              options={(months.data ?? []).map((m, i) => ({ value: m, label: i === 0 ? `${monthLabel(m)} (đang chạy)` : monthLabel(m) }))}
            />
          </Field>
        }
      />

      {failed && <LoadError onRetry={() => void (months.isError ? months.refetch() : report.refetch())} title="Không tải được báo cáo sử dụng" />}

      {!failed &&
        (t ? (
          <Grid cols={{ base: 2, xl: 4 }} stagger>
            <StatCard icon={<FolderOpen />} label="Hồ sơ" value={t.dossiers} hint={`${formatNumber(report.data!.rows.length)} doanh nghiệp có số liệu`} />
            <StatCard icon={<FileText />} tone="info" label="Trang đã đọc" value={t.pages} hint={`${formatNumber(t.aiCalls)} lệnh gọi trả phí`} />
            <StatCard icon={<Coins />} tone="warning" label="Giá vốn" value={formatVnd(t.totalCostVnd)} hint={t.dossiers > 0 ? `≈ ${formatVnd(String(Math.round(Number(t.totalCostVnd) / t.dossiers)))} / hồ sơ` : "chưa có hồ sơ"} />
            <StatCard
              icon={<TrendingUp />}
              tone={Number(t.marginVnd) < 0 ? "danger" : "success"}
              label="Biên ước tính"
              value={formatVnd(t.marginVnd)}
              hint={`Doanh thu gói ${formatVnd(t.revenueVnd)}`}
              hintTone={Number(t.marginVnd) < 0 ? "danger" : "default"}
            />
          </Grid>
        ) : (
          <SkeletonStats />
        ))}

      {!failed && (
        <DataTable
          aria-label={month ? `Sử dụng theo doanh nghiệp – ${monthLabel(month)}` : "Sử dụng theo doanh nghiệp"}
          columns={COLUMNS}
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
          emptyTitle="Chưa có số liệu cho kỳ này"
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
