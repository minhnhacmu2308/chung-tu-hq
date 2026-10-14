"use client";
import type { AttentionKind } from "@kb/contracts";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, SkeletonList, SkeletonStats, Stack, StatCard,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CalendarClock, CircleCheck, Coins, FolderOpen, Gauge, PlugZap, ServerCrash, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminKeys, getAdminOverview } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { PLAN_TONE } from "../common/admin-display";
import { useAdminSession } from "../shell/use-admin-session";

const ATTENTION_ICON: Record<AttentionKind, ReactNode> = {
  QUOTA: <Gauge />,
  PLAN_EXPIRING: <CalendarClock />,
  INTEGRATION_ERROR: <PlugZap />,
  JOBS_FAILED: <ServerCrash />,
  JOIN_PENDING: <UserRoundPlus />,
};

const rowLink =
  "flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function AdminOverviewPage() {
  const { staff } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.overview, queryFn: getAdminOverview });
  const firstName = staff?.name.split(" ").pop();
  const urgent = data?.attention.filter((a) => a.severity === "danger").length ?? 0;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Tổng quan vận hành"
        description={
          data
            ? `Chào ${firstName ?? "bạn"}, có ${data.attention.length} việc cần chú ý${urgent > 0 ? `, trong đó ${urgent} việc khẩn` : ""}.`
            : "Tình hình khách hàng, mức sử dụng và hạ tầng của toàn hệ thống."
        }
      />

      {isError && <LoadError onRetry={() => void refetch()} />}

      {isLoading || !data ? (
        !isError && <SkeletonStats />
      ) : (
        <Grid cols={{ base: 2, xl: 4 }} stagger>
          <StatCard
            icon={<Building2 />}
            label="Doanh nghiệp đang hoạt động"
            value={data.orgs.active}
            hint={`${data.orgs.suspended} tạm khóa · ${data.orgs.new30d} mới trong 30 ngày`}
          />
          <StatCard icon={<UsersRound />} tone="info" label="Người dùng" value={data.users.total} hint={`${data.users.active7d} hoạt động trong 7 ngày qua`} />
          <StatCard icon={<FolderOpen />} tone="success" label="Hồ sơ tháng này" value={data.dossiersThisMonth} hint="cộng mọi doanh nghiệp" />
          <StatCard
            icon={<Coins />}
            tone="warning"
            label="Chi phí AI tháng này"
            value={formatVnd(data.aiCostVnd)}
            hint={data.dossiersThisMonth > 0 ? `≈ ${formatVnd(String(Math.round(Number(data.aiCostVnd) / data.dossiersThisMonth)))} / hồ sơ` : "chưa có hồ sơ"}
          />
        </Grid>
      )}

      {!isError && (
        <Grid cols={{ base: 1, lg: 3 }} gap="lg" stagger>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Cần chú ý</CardTitle>
              <CardDescription>Việc khẩn đứng trước. Bấm vào để mở đúng màn xử lý.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <SkeletonList rows={4} />
              ) : data.attention.length === 0 ? (
                <EmptyState icon={<CircleCheck />} title="Không có gì cần xử lý" description="Hạn mức, gói, tích hợp và hàng đợi đều ổn." />
              ) : (
                <ul className="-mx-3 flex flex-col divide-y divide-border">
                  {data.attention.map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} className={rowLink}>
                        <span
                          aria-hidden="true"
                          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&>svg]:h-4.5 [&>svg]:w-4.5 ${a.severity === "danger" ? "bg-danger-subtle text-danger-subtle-fg" : "bg-warning-subtle text-warning-subtle-fg"}`}
                        >
                          {ATTENTION_ICON[a.kind]}
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="text-sm font-medium text-fg">{a.title}</p>
                          <p className="text-sm text-fg-muted">{a.detail}</p>
                        </div>
                        <Badge tone={a.severity === "danger" ? "danger" : "warning"}>{a.severity === "danger" ? "Khẩn" : "Lưu ý"}</Badge>
                        <ArrowRight className="hidden h-4 w-4 shrink-0 text-fg-subtle sm:block" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="self-start">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <CardTitle>Mới đăng ký</CardTitle>
                  <CardDescription>5 doanh nghiệp gần nhất.</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/orgs">Tất cả<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <SkeletonList rows={4} />
              ) : (
                <ul className="-mx-3 flex flex-col divide-y divide-border">
                  {data.recentOrgs.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orgs/${o.id}`} className={rowLink}>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <p className="text-sm font-medium text-fg">{o.name}</p>
                          <p className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
                            <Badge tone={PLAN_TONE[o.plan.code]} size="sm">{o.plan.name}</Badge>
                            {formatRelative(o.createdAt)} · {formatNumber(o.memberCount)} thành viên
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Stack>
  );
}
