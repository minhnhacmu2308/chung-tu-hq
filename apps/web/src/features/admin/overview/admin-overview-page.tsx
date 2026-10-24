"use client";
import type { AttentionKind } from "@kb/contracts";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, IconTile, PageHeader, SkeletonList, SkeletonStats, Stack, StatCard, fill, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, CalendarClock, CircleCheck, Coins, FolderOpen, Gauge, Landmark, PlugZap, ServerCrash, UserRoundPlus, UsersRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminKeys, getAdminOverview } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { PLAN_TONE } from "../common/admin-display";
import { useAdminSession } from "../shell/use-admin-session";
import { OVERVIEW_MESSAGES } from "./admin-overview-page.messages";

const ATTENTION_ICON: Record<AttentionKind, ReactNode> = {
  QUOTA: <Gauge />,
  PLAN_EXPIRING: <CalendarClock />,
  INTEGRATION_ERROR: <PlugZap />,
  JOBS_FAILED: <ServerCrash />,
  JOIN_PENDING: <UserRoundPlus />,
  RATE_FETCH: <Landmark />,
};

const rowLink =
  "flex items-center gap-3 rounded-md px-3 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

export function AdminOverviewPage() {
  const { staff } = useAdminSession();
  const t = useMessages(OVERVIEW_MESSAGES);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.overview, queryFn: getAdminOverview });
  const firstName = staff?.name.split(" ").pop();
  const urgent = data?.attention.filter((a) => a.severity === "danger").length ?? 0;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={
          data
            ? fill(t.greeting, { name: firstName ?? t.you, n: data.attention.length, urgent: urgent > 0 ? fill(t.greetingUrgent, { n: urgent }) : "" })
            : t.description
        }
      />

      {isError && <LoadError onRetry={() => void refetch()} />}

      {isLoading || !data ? (
        !isError && <SkeletonStats />
      ) : (
        <Grid cols={{ base: 2, xl: 4 }} stagger>
          <StatCard
            icon={<Building2 />}
            label={t.activeOrgs}
            value={data.orgs.active}
            hint={fill(t.orgsHint, { suspended: data.orgs.suspended, new30d: data.orgs.new30d })}
          />
          <StatCard icon={<UsersRound />} tone="info" label={t.users} value={data.users.total} hint={fill(t.usersHint, { n: data.users.active7d })} />
          <StatCard icon={<FolderOpen />} tone="success" label={t.dossiersThisMonth} value={data.dossiersThisMonth} hint={t.dossiersHint} />
          <StatCard
            icon={<Coins />}
            tone="warning"
            label={t.aiCost}
            value={formatVnd(data.aiCostVnd)}
            hint={data.dossiersThisMonth > 0 ? fill(t.perDossier, { cost: formatVnd(String(Math.round(Number(data.aiCostVnd) / data.dossiersThisMonth))) }) : t.noDossiers}
          />
        </Grid>
      )}

      {!isError && (
        <Grid cols={{ base: 1, lg: 3 }} gap="lg" stagger>
          <Card className="cq-lg:col-span-2">
            <CardHeader>
              <CardTitle>{t.attention}</CardTitle>
              <CardDescription>{t.attentionDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? (
                <SkeletonList rows={4} />
              ) : data.attention.length === 0 ? (
                <EmptyState icon={<CircleCheck />} title={t.nothingTitle} description={t.nothingDescription} />
              ) : (
                <ul className="-mx-3 flex flex-col divide-y divide-border">
                  {data.attention.map((a) => (
                    <li key={a.id}>
                      <Link href={a.href} className={rowLink}>
                        <IconTile icon={ATTENTION_ICON[a.kind]} tone={a.severity === "danger" ? "danger" : "warning"} size="md" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <p className="text-sm font-medium text-fg">{a.title}</p>
                          <p className="text-sm text-fg-muted">{a.detail}</p>
                        </div>
                        <Badge tone={a.severity === "danger" ? "danger" : "warning"}>{a.severity === "danger" ? t.urgent : t.note}</Badge>
                        <ArrowRight className="hidden h-4 w-4 shrink-0 text-fg-subtle cq-sm:block" aria-hidden="true" />
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
                  <CardTitle>{t.recentSignups}</CardTitle>
                  <CardDescription>{t.recentSignupsDescription}</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/orgs">{t.all}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
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
                            {formatRelative(o.createdAt)} · {fill(t.members, { n: formatNumber(o.memberCount) })}
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
