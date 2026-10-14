"use client";
import type { FailedJob, QueueStat } from "@kb/contracts";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader, RowActions, SkeletonCard, Stack, StatusBadge } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { adminKeys, getSystemHealth, retryFailedJob } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative } from "@/lib/format";
import { SERVICE_STATUS } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";

const num = (n: number) => <span className="tabular-nums">{formatNumber(n)}</span>;

const qCol = createDataTableColumnHelper<QueueStat>();
const QUEUE_COLUMNS = qCol.columns([
  qCol.accessor("name", { header: "Hàng đợi", meta: { hideable: false }, cell: (c) => <span className="font-medium text-fg">{c.getValue()}</span> }),
  qCol.accessor("waiting", { header: "Đang chờ", meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  qCol.accessor("active", { header: "Đang chạy", meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  qCol.accessor("failed", {
    header: "Lỗi",
    meta: { align: "end" },
    cell: (c) => (c.getValue() > 0 ? <Badge tone="danger">{formatNumber(c.getValue())} lỗi</Badge> : <span className="text-fg-subtle">0</span>),
  }),
  qCol.accessor("completedToday", { header: "Xong hôm nay", meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
]);

const jCol = createDataTableColumnHelper<FailedJob>();
const JOB_COLUMNS = jCol.columns([
  jCol.accessor("id", { header: "Job", size: 120, meta: { hideable: false, sticky: true }, cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span> }),
  jCol.accessor("queueName", { header: "Hàng đợi", size: 160, meta: { filter: "select" } }),
  jCol.accessor("kind", { header: "Việc", size: 220, meta: { wrap: true }, cell: (c) => <span className="block min-w-40">{c.getValue()}</span> }),
  jCol.accessor("orgName", {
    header: "Doanh nghiệp",
    size: 260,
    meta: { wrap: true },
    cell: (c) => <Link href={`/admin/orgs/${c.row.original.orgId}`} className="block min-w-40 text-primary hover:underline">{c.getValue()}</Link>,
  }),
  jCol.accessor("error", { header: "Lỗi", size: 320, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 text-fg">{c.getValue()}</span> }),
  jCol.accessor("attempts", { header: "Số lần thử", size: 120, meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  jCol.accessor("failedAt", { header: "Lỗi lúc", size: 140, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
]);

export function SystemHealthPage() {
  const { can } = useAdminSession();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: adminKeys.system, queryFn: getSystemHealth });
  const [retrying, setRetrying] = useState<FailedJob | null>(null);
  const retry = useAdminMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => retryFailedJob(id, { reason }),
    success: (job) => `Đã đưa ${job.id} vào hàng đợi chạy lại`,
    errorTitle: "Không chạy lại được job",
    onSuccess: () => setRetrying(null),
  });

  return (
    <Stack gap="lg">
      <PageHeader
        title="Sức khỏe hệ thống"
        description="Trạng thái dịch vụ nền và hàng đợi xử lý. Job lỗi chỉ hiện loại việc và thông báo lỗi – không có tên file hay nội dung chứng từ."
        actions={<Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} loading={isFetching && !isLoading} onClick={() => void refetch()}>Làm mới</Button>}
      />

      {isError ? (
        <LoadError onRetry={() => void refetch()} title="Không tải được trạng thái hệ thống" />
      ) : (
        <>
          {isLoading || !data ? (
            <Grid cols={{ base: 1, md: 2, xl: 4 }}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}</Grid>
          ) : (
            <Grid cols={{ base: 1, md: 2, xl: 4 }} stagger>
              {data.services.map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <CardTitle as="h3">{s.name}</CardTitle>
                    <div><StatusBadge status={SERVICE_STATUS[s.status]} /></div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-fg-muted">{s.detail}</p>
                    <p className="mt-2 text-xs text-fg-subtle">Kiểm tra {formatRelative(s.checkedAt)}</p>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          )}

          <Stack gap="sm">
            <h2 className="text-base font-semibold text-fg">Hàng đợi xử lý</h2>
            <DataTable aria-label="Hàng đợi xử lý" columns={QUEUE_COLUMNS} data={data?.queues ?? []} getRowId={(q) => q.id} loading={isLoading} loadingRows={4} pagination={false} emptyTitle="Chưa có hàng đợi" />
          </Stack>

          <Stack gap="sm">
            <h2 className="text-base font-semibold text-fg">Job lỗi chờ xử lý</h2>
            <DataTable
              aria-label="Job lỗi chờ xử lý"
              columns={JOB_COLUMNS}
              data={data?.failedJobs ?? []}
              getRowId={(j) => j.id}
              rowLabel={(j) => j.id}
              loading={isLoading}
              loadingRows={3}
              pagination={false}
              emptyTitle="Không có job lỗi"
              emptyDescription="Mọi việc trong hàng đợi đang chạy bình thường."
              {...(can("SUPPORT")
                ? {
                    rowActions: (j: FailedJob) => (
                      <RowActions rowLabel={j.id} actions={[{ id: "retry", label: "Chạy lại", icon: <RotateCw />, onSelect: () => setRetrying(j) }]} />
                    ),
                  }
                : {})}
            />
          </Stack>
        </>
      )}

      <ReasonDialog
        open={retrying !== null}
        onOpenChange={(o) => !o && setRetrying(null)}
        title="Chạy lại job?"
        icon={<RotateCw className="h-4 w-4" />}
        description={retrying ? `${retrying.id} · ${retrying.kind} · ${retrying.orgName}` : undefined}
        confirmLabel="Chạy lại"
        pending={retry.isPending}
        reasonHint="Vd: nhà cung cấp AI đã hết quá tải, khách yêu cầu chạy lại."
        onConfirm={(reason) => retrying && retry.mutate({ id: retrying.id, reason })}
      />
    </Stack>
  );
}
