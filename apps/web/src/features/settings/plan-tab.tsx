"use client";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Grid, Progress, Skeleton, Stack, toast, SkeletonCard, fill, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { getOrganization, settingsKeys } from "@/api/settings";
import { fromMinor, sumMinor, toMinor } from "@/lib/decimal";
import { formatDate, formatNumber, formatVnd } from "@/lib/format";
import type { Organization } from "@/mocks/types";
import { LoadError } from "@/components/common/load-error";
import { PLAN_TAB_MESSAGES } from "./plan-tab.messages";

type PlanCode = Organization["plan"]["code"];
const PLANS: { code: PlanCode; key: "basic" | "pro" | "enterprise" }[] = [
  { code: "BASIC", key: "basic" },
  { code: "PRO", key: "pro" },
  { code: "ENTERPRISE", key: "enterprise" },
];

function Meter({ label, used, total, unit }: { label: string; used: number; total: number; unit: string }) {
  const m = useMessages(PLAN_TAB_MESSAGES);
  const pct = Math.round((used / total) * 100);
  return (
    <Stack gap="xs">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-fg">{label}</span>
        <span className="text-fg-muted">
          {formatNumber(used)} / {formatNumber(total)} {unit}
        </span>
      </div>
      <Progress value={pct} tone={pct >= 90 ? "danger" : pct >= 75 ? "warning" : "primary"} aria-label={fill(m.meterAria, { label, pct })} />
    </Stack>
  );
}

export function PlanTab() {
  const m = useMessages(PLAN_TAB_MESSAGES);
  const { data: org, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  if (isError) return <LoadError onRetry={() => void refetch()} />;
  if (isLoading || !org) return <SkeletonCard lines={6} />;
  const { plan, usage } = org;
  // Chi phí tháng tách theo nhà cung cấp; cộng theo đơn vị nhỏ nhất (VND nguyên) để không sai số thập phân.
  const costs = [
    { key: "ai", label: m.costAi, value: usage.aiCostVnd },
    { key: "hs", label: m.costHs, value: usage.hsCostVnd },
    { key: "customs", label: m.costCustoms, value: usage.customsCostVnd },
  ];
  const totalCost = sumMinor(costs.map((c) => toMinor(c.value, 0)));
  const avgCost = usage.dossiersThisMonth ? Math.round(totalCost / usage.dossiersThisMonth) : 0;

  return (
    <Stack gap="lg">
      <Grid cols={{ base: 1, lg: 3 }}>
        <Card className="cq-lg:col-span-2">
          <CardHeader>
            <CardTitle>
              {fill(m.planTitle, { name: plan.name })} <Badge tone="primary">{m.inUse}</Badge>
            </CardTitle>
            <CardDescription>{fill(m.renews, { date: formatDate(plan.renewsAt) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <Meter label={m.dossiersMonth} used={usage.dossiersThisMonth} total={plan.dossiersPerMonth + (plan.bonusThisMonth ?? 0)} unit={m.dossiersUnit} />
              <Meter label={m.pagesRead} used={usage.pagesThisMonth} total={plan.dossiersPerMonth * 8} unit={m.pagesUnit} />
              <p className="text-xs text-fg-subtle">
                {fill(m.pagesNote, { n: plan.pagesPerDossier })}
              </p>
            </Stack>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{m.serviceCost}</CardDescription>
            <CardTitle as="h3" className="text-2xl">{formatVnd(fromMinor(totalCost, 0))}</CardTitle>
            <p className="text-xs text-fg-subtle">{fill(m.avgCost, { cost: formatVnd(String(avgCost)) })}</p>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <dl className="space-y-1 text-sm">
                {costs.map((c) => (
                  <div key={c.key} className="flex items-baseline justify-between gap-2">
                    <dt className="text-fg-muted">{c.label}</dt>
                    <dd className="font-medium tabular-nums text-fg">{formatVnd(c.value)}</dd>
                  </div>
                ))}
              </dl>
              <Alert tone="info">{m.aiCostNote}</Alert>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Stack gap="sm">
        <h2 className="text-base font-semibold text-fg">{m.compare}</h2>
        <Grid cols={{ base: 1, md: 3 }}>
          {PLANS.map((p) => {
            const current = p.code === plan.code;
            const features = m[`${p.key}Features`].split("\n");
            return (
              <Card key={p.code} className={current ? "flex flex-col border-primary ring-1 ring-primary" : "flex flex-col"}>
                <CardHeader>
                  <CardTitle>
                    {m[`${p.key}Name`]} {current && <Badge tone="primary">{m.currentPlan}</Badge>}
                  </CardTitle>
                  <p className="text-xl font-semibold text-fg">{m[`${p.key}Price`]}</p>
                  <CardDescription>{m[`${p.key}Dossiers`]}</CardDescription>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-2">
                    {features.map((f) => (
                      <li key={f} className="flex gap-2 text-sm text-fg-muted">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {current ? (
                    <Button variant="secondary" fullWidth disabled>{m.inUse}</Button>
                  ) : (
                    <Button
                      variant={p.code === "ENTERPRISE" ? "primary" : "secondary"}
                      fullWidth
                      onClick={() => toast({ tone: "info", title: m.requestSent, description: m.requestSentDesc })}
                    >
                      {p.code === "ENTERPRISE" ? m.contactSales : m.switchPlan}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </Grid>
      </Stack>
    </Stack>
  );
}
