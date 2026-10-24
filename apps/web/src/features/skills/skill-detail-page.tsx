"use client";
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, Skeleton, Stack, StatCard, Switch, Tabs, TabsContent, TabsList, TabsTrigger, toast, SkeletonStats, SkeletonTable, fill, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, GitCommitHorizontal, Hash, RefreshCw, SearchX, Target } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getEvaluation, getSkillById, MIN_SAMPLES_FOR_ACCURACY, setSkillEnabled, skillKeys } from "@/api/skills";
import { formatDateTime, formatNumber } from "@/lib/format";
import { DOC_KIND_LABELS, type Skill } from "@/mocks/types";
import { EvaluateButton, FieldAccuracyList } from "./evaluation";
import { accuracyTone, formatPercent, SKILL_KIND_LABELS } from "./skill-display";
import { SkillFieldsTable } from "./skill-fields-table";
import { SkillSamples } from "./skill-samples";
import { DETAIL_MESSAGES } from "./skills.messages";

/** Cùng quy tắc với AccuracyBadge: chưa đủ mẫu thì không hiện con số (số đo trên ít mẫu gây hiểu sai). */
function accuracyText(skill: Skill, notEnough: string): { value: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (skill.accuracy === undefined || skill.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) return { value: notEnough, tone: "neutral" };
  return { value: formatPercent(skill.accuracy), tone: accuracyTone(skill.accuracy) };
}

function EnabledToggle({ skill }: { skill: Skill }) {
  const t = useMessages(DETAIL_MESSAGES);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: boolean) => setSkillEnabled(skill.id, v),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: s.enabled ? t.enabledTitle : t.disabledTitle, description: s.enabled ? t.enabledDesc : t.disabledDesc });
    },
  });
  return <Switch label={t.inUse} checked={m.isPending ? !!m.variables : skill.enabled} disabled={m.isPending} onCheckedChange={(v) => m.mutate(v)} />;
}

/** Độ chính xác từng trường của lần đánh giá gần nhất. */
function LatestEvaluation({ skill }: { skill: Skill }) {
  const t = useMessages(DETAIL_MESSAGES);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: skillKeys.evaluation(skill.id), queryFn: () => getEvaluation(skill.id) });
  if (isLoading) return <SkeletonTable rows={4} />;
  if (isError) return <EmptyState title={t.evalLoadError} action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>{t.retry}</Button>} />;
  if (!data) return <EmptyState title={t.noEvalTitle} description={t.noEvalDesc} />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{fill(t.perFieldTitle, { version: data.version })}</CardTitle>
        <CardDescription>
          {fill(t.perFieldDesc, { samples: formatNumber(data.samples), time: formatDateTime(data.finishedAt) })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldAccuracyList fields={data.fields} />
      </CardContent>
    </Card>
  );
}

function Detail({ skill }: { skill: Skill }) {
  const t = useMessages(DETAIL_MESSAGES);
  const kindLabels = useMessages(SKILL_KIND_LABELS);
  const docKinds = useMessages(DOC_KIND_LABELS);
  const acc = accuracyText(skill, t.notEnough);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabs = ["fields", "samples", "evaluation"];
  const tab = tabs.includes(params.get("tab") ?? "") ? params.get("tab")! : "fields";
  const setTab = (t: string) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const measured = skill.accuracy !== undefined && skill.labeledSamples >= MIN_SAMPLES_FOR_ACCURACY;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: t.breadcrumb, href: `/skills?kind=${skill.kind}` }, { label: skill.code }]} />
      <PageHeader
        title={skill.name}
        description={t.description}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <EnabledToggle skill={skill} />
            <EvaluateButton skill={skill} onDone={() => setTab("evaluation")} />
          </div>
        }
      />
      {!skill.enabled && (
        <Alert tone="warning" title={t.offTitle}>{t.offBody}{skill.kind === "SUPPLIER" ? t.offSupplier : ""}.</Alert>
      )}
      <Grid cols={{ base: 2, xl: 4 }} stagger>
        <StatCard icon={<Hash />} tone="neutral" label={t.skillCode} value={skill.code} hint={kindLabels[skill.kind]} />
        <StatCard
          icon={<FileText />}
          tone="info"
          label={skill.supplier ? t.supplier : t.docKind}
          value={skill.supplier ?? (skill.docKind ? docKinds[skill.docKind] : t.vnaccsDeclaration)}
          hint={skill.supplier && skill.docKind ? docKinds[skill.docKind] : skill.language}
        />
        <StatCard
          icon={<Target />}
          tone={acc.tone}
          label={t.accuracy}
          value={acc.value}
          hint={fill(t.labeledHint, { n: formatNumber(skill.labeledSamples) })}
        />
        <StatCard icon={<GitCommitHorizontal />} tone="primary" label={t.version} value={`v${skill.version}`} hint={fill(t.updatedHint, { time: formatDateTime(skill.updatedAt) })} />
      </Grid>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t.tabsAria}>
          <TabsTrigger value="fields">
            {t.tabFields} <Badge tone="neutral">{skill.fields.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="samples">
              {t.tabSamples} <Badge tone="neutral">{skill.labeledSamples}</Badge>
            </TabsTrigger>
          <TabsTrigger value="evaluation">{t.tabEvaluation}</TabsTrigger>
        </TabsList>
        <TabsContent value="fields" className="pt-4">
          <SkillFieldsTable skill={skill} />
        </TabsContent>
        <TabsContent value="samples" className="pt-4">
            <SkillSamples skill={skill} />
          </TabsContent>
        <TabsContent value="evaluation" className="pt-4">
            {measured ? (
              <LatestEvaluation skill={skill} />
            ) : (
              <EmptyState
                title={t.noResultTitle}
                description={fill(t.noResultDesc, { min: MIN_SAMPLES_FOR_ACCURACY, n: skill.labeledSamples })}
                action={<Button size="sm" onClick={() => setTab("samples")}>{t.addSamples}</Button>}
              />
            )}
          </TabsContent>
      </Tabs>
    </Stack>
  );
}

function SkillDetailInner({ id }: { id: string }) {
  const t = useMessages(DETAIL_MESSAGES);
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: skillKeys.detail(id), queryFn: () => getSkillById(id) });
  if (isLoading) {
    return (
      <Stack gap="lg">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <SkeletonStats />
        <SkeletonTable rows={8} cols={6} />
      </Stack>
    );
  }
  if (isError || !data) {
    const notFound = (error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <EmptyState
        icon={<SearchX className="h-6 w-6" />}
        title={notFound ? t.notFoundTitle : t.loadErrorTitle}
        description={notFound ? t.notFoundDesc : t.checkConnection}
        action={
          notFound ? (
            <Button asChild size="sm"><Link href="/skills">{t.backToList}</Link></Button>
          ) : (
            <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>{t.retry}</Button>
          )
        }
      />
    );
  }
  return <Detail skill={data} />;
}

export function SkillDetailPage({ id }: { id: string }) {
  return (
    <Suspense>
      <SkillDetailInner id={id} />
    </Suspense>
  );
}
