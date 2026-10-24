"use client";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, Progress, Skeleton, Stack, StatCard, SkeletonStats, SkeletonList, fill, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, FileSearch, FolderOpen, Plus, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { dossierKeys, listDossiers } from "@/api/dossiers";
import { getSession, sessionKeys } from "@/api/session";
import { ChannelBadge, DossierStatusBadge, DueBadge } from "@/features/dossiers/dossier-badges";
import { DIRECTION_LABELS, isOpen } from "@/features/dossiers/dossier-display";
import { daysUntil, formatDate, formatMoney, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { STEP_LABELS, type Dossier } from "@/mocks/types";
import { DASHBOARD_MESSAGES } from "./dashboard.messages";

const rowLink =
  "flex rounded-md px-3 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

function TodoRow({ d }: { d: Dossier }) {
  const t = useMessages(DASHBOARD_MESSAGES);
  const directionLabels = useMessages(DIRECTION_LABELS);
  const stepLabels = useMessages(STEP_LABELS);
  return (
    <li>
      <Link href={`/dossiers/${d.id}`} className={`${rowLink} flex-col gap-2 cq-sm:flex-row cq-sm:items-center cq-sm:gap-4`}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-muted">{d.code}</span>
            <Badge tone={d.direction === "NK" ? "info" : "primary"} variant="outline">{directionLabels[d.direction]}</Badge>
          </div>
          <p className="truncate text-sm font-medium text-fg">{d.partner}</p>
          <p className="text-sm text-fg-muted">
            {fill(t.step, { step: stepLabels[d.step] })}
            {d.suspectFields > 0 && fill(t.suspectFields, { n: d.suspectFields })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DossierStatusBadge status={d.status} />
          <DueBadge dossier={d} />
          <ArrowRight className="hidden h-4 w-4 text-fg-subtle cq-sm:block" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}

function SectionHeader({ title, description, href, linkLabel }: { title: string; description: string; href: string; linkLabel: string }) {
  return (
    <CardHeader>
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>{linkLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </Button>
      </div>
    </CardHeader>
  );
}

export function DashboardPage() {
  const t = useMessages(DASHBOARD_MESSAGES);
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });

  const all = dossiers.data ?? [];
  const open = all.filter(isOpen);
  const active = open.filter((d) => d.status !== "SUBMITTED");
  const dueSoon = active.filter((d) => daysUntil(d.dueDate) <= 2);
  const overdue = dueSoon.filter((d) => daysUntil(d.dueDate) < 0);
  const suspect = open.reduce((n, d) => n + d.suspectFields, 0);
  const suspectDossiers = open.filter((d) => d.suspectFields > 0).length;
  const submitted = all.filter((d) => d.declarationNo);
  const todo = [...active].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
  const recent = [...submitted].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6);
  const firstName = session.data?.user.name.split(" ").pop();
  const org = session.data?.org;
  const usageRatio = org ? org.usage.dossiersThisMonth / org.plan.dossiersPerMonth : 0;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={
          firstName && dossiers.data
            ? fill(t.greeting, { name: firstName, n: active.length })
            : t.subtitle
        }
        actions={
          <Button asChild>
            <Link href="/dossiers/new"><Plus className="h-4 w-4" aria-hidden="true" />{t.create}</Link>
          </Button>
        }
      />

      {dossiers.isError && (
        <Alert tone="danger" title={t.loadError} action={<Button size="sm" variant="secondary" onClick={() => dossiers.refetch()}>{t.retry}</Button>}>
          {t.loadErrorHint}
        </Alert>
      )}

      {dossiers.isLoading ? (
        <SkeletonStats />
      ) : (
        <Grid cols={{ base: 2, xl: 4 }} stagger>
          <StatCard
            icon={<FolderOpen />}
            label={t.statOpen}
            value={open.length}
            hint={fill(t.statOpenHint, { nk: open.filter((d) => d.direction === "NK").length, xk: open.filter((d) => d.direction === "XK").length })}
          />
          <StatCard
            icon={<CalendarClock />}
            tone={overdue.length > 0 ? "danger" : "warning"}
            label={t.statDue}
            value={dueSoon.length}
            hint={overdue.length ? fill(t.statOverdue, { n: overdue.length }) : t.statNoOverdue}
            hintTone={overdue.length > 0 ? "danger" : "default"}
          />
          <StatCard icon={<FileSearch />} tone="info" label={t.statSuspect} value={suspect} hint={fill(t.statSuspectHint, { n: suspectDossiers })} />
          <StatCard icon={<Send />} tone="success" label={t.statSubmitted} value={submitted.length} hint={t.statSubmittedHint} />
        </Grid>
      )}

      <Grid cols={{ base: 1, lg: 3 }} gap="lg" stagger>
        <Card className="cq-lg:col-span-2">
          <SectionHeader title={t.todoTitle} description={t.todoDesc} href="/dossiers" linkLabel={t.viewAll} />
          <CardContent>
            {dossiers.isLoading ? (
              <SkeletonList rows={4} />
            ) : todo.length === 0 ? (
              <EmptyState
                title={t.todoEmpty}
                description={t.todoEmptyDesc}
                action={<Button asChild size="sm"><Link href="/dossiers/new">{t.create}</Link></Button>}
              />
            ) : (
              <ul className="-mx-3 flex flex-col divide-y divide-border">
                {todo.map((d) => <TodoRow key={d.id} d={d} />)}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle>{t.plan}</CardTitle>
            <CardDescription>{org ? fill(t.planDesc, { name: org.plan.name, date: formatDate(org.plan.renewsAt) }) : t.loading}</CardDescription>
          </CardHeader>
          <CardContent>
            {!org ? (
              <Stack gap="sm"><Skeleton className="h-8" /><Skeleton className="h-16" /></Stack>
            ) : (
              <Stack gap="md">
                <Stack gap="xs">
                  <Progress
                    label={t.dossiersThisMonth}
                    showValue
                    value={org.usage.dossiersThisMonth}
                    max={org.plan.dossiersPerMonth}
                    tone={usageRatio > 0.8 ? "warning" : "primary"}
                  />
                  <p className="text-xs text-fg-subtle">
                    {fill(t.quotaLine, { used: formatNumber(org.usage.dossiersThisMonth), max: formatNumber(org.plan.dossiersPerMonth), pages: org.plan.pagesPerDossier })}
                  </p>
                </Stack>
                <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-fg-subtle">{t.pagesRead}</dt>
                    <dd className="font-semibold tabular-nums text-fg">{formatNumber(org.usage.pagesThisMonth)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-fg-subtle">{t.aiCost}</dt>
                    <dd className="font-semibold tabular-nums text-fg">{formatVnd(org.usage.aiCostVnd)}</dd>
                  </div>
                </dl>
                <Button asChild variant="secondary" size="sm">
                  <Link href="/settings">{t.managePlan}</Link>
                </Button>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Grid>

      <Card>
        <SectionHeader title={t.recentTitle} description={t.recentDesc} href="/customs" linkLabel={t.customs} />
        <CardContent>
          {dossiers.isLoading ? (
            <SkeletonList rows={3} />
          ) : recent.length === 0 ? (
            <EmptyState title={t.recentEmpty} description={t.recentEmptyDesc} />
          ) : (
            <ul className="-mx-3 grid grid-cols-1 gap-x-6 cq-md:grid-cols-2">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link href={`/dossiers/${d.id}?step=submit`} className={`${rowLink} items-center gap-3`}>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="truncate text-sm font-medium text-fg">{d.partner}</p>
                      <p className="truncate text-xs text-fg-subtle">
                        <span className="font-mono">{d.declarationNo}</span> · {formatMoney(d.invoiceValue, d.currency)} · {formatRelative(d.updatedAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <ChannelBadge channel={d.channel} />
                      <DossierStatusBadge status={d.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Stack>
  );
}
