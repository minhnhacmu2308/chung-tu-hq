"use client";
// Chi tiết hồ sơ: đầu trang + thanh 6 bước (+ bước 7 "Sửa sau thông quan" khi đã thông quan) + màn của bước đang xem (?step=…, mặc định bước đang dở).
import {
  Breadcrumb, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, PageHeader, Skeleton, Stack, Stepper, toast, WorkflowDiagram, PageLoading, fill, pickMessages, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// kb-allow-raw: menu "…" cấp TRANG ở đầu hồ sơ (không phải thao tác trên dòng bảng → không dùng RowActions)
import { Download, GitBranch, MoreHorizontal, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ComponentType, type ReactNode } from "react";
import { customsKeys, getSubmission } from "@/api/customs";
import { cancelDossier, dossierKeys, getDossier } from "@/api/dossiers";
import { ChannelBadge, DossierStatusBadge, DueBadge } from "@/components/common/dossier-status";
import { DIRECTION_LABELS, transportLabels } from "@/features/dossiers/dossier-display";
import { formatDate, formatMoney } from "@/lib/format";
import { STEP_LABELS, STEP_ORDER, type Dossier, type StepId } from "@/mocks/types";
import { AgentStep } from "./steps/agent-step";
import { CreateSummaryStep } from "./steps/create-step";
import { OcrStep } from "./steps/ocr-step";
import { ReviewStep } from "./steps/review-step";
import { SubmitStep } from "./steps/submit-step";
import type { StepProps, ViewStep } from "./steps/types";
import { UploadStep } from "./steps/upload-step";
import { buildFlow } from "./workflow-flow";
import { DOSSIER_DETAIL_MESSAGES } from "./dossier-detail.messages";
import { postStepVisible } from "../post-amendment/ama-wizard";
import { anyPostVisible } from "./steps/branch-sheets";
import { PostAmendmentStep } from "../post-amendment/post-amendment-step";

const STEP_COMPONENTS: Record<ViewStep, ComponentType<StepProps>> = {
  create: CreateSummaryStep,
  upload: UploadStep,
  ocr: OcrStep,
  agent: AgentStep,
  review: ReviewStep,
  submit: SubmitStep,
  post: PostAmendmentStep,
};


const isStep = (s: string | null): s is StepId => !!s && (STEP_ORDER as string[]).includes(s);

function Header({ dossier, flowAction }: { dossier: Dossier; flowAction: ReactNode }) {
  const qc = useQueryClient();
  const locale = useUiLocale();
  const t = pickMessages(DOSSIER_DETAIL_MESSAGES, locale);
  const directionLabels = pickMessages(DIRECTION_LABELS, locale);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelDossier(dossier.id),
    onSuccess: (d) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      setConfirmCancel(false);
      toast({ tone: "info", title: t.canceled, description: d.code });
    },
  });
  // Đã truyền / thông quan / hủy → hạn khai không còn ý nghĩa, không báo quá hạn.
  const done = dossier.status === "SUBMITTED" || dossier.status === "CLEARED" || dossier.status === "CANCELLED";

  const exportJson = () =>
    toast({ tone: "success", title: t.exportedJson, description: fill(t.exportedJsonDesc, { file: `${dossier.code}.json` }) });

  return (
    <Stack gap="sm">
      <Breadcrumb
        linkAs={Link}
        items={[
          { label: t.breadcrumbList, href: "/dossiers" },
          { label: directionLabels[dossier.direction], href: `/dossiers?direction=${dossier.direction}` },
          { label: dossier.code },
        ]}
      />
      <PageHeader
        title={<span className="font-mono">{dossier.code}</span>}
        description={dossier.partner}
        actions={
          <>
            {flowAction}
            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={exportJson}>
              {t.exportJson}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label={t.moreActions}>
                  {/* kb-allow-raw: menu "…" cấp trang, xem ghi chú ở import */}
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={<XCircle className="h-4 w-4" />} tone="danger" disabled={done} onSelect={() => setConfirmCancel(true)}>
                  {t.cancel}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
        <span className="flex flex-wrap items-center gap-2">
          <DossierStatusBadge status={dossier.status} customs={dossier.customs} />
          {dossier.channel && <ChannelBadge channel={dossier.channel} />}
          <DueBadge dueDate={dossier.dueDate} done={done} />
        </span>
        <span>
          {directionLabels[dossier.direction]} · <span className="font-medium text-fg">{dossier.typeCode}</span>
        </span>
        <span>
          {dossier.incoterm && `${dossier.incoterm} · `}{transportLabels(locale)[dossier.transportMode]}
        </span>
        {dossier.billNo && <span className="font-mono">{dossier.billNo}</span>}
        {dossier.invoiceValue !== "0" && <span>{formatMoney(dossier.invoiceValue, dossier.currency)}</span>}
        <span>{fill(t.dueOn, { date: formatDate(dossier.dueDate) })}</span>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent title={t.cancelTitle} description={fill(t.cancelDesc, { code: dossier.code })} size="sm">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              {t.keep}
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              {t.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

function DetailInner({ id }: { id: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const locale = useUiLocale();
  const t = useMessages(DOSSIER_DETAIL_MESSAGES);
  const stepLabels = useMessages(STEP_LABELS);
  const { data: dossier, isLoading, isError, error, refetch } = useQuery({ queryKey: dossierKeys.detail(id), queryFn: () => getDossier(id), retry: false });
  // Giai đoạn Hải quan quyết định có bước 7 không – chỉ hỏi khi hồ sơ đã tới bước Review/Khai báo.
  const subQ = useQuery({ queryKey: customsKeys.submission(id), queryFn: () => getSubmission(id), enabled: dossier?.step === "submit" || dossier?.step === "review" });

  if (isLoading) {
    return (
      <PageLoading variant="detail" label={t.loading} />
    );
  }
  if (isError || !dossier) {
    const notFound = (error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <EmptyState
        title={notFound ? t.notFound : t.loadFailed}
        description={notFound ? fill(t.notFoundDesc, { id }) : t.loadFailedDesc}
        action={
          notFound ? (
            <Button asChild>
              <Link href="/dossiers">{t.backToList}</Link>
            </Button>
          ) : (
            <Button onClick={() => void refetch()}>{t.retry}</Button>
          )
        }
      />
    );
  }

  // Bước 7 theo giai đoạn Hải quan, không theo dossier.step (backend chuyển dossier.step về review/submit trong lúc AMA – thiết kế cũ).
  const stage = subQ.data?.stage;
  // Lô nhiều tờ: bước 7 mở khi bất kỳ tờ nào đã thông quan (tờ thông quan trước làm AMA ngay, không chờ tờ khác).
  const hasPost = subQ.data ? anyPostVisible(subQ.data) : postStepVisible(stage);
  const postEditing = Boolean(stage?.startsWith("POST_")) || Boolean(subQ.data?.branches.some((b) => b.stage.startsWith("POST_")));
  const progressIndex = hasPost ? STEP_ORDER.length - 1 : STEP_ORDER.indexOf(dossier.step);
  const requested = params.get("step");
  // Đang sửa sau thông quan → mặc định mở bước 7; đã thông quan, chưa sửa → mặc định bước Khai báo.
  const fallback: ViewStep = postEditing ? "post" : hasPost ? "submit" : dossier.step;
  const viewing: ViewStep =
    requested === "post" && hasPost ? "post" : isStep(requested) && STEP_ORDER.indexOf(requested) <= progressIndex ? requested : fallback;
  const goTo = (step: ViewStep, opts?: { branch?: number }) =>
    router.replace(`${pathname}?step=${step}${opts?.branch ? `&branch=${opts.branch}` : ""}`, { scroll: false });
  const StepView = STEP_COMPONENTS[viewing];
  const flow = buildFlow(dossier, locale);
  const steps = STEP_ORDER.map((sid) => ({ id: sid, label: stepLabels[sid] }));
  /** Bước 7 chỉ hiện khi tờ khai đã thông quan / đang sửa sau thông quan. */
  const postStep = { id: "post", label: t.postStep } as const;

  return (
    <Stack gap="lg">
      <Header
        dossier={dossier}
        flowAction={
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" leftIcon={<GitBranch className="h-4 w-4" />}>
            <span className="cq-max-sm:sr-only">{t.viewFlow}</span>
          </Button>
        </DialogTrigger>
        <DialogContent title={fill(t.flowTitle, { code: dossier.code })} icon={<GitBranch className="h-4 w-4" />} size="lg" allowPresentationToggle>
          <WorkflowDiagram
            label={fill(t.flowTitle, { code: dossier.code })}
            nodes={flow.nodes}
            edges={flow.edges}
            className="dialog-fill"
            onNodeClick={(nodeId) => {
              const step = flow.stepOf[nodeId];
              if (step && STEP_ORDER.indexOf(step) <= progressIndex) goTo(step);
            }}
          />
        </DialogContent>
      </Dialog>
        }
      />
      <Stepper
        steps={hasPost ? [...steps, postStep] : steps}
        // Đã thông quan: bước Khai báo coi như xong, bước 7 là bước mở được.
        currentId={hasPost ? "post" : dossier.step}
        viewingId={viewing}
        onStepClick={(s) => goTo(s as ViewStep)}
      />
      {dossier.status === "CANCELLED" ? (
        <Card>
          <CardContent>
            <EmptyState title={t.canceledTitle} description={t.canceledDesc} />
          </CardContent>
        </Card>
      ) : null}
      <StepView key={viewing} dossier={dossier} goTo={goTo} />
    </Stack>
  );
}

export function DossierDetailPage({ id }: { id: string }) {
  return (
    <Suspense>
      <DetailInner id={id} />
    </Suspense>
  );
}
