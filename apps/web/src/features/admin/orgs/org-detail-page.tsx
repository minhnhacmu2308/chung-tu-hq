"use client";
import type { AdminOrgDetail } from "@kb/contracts";
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, PageLoading, Stack,
  StatCard, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger, fill, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, Coins, FileText, FolderOpen, Gauge, Lock, LockOpen, PlugZap, Repeat, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { adminKeys, getAdminOrg, listAdminUsers } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { ApiError } from "@/lib/api-error";
import { daysUntil, formatDate, formatDateTime, formatNumber, formatRelative, formatVnd } from "@/lib/format";
import { AuditTable } from "../audit/audit-table";
import { INTEGRATION_STATUS, ORG_STATUS, PLAN_TONE } from "../common/admin-display";
import { QuotaMeter } from "../common/quota-meter";
import { useAdminSession } from "../shell/use-admin-session";
import { UserTable } from "../users/user-table";
import { ORG_DETAIL_MESSAGES } from "./orgs.messages";
import { OrgActionDialogs, type OrgAction } from "./org-actions";

const TABS = [
  { id: "overview", label: "tabOverview" },
  { id: "members", label: "tabMembers" },
  { id: "plan", label: "tabPlan" },
  { id: "connections", label: "tabConnections" },
  { id: "audit", label: "tabAudit" },
] as const satisfies readonly { id: string; label: keyof (typeof ORG_DETAIL_MESSAGES)["vi"] }[];
type TabId = (typeof TABS)[number]["id"];

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="text-sm text-fg">{children}</dd>
    </div>
  );
}

function OverviewTab({ org }: { org: AdminOrgDetail }) {
  const t = useMessages(ORG_DETAIL_MESSAGES);
  return (
    <Stack gap="lg">
      <Grid cols={{ base: 2, xl: 4 }}>
        <StatCard icon={<UsersRound />} label={t.members} value={org.memberCount} hint={org.lastActiveAt ? fill(t.activeAgo, { ago: formatRelative(org.lastActiveAt) }) : t.nobodyLoggedIn} />
        <StatCard icon={<FolderOpen />} tone="success" label={t.dossiersThisMonth} value={org.usage.dossiersThisMonth} hint={fill(t.quotaHint, { n: formatNumber(org.plan.dossiersPerMonth + org.quotaBonus) })} />
        <StatCard icon={<FileText />} tone="info" label={t.pagesRead} value={org.usage.pagesThisMonth} hint={t.thisMonth} />
        <StatCard icon={<Coins />} tone="warning" label={t.aiCostThisMonth} value={formatVnd(org.usage.aiCostVnd)} hint={t.aiCostHint} />
      </Grid>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>{t.orgInfo}</CardTitle>
          <CardDescription>{t.orgInfoDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-4 cq-sm:grid-cols-2">
            <Info label={t.taxCode}><span className="font-mono">{org.taxCode}</span></Info>
            <Info label={t.phone}>{org.phone || "—"}</Info>
            <div className="cq-sm:col-span-2"><Info label={t.address}>{org.address || "—"}</Info></div>
            <Info label={t.owner}>
              {org.ownerName}
              {org.ownerEmail && <span className="block break-all text-xs text-fg-subtle">{org.ownerEmail}</span>}
            </Info>
            <Info label={t.createdAt}>{formatDateTime(org.createdAt)}</Info>
          </dl>
        </CardContent>
      </Card>
    </Stack>
  );
}

function PlanTab({ org, onAction }: { org: AdminOrgDetail; onAction: (a: OrgAction) => void }) {
  const t = useMessages(ORG_DETAIL_MESSAGES);
  const { can } = useAdminSession();
  const days = daysUntil(org.plan.renewsAt);
  const trial = org.plan.code === "TRIAL";
  return (
    <Stack gap="md" className="max-w-4xl">
      {days <= 7 && (
        <Alert tone={days < 0 ? "danger" : "warning"} title={fill(days < 0 ? (trial ? t.trialExpired : t.planExpired) : days === 0 ? (trial ? t.trialToday : t.planToday) : trial ? t.trialSoon : t.planSoon, { n: Math.abs(days) })}>
          {trial ? t.trialAdvice : t.planAdvice}
        </Alert>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                {fill(t.planTitle, { plan: org.plan.name })} <Badge tone={PLAN_TONE[org.plan.code]}>{trial ? t.trialBadge : t.inUseBadge}</Badge>
              </CardTitle>
              <CardDescription>
                {fill(trial ? t.trialUntil : t.renewsOn, { date: formatDate(org.plan.renewsAt), pages: org.plan.pagesPerDossier })}
              </CardDescription>
            </div>
            {can("BILLING") && (
              <div className="flex flex-wrap gap-2">
                {trial && <Button size="sm" variant="secondary" leftIcon={<CalendarPlus className="h-4 w-4" />} onClick={() => onAction("trial")}>{t.extendTrial}</Button>}
                <Button size="sm" variant="secondary" leftIcon={<Gauge className="h-4 w-4" />} onClick={() => onAction("quota")}>{t.raiseQuota}</Button>
                <Button size="sm" leftIcon={<Repeat className="h-4 w-4" />} onClick={() => onAction("plan")}>{t.changePlan}</Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-fg">{t.dossiersThisMonth}</p>
              <QuotaMeter used={org.usage.dossiersThisMonth} limit={org.plan.dossiersPerMonth} bonus={org.quotaBonus} />
            </div>
            <dl className="grid grid-cols-2 gap-3 rounded-md bg-surface-muted p-3 cq-sm:grid-cols-3">
              <Info label={t.pagesRead}><span className="font-semibold tabular-nums">{formatNumber(org.usage.pagesThisMonth)}</span></Info>
              <Info label={t.aiCost}><span className="font-semibold tabular-nums">{formatVnd(org.usage.aiCostVnd)}</span></Info>
              <Info label={t.costPerDossier}>
                <span className="font-semibold tabular-nums">
                  {org.usage.dossiersThisMonth > 0 ? formatVnd(String(Math.round(Number(org.usage.aiCostVnd) / org.usage.dossiersThisMonth))) : "—"}
                </span>
              </Info>
            </dl>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

function ConnectionsTab({ org }: { org: AdminOrgDetail }) {
  const t = useMessages(ORG_DETAIL_MESSAGES);
  const empty = org.integrations.length === 0 && org.certificates.length === 0;
  return (
    <Stack gap="md" className="max-w-4xl">
      <Alert tone="info" title={t.statusOnly}>
        {t.statusOnlyBody}
      </Alert>
      {empty ? (
        <Card><EmptyState icon={<PlugZap />} title={t.noConnections} description={t.noConnectionsBody} /></Card>
      ) : (
        <Grid cols={{ base: 1, lg: 2 }}>
          <Card>
            <CardHeader><CardTitle>{t.systemConnections}</CardTitle></CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-border border-t border-border">
                {org.integrations.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <span className="text-sm text-fg">{i.name}</span>
                    <StatusBadge status={INTEGRATION_STATUS[i.status]} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>{t.certificates}</CardTitle></CardHeader>
            <CardContent className="p-0">
              {org.certificates.length === 0 ? (
                <EmptyState className="py-8" icon={<ShieldCheck />} title={t.noCertificates} />
              ) : (
                <ul className="divide-y divide-border border-t border-border">
                  {org.certificates.map((c) => {
                    const d = daysUntil(c.validTo);
                    return (
                      <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                        <span className="flex flex-wrap items-center gap-2 text-sm text-fg">
                          {c.issuer} {c.isDefault && <Badge tone="primary" size="sm">{t.default}</Badge>}
                        </span>
                        <Badge tone={d < 0 ? "danger" : d <= 30 ? "warning" : "success"}>
                          {d < 0 ? fill(t.certExpired, { date: formatDate(c.validTo) }) : d <= 30 ? fill(t.certDaysLeft, { n: d }) : fill(t.certValidUntil, { date: formatDate(c.validTo) })}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </Grid>
      )}
    </Stack>
  );
}

function DetailInner({ id }: { id: string }) {
  const t = useMessages(ORG_DETAIL_MESSAGES);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("tab");
  const tab: TabId = TABS.some((x) => x.id === raw) ? (raw as TabId) : "overview";
  const { can } = useAdminSession();
  const org = useQuery({ queryKey: adminKeys.org(id), queryFn: () => getAdminOrg(id), retry: false });
  const members = useQuery({ queryKey: adminKeys.users({ orgId: id }), queryFn: () => listAdminUsers({ orgId: id }), enabled: tab === "members" });
  const [action, setAction] = useState<OrgAction | null>(null);

  if (org.isError) {
    const missing = org.error instanceof ApiError && org.error.code === "NOT_FOUND";
    return missing ? (
      <EmptyState
        title={t.notFound}
        description={t.notFoundBody}
        action={<Button asChild><Link href="/admin/orgs">{t.backToList}</Link></Button>}
      />
    ) : (
      <LoadError onRetry={() => void org.refetch()} title={t.loadError} />
    );
  }
  if (!org.data) return <PageLoading variant="detail" />;
  const o = org.data;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: t.breadcrumb, href: "/admin/orgs" }, { label: o.name }]} />
      <PageHeader
        title={o.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={ORG_STATUS[o.status]} />
            <Badge tone={PLAN_TONE[o.plan.code]}>{o.plan.name}</Badge>
            <span>MST <span className="font-mono">{o.taxCode}</span></span>
          </span>
        }
        actions={
          can("SUPPORT") &&
          (o.status === "ACTIVE" ? (
            <Button variant="secondary" leftIcon={<Lock className="h-4 w-4" />} onClick={() => setAction("suspend")}>{t.suspend}</Button>
          ) : (
            <Button leftIcon={<LockOpen className="h-4 w-4" />} onClick={() => setAction("reactivate")}>{t.reactivate}</Button>
          ))
        }
      />

      {o.status === "SUSPENDED" && (
        <Alert tone="danger" title={t.suspendedTitle}>
          {fill(t.suspendedBody, { reason: o.suspendedReason ?? t.noReason })}
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => router.replace(v === "overview" ? pathname : `${pathname}?tab=${v}`, { scroll: false })}>
        <TabsList aria-label={t.tabsLabel}>
          {TABS.map((x) => <TabsTrigger key={x.id} value={x.id}>{t[x.label]}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="overview"><OverviewTab org={o} /></TabsContent>
        <TabsContent value="members">
          {members.isError ? (
            <LoadError onRetry={() => void members.refetch()} title={t.membersLoadError} />
          ) : (
            <UserTable users={members.data ?? []} loading={members.isLoading} showOrg={false} emptyTitle={t.noMembers} />
          )}
        </TabsContent>
        <TabsContent value="plan"><PlanTab org={o} onAction={setAction} /></TabsContent>
        <TabsContent value="connections"><ConnectionsTab org={o} /></TabsContent>
        <TabsContent value="audit"><AuditTable orgId={o.id} /></TabsContent>
      </Tabs>

      <OrgActionDialogs org={o} action={action} onClose={() => setAction(null)} />
    </Stack>
  );
}

export function OrgDetailPage({ id }: { id: string }) {
  return (
    <Suspense>
      <DetailInner id={id} />
    </Suspense>
  );
}
