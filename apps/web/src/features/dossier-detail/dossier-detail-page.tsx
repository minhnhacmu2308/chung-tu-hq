"use client";
// Chi tiết hồ sơ: đầu trang + thanh 6 bước + màn của bước đang xem (?step=…, mặc định bước đang dở).
import {
  Breadcrumb, Button, Card, CardContent, Dialog, DialogContent, DialogFooter, DialogTrigger, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, PageHeader, Skeleton, Stack, Stepper, toast, WorkflowDiagram, PageLoading,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
// kb-allow-raw: menu "…" cấp TRANG ở đầu hồ sơ (không phải thao tác trên dòng bảng → không dùng RowActions)
import { Download, GitBranch, MoreHorizontal, XCircle } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ComponentType, type ReactNode } from "react";
import { cancelDossier, dossierKeys, getDossier } from "@/api/dossiers";
import { ChannelBadge, DossierStatusBadge, DueBadge } from "@/components/common/dossier-status";
import { formatDate, formatMoney } from "@/lib/format";
import { STEP_LABELS, STEP_ORDER, type Dossier, type StepId } from "@/mocks/types";
import { AgentStep } from "./steps/agent-step";
import { CreateSummaryStep } from "./steps/create-step";
import { OcrStep } from "./steps/ocr-step";
import { ReviewStep } from "./steps/review-step";
import { SubmitStep } from "./steps/submit-step";
import type { StepProps } from "./steps/types";
import { UploadStep } from "./steps/upload-step";
import { buildFlow } from "./workflow-flow";

const STEP_COMPONENTS: Record<StepId, ComponentType<StepProps>> = {
  create: CreateSummaryStep,
  upload: UploadStep,
  ocr: OcrStep,
  agent: AgentStep,
  review: ReviewStep,
  submit: SubmitStep,
};

const STEPS = STEP_ORDER.map((id) => ({ id, label: STEP_LABELS[id] }));
const DIRECTION_LABEL = { NK: "Nhập khẩu", XK: "Xuất khẩu" } as const;
const MODE_LABEL = { SEA: "Đường biển", AIR: "Hàng không", ROAD: "Đường bộ" } as const;

const isStep = (s: string | null): s is StepId => !!s && (STEP_ORDER as string[]).includes(s);

function Header({ dossier, flowAction }: { dossier: Dossier; flowAction: ReactNode }) {
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelDossier(dossier.id),
    onSuccess: (d) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      setConfirmCancel(false);
      toast({ tone: "info", title: "Đã hủy hồ sơ", description: d.code });
    },
  });
  // Đã truyền / thông quan / hủy → hạn khai không còn ý nghĩa, không báo quá hạn.
  const done = dossier.status === "SUBMITTED" || dossier.status === "CLEARED" || dossier.status === "CANCELLED";

  const exportJson = () =>
    toast({ tone: "success", title: "Đã xuất JSON", description: `${dossier.code}.json – dữ liệu lô hàng chuẩn hóa (bản mô phỏng)` });

  return (
    <Stack gap="sm">
      <Breadcrumb
        linkAs={Link}
        items={[
          { label: "Hồ sơ khai báo", href: "/dossiers" },
          { label: DIRECTION_LABEL[dossier.direction], href: `/dossiers?direction=${dossier.direction}` },
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
              Xuất JSON
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="Thao tác khác">
                  {/* kb-allow-raw: menu "…" cấp trang, xem ghi chú ở import */}
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={<XCircle className="h-4 w-4" />} tone="danger" disabled={done} onSelect={() => setConfirmCancel(true)}>
                  Hủy hồ sơ
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-muted">
        <span className="flex flex-wrap items-center gap-2">
          <DossierStatusBadge status={dossier.status} />
          {dossier.channel && <ChannelBadge channel={dossier.channel} />}
          <DueBadge dueDate={dossier.dueDate} done={done} />
        </span>
        <span>
          {DIRECTION_LABEL[dossier.direction]} · <span className="font-medium text-fg">{dossier.typeCode}</span>
        </span>
        <span>
          {dossier.incoterm} · {MODE_LABEL[dossier.transportMode]}
        </span>
        {dossier.billNo && <span className="font-mono">{dossier.billNo}</span>}
        {dossier.invoiceValue !== "0" && <span>{formatMoney(dossier.invoiceValue, dossier.currency)}</span>}
        <span>Hạn khai {formatDate(dossier.dueDate)}</span>
      </div>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent title="Hủy hồ sơ này?" description={`${dossier.code} sẽ chuyển sang trạng thái Đã hủy. Chứng từ và kết quả đọc vẫn được giữ lại.`} size="sm">
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Giữ hồ sơ
            </Button>
            <Button variant="danger" loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Hủy hồ sơ
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
  const { data: dossier, isLoading, isError, error, refetch } = useQuery({ queryKey: dossierKeys.detail(id), queryFn: () => getDossier(id), retry: false });

  if (isLoading) {
    return (
      <PageLoading variant="detail" label="Đang tải hồ sơ" />
    );
  }
  if (isError || !dossier) {
    const notFound = (error as { code?: string } | null)?.code === "NOT_FOUND";
    return (
      <EmptyState
        title={notFound ? "Không tìm thấy hồ sơ" : "Không tải được hồ sơ"}
        description={notFound ? `Hồ sơ "${id}" không tồn tại hoặc bạn không có quyền xem.` : "Kiểm tra kết nối rồi thử lại."}
        action={
          notFound ? (
            <Button asChild>
              <Link href="/dossiers">Về danh sách hồ sơ</Link>
            </Button>
          ) : (
            <Button onClick={() => void refetch()}>Thử lại</Button>
          )
        }
      />
    );
  }

  const progressIndex = STEP_ORDER.indexOf(dossier.step);
  const requested = params.get("step");
  const viewing: StepId = isStep(requested) && STEP_ORDER.indexOf(requested) <= progressIndex ? requested : dossier.step;
  const goTo = (step: StepId) => router.replace(`${pathname}?step=${step}`, { scroll: false });
  const StepView = STEP_COMPONENTS[viewing];
  const flow = buildFlow(dossier);

  return (
    <Stack gap="lg">
      <Header
        dossier={dossier}
        flowAction={
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="secondary" leftIcon={<GitBranch className="h-4 w-4" />}>
            <span className="max-sm:sr-only">Xem cây quy trình</span>
          </Button>
        </DialogTrigger>
        <DialogContent title={`Quy trình hồ sơ ${dossier.code}`} icon={<GitBranch className="h-4 w-4" />} size="lg" allowPresentationToggle>
          <WorkflowDiagram
            label={`Quy trình hồ sơ ${dossier.code}`}
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
        steps={STEPS}
        currentId={dossier.step}
        viewingId={viewing}
        onStepClick={(s) => goTo(s as StepId)}
      />
      {dossier.status === "CANCELLED" ? (
        <Card>
          <CardContent>
            <EmptyState title="Hồ sơ đã hủy" description="Hồ sơ không còn xử lý tiếp. Bạn vẫn xem được chứng từ và kết quả đọc ở các bước đã qua." />
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
