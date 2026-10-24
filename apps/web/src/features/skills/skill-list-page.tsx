"use client";
import {
  Alert, Badge, Button, Card, CardDescription, CardHeader, CardTitle, createDataTableColumnHelper, DataTable, Grid, PageHeader, Skeleton, Stack, StatCard, Switch, Tabs, TabsContent, TabsList, TabsTrigger, toast, SkeletonStats, fill, pickMessages, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, RefreshCw, Sparkles, Tags, Target } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { listSkills, setSkillEnabled, skillKeys } from "@/api/skills";
import { formatNumber, formatRelative } from "@/lib/format";
import { DOC_KIND_LABELS, type DocKind, type Skill, type SkillKind } from "@/mocks/types";
import { AccuracyBadge, formatPercent, SKILL_KIND_LABELS } from "./skill-display";
import { KIND_HINT, LIST_MESSAGES } from "./skills.messages";

type ListT = (typeof LIST_MESSAGES)["vi"];

const KINDS: SkillKind[] = ["DOCUMENT", "SUPPLIER"];

function EnabledSwitch({ skill }: { skill: Skill }) {
  const t = useMessages(LIST_MESSAGES);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: boolean) => setSkillEnabled(skill.id, v),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: fill(s.enabled ? t.enabledToast : t.disabledToast, { code: s.code }) });
    },
    onError: (e: Error) => toast({ tone: "danger", title: t.toggleError, description: e.message }),
  });
  return (
    <Switch
      checked={m.isPending ? !!m.variables : skill.enabled}
      onCheckedChange={(v) => m.mutate(v)}
      disabled={m.isPending}
      aria-label={fill(t.enableAria, { code: skill.code })}
    />
  );
}

const col = createDataTableColumnHelper<Skill>();

function columnsFor(t: ListT, docKinds: Record<DocKind, string>) {
  return col.columns([
    col.accessor("code", {
      header: t.colCode,
      meta: { hideable: false },
      cell: (c) => (
        <Link href={`/skills/${c.row.original.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
          {c.getValue()}
        </Link>
      ),
    }),
    col.accessor("name", {
      header: t.colName,
      meta: { wrap: true },
      cell: (c) => (
        <div className="min-w-48">
          <p className="font-medium text-fg">{c.getValue()}</p>
          {c.row.original.supplier && <p className="text-xs text-fg-subtle">{c.row.original.supplier}</p>}
        </div>
      ),
    }),
    col.accessor((s) => (s.docKind ? docKinds[s.docKind] : "—"), { id: "docKind", header: t.colDocKind }),
    col.accessor("language", { header: t.colLanguage, meta: { wrap: true } }),
    col.accessor((s) => s.accuracy ?? -1, {
      id: "accuracy",
      header: t.colAccuracy,
      cell: (c) => <AccuracyBadge skill={c.row.original} />,
    }),
    col.accessor("labeledSamples", { header: t.colSamples, meta: { align: "end", label: t.colSamplesLabel }, cell: (c) => formatNumber(c.getValue()) }),
    col.accessor("version", { header: t.colVersion, meta: { align: "end", label: t.colVersionLabel }, cell: (c) => `v${c.getValue()}` }),
    col.accessor("updatedAt", { header: t.colUpdated, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
    col.accessor("enabled", { header: t.colEnabled, meta: { label: t.colEnabledLabel }, enableSorting: false, cell: (c) => <EnabledSwitch skill={c.row.original} /> }),
  ]);
}

function Kpis({ skills }: { skills: Skill[] }) {
  const t = useMessages(LIST_MESSAGES);
  const reading = skills;
  const measured = reading.filter((s) => s.accuracy !== undefined);
  const avg = measured.length ? measured.reduce((a, s) => a + (s.accuracy ?? 0), 0) / measured.length : undefined;
  const needMore = reading.filter((s) => s.accuracy === undefined || s.accuracy < 0.9).length;
  return (
    <Grid cols={{ base: 2, xl: 4 }} stagger>
      <StatCard icon={<Sparkles />} label={t.kpiInUse} value={`${skills.filter((s) => s.enabled).length}/${skills.length}`} hint={t.kpiInUseHint} />
      <StatCard icon={<Target />} tone="success" label={t.kpiAvg} value={avg === undefined ? "—" : formatPercent(avg)} hint={fill(t.kpiAvgHint, { n: measured.length })} />
      <StatCard icon={<Tags />} tone="info" label={t.kpiLabeled} value={reading.reduce((a, s) => a + s.labeledSamples, 0)} hint={t.kpiLabeledHint} />
      <StatCard icon={<FilePlus2 />} tone={needMore > 0 ? "warning" : "neutral"} label={t.kpiNeedMore} value={needMore} hint={t.kpiNeedMoreHint} />
    </Grid>
  );
}

function SkillListInner() {
  const t = useMessages(LIST_MESSAGES);
  const kindLabels = useMessages(SKILL_KIND_LABELS);
  const kindHints = useMessages(KIND_HINT);
  const locale = useUiLocale();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("kind");
  const kind: SkillKind = KINDS.includes(raw as SkillKind) ? (raw as SkillKind) : "DOCUMENT";
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: skillKeys.list, queryFn: () => listSkills() });
  const columns = useMemo(() => columnsFor(pickMessages(LIST_MESSAGES, locale), pickMessages(DOC_KIND_LABELS, locale)), [locale]);

  const setKind = (k: string) => router.replace(`${pathname}?kind=${k}`, { scroll: false });

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
      />
      {isError ? (
        <Alert
          tone="danger"
          title={t.loadError}
          action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>{t.retry}</Button>}
        >
          {t.checkConnection}
        </Alert>
      ) : isLoading || !data ? (
        <SkeletonStats />
      ) : (
        <Kpis skills={data} />
      )}
      <Tabs value={kind} onValueChange={setKind}>
        <TabsList aria-label={t.groupsAria}>
          {KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {kindLabels[k]} {data && <Badge tone="neutral">{data.filter((s) => s.kind === k).length}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>
        {KINDS.map((k) => (
          <TabsContent key={k} value={k}>
            <Stack gap="md" className="pt-4">
              <p className="text-sm text-fg-muted">{kindHints[k]}</p>
              <DataTable
                aria-label={kindLabels[k]}
                columns={columns}
                data={data?.filter((s) => s.kind === k) ?? []}
                getRowId={(s) => s.id}
                loading={isLoading}
                searchable
                onRowClick={(s) => router.push(`/skills/${s.id}`)}
                pagination={false}
                emptyTitle={t.emptyTitle}
                emptyDescription={t.emptyDescription}
              />
            </Stack>
          </TabsContent>
        ))}
      </Tabs>
    </Stack>
  );
}

export function SkillListPage() {
  return (
    <Suspense>
      <SkillListInner />
    </Suspense>
  );
}
