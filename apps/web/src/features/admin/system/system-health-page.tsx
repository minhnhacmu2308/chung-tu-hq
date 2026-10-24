"use client";
import type { FailedJob, QueueStat } from "@kb/contracts";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, fill, Grid, PageHeader, RowActions, SkeletonCard, Stack, StatusBadge, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, RotateCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { adminKeys, getSystemHealth, retryFailedJob } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative } from "@/lib/format";
import { SERVICE_STATUS } from "../common/admin-display";
import { ReasonDialog } from "../common/reason-dialog";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { SYSTEM_HEALTH_MESSAGES } from "./system-health-page.messages";

type T = Record<keyof (typeof SYSTEM_HEALTH_MESSAGES)["vi"], string>;

const num = (n: number) => <span className="tabular-nums">{formatNumber(n)}</span>;

const qCol = createDataTableColumnHelper<QueueStat>();
const makeQueueColumns = (t: T) => qCol.columns([
  qCol.accessor("name", { header: t.colQueue, meta: { hideable: false }, cell: (c) => <span className="font-medium text-fg">{c.getValue()}</span> }),
  qCol.accessor("waiting", { header: t.colWaiting, meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  qCol.accessor("active", { header: t.colActive, meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  qCol.accessor("failed", {
    header: t.colFailed,
    meta: { align: "end" },
    cell: (c) => (c.getValue() > 0 ? <Badge tone="danger">{fill(t.failedCount, { n: formatNumber(c.getValue()) })}</Badge> : <span className="text-fg-subtle">0</span>),
  }),
  qCol.accessor("completedToday", { header: t.colCompletedToday, meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
]);

const jCol = createDataTableColumnHelper<FailedJob>();
const makeJobColumns = (t: T) => jCol.columns([
  jCol.accessor("id", { header: "Job", size: 120, meta: { hideable: false, sticky: true }, cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span> }),
  jCol.accessor("queueName", { header: t.colQueue, size: 160, meta: { filter: "select" } }),
  jCol.accessor("kind", { header: t.colKind, size: 220, meta: { wrap: true }, cell: (c) => <span className="block min-w-40">{c.getValue()}</span> }),
  jCol.accessor("orgName", {
    header: t.colOrg,
    size: 260,
    meta: { wrap: true },
    cell: (c) => <Link href={`/admin/orgs/${c.row.original.orgId}`} className="block min-w-40 text-primary hover:underline">{c.getValue()}</Link>,
  }),
  jCol.accessor("error", { header: t.colError, size: 320, meta: { wrap: true }, cell: (c) => <span className="block min-w-48 text-fg">{c.getValue()}</span> }),
  jCol.accessor("attempts", { header: t.colAttempts, size: 120, meta: { align: "end" }, cell: (c) => num(c.getValue()) }),
  jCol.accessor("failedAt", { header: t.colFailedAt, size: 140, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
]);

export function SystemHealthPage() {
  const t = useMessages(SYSTEM_HEALTH_MESSAGES);
  const queueColumns = useMemo(() => makeQueueColumns(t), [t]);
  const jobColumns = useMemo(() => makeJobColumns(t), [t]);
  const { can } = useAdminSession();
  const { data, isLoading, isError, isFetching, refetch } = useQuery({ queryKey: adminKeys.system, queryFn: getSystemHealth });
  const [retrying, setRetrying] = useState<FailedJob | null>(null);
  const retry = useAdminMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => retryFailedJob(id, { reason }),
    success: (job) => fill(t.retriedToast, { id: job.id }),
    errorTitle: t.retryError,
    onSuccess: () => setRetrying(null),
  });

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={<Button variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} loading={isFetching && !isLoading} onClick={() => void refetch()}>{t.refresh}</Button>}
      />

      {isError ? (
        <LoadError onRetry={() => void refetch()} title={t.loadError} />
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
                    <p className="mt-2 text-xs text-fg-subtle">{fill(t.checked, { time: formatRelative(s.checkedAt) })}</p>
                  </CardContent>
                </Card>
              ))}
            </Grid>
          )}

          <Stack gap="sm">
            <h2 className="text-base font-semibold text-fg">{t.queues}</h2>
            <DataTable aria-label={t.queues} columns={queueColumns} data={data?.queues ?? []} getRowId={(q) => q.id} loading={isLoading} loadingRows={4} pagination={false} emptyTitle={t.noQueues} />
          </Stack>

          <Stack gap="sm">
            <h2 className="text-base font-semibold text-fg">{t.failedJobs}</h2>
            <DataTable
              aria-label={t.failedJobs}
              columns={jobColumns}
              data={data?.failedJobs ?? []}
              getRowId={(j) => j.id}
              rowLabel={(j) => j.id}
              loading={isLoading}
              loadingRows={3}
              pagination={false}
              emptyTitle={t.noFailedJobs}
              emptyDescription={t.noFailedJobsDescription}
              {...(can("SUPPORT")
                ? {
                    rowActions: (j: FailedJob) => (
                      <RowActions rowLabel={j.id} actions={[{ id: "retry", label: t.retry, icon: <RotateCw />, onSelect: () => setRetrying(j) }]} />
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
        title={t.retryTitle}
        icon={<RotateCw className="h-4 w-4" />}
        description={retrying ? `${retrying.id} · ${retrying.kind} · ${retrying.orgName}` : undefined}
        confirmLabel={t.retry}
        pending={retry.isPending}
        reasonHint={t.retryHint}
        onConfirm={(reason) => retrying && retry.mutate({ id: retrying.id, reason })}
      />
    </Stack>
  );
}
