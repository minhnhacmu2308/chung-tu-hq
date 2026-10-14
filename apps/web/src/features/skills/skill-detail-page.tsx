"use client";
import {
  Alert, Badge, Breadcrumb, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Grid, PageHeader, Skeleton, Stack, StatCard, Switch, Tabs, TabsContent, TabsList, TabsTrigger, toast, SkeletonStats, SkeletonTable,
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

/** Cùng quy tắc với AccuracyBadge: chưa đủ mẫu thì không hiện con số (số đo trên ít mẫu gây hiểu sai). */
function accuracyText(skill: Skill): { value: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (skill.kind === "MAPPING") return { value: "Quy tắc cố định", tone: "neutral" };
  if (skill.accuracy === undefined || skill.labeledSamples < MIN_SAMPLES_FOR_ACCURACY) return { value: "Chưa đủ mẫu", tone: "neutral" };
  return { value: formatPercent(skill.accuracy), tone: accuracyTone(skill.accuracy) };
}

function EnabledToggle({ skill }: { skill: Skill }) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (v: boolean) => setSkillEnabled(skill.id, v),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: skillKeys.all });
      toast({ tone: "success", title: s.enabled ? "Đã bật skill" : "Đã tắt skill", description: s.enabled ? "Áp dụng cho hồ sơ mới." : "Hồ sơ mới sẽ dùng skill chung." });
    },
  });
  return <Switch label="Đang dùng" checked={m.isPending ? !!m.variables : skill.enabled} disabled={m.isPending} onCheckedChange={(v) => m.mutate(v)} />;
}

/** Độ chính xác từng trường của lần đánh giá gần nhất. */
function LatestEvaluation({ skill }: { skill: Skill }) {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: skillKeys.evaluation(skill.id), queryFn: () => getEvaluation(skill.id) });
  if (isLoading) return <SkeletonTable rows={4} />;
  if (isError) return <EmptyState title="Không tải được kết quả đánh giá" action={<Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>Thử lại</Button>} />;
  if (!data) return <EmptyState title="Chưa chạy đánh giá" description="Bấm Đánh giá lại để đo cấu hình hiện tại trên bộ mẫu đã gắn nhãn." />;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Độ chính xác từng trường · v{data.version}</CardTitle>
        <CardDescription>
          Đo trên {formatNumber(data.samples)} mẫu, {formatDateTime(data.finishedAt)}. Trường kém nhất ở trên cùng. Muốn cải thiện: thêm alias cho nhãn hay gặp, hoặc thêm mẫu có lỗi đó rồi đánh giá lại.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldAccuracyList fields={data.fields} />
      </CardContent>
    </Card>
  );
}

function Detail({ skill }: { skill: Skill }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const mapping = skill.kind === "MAPPING";
  const tabs = mapping ? ["fields"] : ["fields", "samples", "evaluation"];
  const tab = tabs.includes(params.get("tab") ?? "") ? params.get("tab")! : "fields";
  const setTab = (t: string) => router.replace(`${pathname}?tab=${t}`, { scroll: false });
  const measured = skill.accuracy !== undefined && skill.labeledSamples >= MIN_SAMPLES_FOR_ACCURACY;

  return (
    <Stack gap="lg">
      <Breadcrumb linkAs={Link} items={[{ label: "Cấu hình Skill AI", href: `/skills?kind=${skill.kind}` }, { label: skill.code }]} />
      <PageHeader
        title={skill.name}
        description={
          mapping
            ? "Quy tắc đưa dữ liệu lô hàng vào từng chỉ tiêu tờ khai. Chạy bằng code – cùng dữ liệu luôn ra cùng kết quả."
            : "Cấu hình cách AI đọc loại chứng từ này: trường cần lấy, nhãn thường gặp và mẫu đã gắn nhãn để đo độ chính xác."
        }
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <EnabledToggle skill={skill} />
            {!mapping && <EvaluateButton skill={skill} onDone={() => setTab("evaluation")} />}
          </div>
        }
      />
      {!skill.enabled && (
        <Alert tone="warning" title="Skill đang tắt">Hồ sơ mới sẽ không dùng skill này{skill.kind === "SUPPLIER" ? " – chứng từ của nhà cung cấp được đọc bằng skill chung" : ""}.</Alert>
      )}
      <Grid cols={{ base: 2, xl: 4 }} stagger>
        <StatCard icon={<Hash />} tone="neutral" label="Mã skill" value={skill.code} hint={SKILL_KIND_LABELS[skill.kind]} />
        <StatCard
          icon={<FileText />}
          tone="info"
          label={skill.supplier ? "Nhà cung cấp" : "Loại chứng từ"}
          value={skill.supplier ?? (skill.docKind ? DOC_KIND_LABELS[skill.docKind] : "Tờ khai VNACCS")}
          hint={skill.supplier && skill.docKind ? DOC_KIND_LABELS[skill.docKind] : skill.language}
        />
        <StatCard
          icon={<Target />}
          tone={accuracyText(skill).tone}
          label="Độ chính xác"
          value={accuracyText(skill).value}
          hint={mapping ? "kiểm bằng test tự động" : `${formatNumber(skill.labeledSamples)} mẫu đã gắn nhãn`}
        />
        <StatCard icon={<GitCommitHorizontal />} tone="primary" label="Phiên bản" value={`v${skill.version}`} hint={`cập nhật ${formatDateTime(skill.updatedAt)}`} />
      </Grid>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Nội dung skill">
          <TabsTrigger value="fields">
            {mapping ? "Quy tắc ánh xạ" : "Trường dữ liệu"} <Badge tone="neutral">{skill.fields.length}</Badge>
          </TabsTrigger>
          {!mapping && (
            <TabsTrigger value="samples">
              Mẫu đã gắn nhãn <Badge tone="neutral">{skill.labeledSamples}</Badge>
            </TabsTrigger>
          )}
          {!mapping && <TabsTrigger value="evaluation">Kết quả đánh giá</TabsTrigger>}
        </TabsList>
        <TabsContent value="fields" className="pt-4">
          <SkillFieldsTable skill={skill} />
        </TabsContent>
        {!mapping && (
          <TabsContent value="samples" className="pt-4">
            <SkillSamples skill={skill} />
          </TabsContent>
        )}
        {!mapping && (
          <TabsContent value="evaluation" className="pt-4">
            {measured ? (
              <LatestEvaluation skill={skill} />
            ) : (
              <EmptyState
                title="Chưa có kết quả đánh giá"
                description={`Cần ít nhất ${MIN_SAMPLES_FOR_ACCURACY} mẫu đã gắn nhãn (hiện có ${skill.labeledSamples}).`}
                action={<Button size="sm" onClick={() => setTab("samples")}>Thêm mẫu</Button>}
              />
            )}
          </TabsContent>
        )}
      </Tabs>
    </Stack>
  );
}

function SkillDetailInner({ id }: { id: string }) {
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
        title={notFound ? "Không tìm thấy skill" : "Không tải được skill"}
        description={notFound ? "Skill có thể đã bị xóa hoặc đường dẫn sai." : "Kiểm tra kết nối rồi thử lại."}
        action={
          notFound ? (
            <Button asChild size="sm"><Link href="/skills">Về danh sách skill</Link></Button>
          ) : (
            <Button size="sm" variant="secondary" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => refetch()}>Thử lại</Button>
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
