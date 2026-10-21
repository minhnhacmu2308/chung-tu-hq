"use client";
// Bước 7 "Sửa sau thông quan": mọi việc của bản khai bổ sung AMA ở một chỗ – dòng tóm tắt tờ khai gốc + hạn 60 ngày,
// rồi 4 bước nhỏ ① Chọn dòng · ② Sửa nội dung · ③ Lý do & phê duyệt · ④ Khai Hải quan (?sub=…, mặc định theo trạng thái bản khai).
// Spec: docs/superpowers/specs/2026-10-20-ama-sau-thong-quan-redesign-design.md
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, Stack, StatusBadge, Stepper, fill, toast, useMessages, useUiLocale } from "@kb/ui";
import { canEditDeclaration } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { customsKeys, getSubmission, startPostAmendment } from "@/api/customs";
import { dossierKeys } from "@/api/dossiers";
import { getPostAmendmentView, postAmendmentKeys } from "@/api/post-amendment";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys } from "@/api/settings";
import { formatDate, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StepError, StepLoading } from "../dossier-detail/steps/declaration-parts";
import type { StepProps } from "../dossier-detail/steps/types";
import { AMA_MESSAGES } from "./ama.messages";
import { amaSubSteps, amaDeadline, maxSubStep, resolveSubStep, subStepEditable, type AmaSubStep } from "./ama-wizard";
import { AMA_STATUS, type AmaStepCtx } from "./ama-context";
import { DeclareAma } from "./declare-ama";
import { EditLines } from "./line-compare";
import { PickLines } from "./pick-lines";
import { ReasonApprove } from "./reason-approve";

const today = () => new Date().toISOString().slice(0, 10);

export function PostAmendmentStep({ dossier }: StepProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const t = useMessages(AMA_MESSAGES);
  const locale = useUiLocale();
  const q = useQuery({ queryKey: postAmendmentKeys.view(dossier.id), queryFn: () => getPostAmendmentView(dossier.id) });
  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    // Đang chờ Hải quan phản hồi AMA/AMB/AMC → hỏi lại mỗi giây.
    refetchInterval: (sq) => (sq.state.data?.inProgress ? 1000 : false),
  });
  // Giai đoạn đổi do phản hồi Hải quan → trạng thái bản khai (và bước nhỏ) đổi theo.
  const stage = subQ.data?.stage;
  useEffect(() => {
    if (!stage) return;
    void qc.invalidateQueries({ queryKey: postAmendmentKeys.view(dossier.id) });
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
  }, [stage, qc, dossier.id]);
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const org = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const canEdit = session.data ? canEditDeclaration(session.data.user.role) : false;
  const fourEyes = Boolean(org.data?.fourEyes && session.data && session.data.user.role !== "OWNER" && session.data.user.id === dossier.ownerId);
  // Bước ② còn ô chưa lưu mà bấm sang bước khác → hỏi trước khi bỏ.
  const [dirty, setDirty] = useState(0);
  const [leaveTo, setLeaveTo] = useState<AmaSubStep | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: postAmendmentKeys.view(dossier.id) });
    void qc.invalidateQueries({ queryKey: customsKeys.submission(dossier.id) });
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
  };
  const goSub = (s: AmaSubStep) => router.replace(`${pathname}?step=post&sub=${s}`, { scroll: false });
  const start = useMutation({
    mutationFn: () => startPostAmendment(dossier.id),
    onSuccess: () => {
      toast({ tone: "success", title: t.createdToast, description: t.createdDesc });
      refresh();
      goSub("pick");
    },
    onError: toastMutationError(t.createFailed),
  });

  if (q.isLoading || subQ.isLoading) return <StepLoading />;
  if (q.isError) return <StepError error={q.error} onRetry={() => void q.refetch()} />;
  if (subQ.isError) return <StepError error={subQ.error} onRetry={() => void subQ.refetch()} />;
  const view = q.data!;
  const submission = subQ.data!;
  const a = view.current ?? view.history[0] ?? null;
  const canStart = submission.stage === "CLEARED" && canEdit;

  if (!a) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={<FilePlus2 />}
            title={t.emptyTitle}
            description={t.emptyDesc}
            {...(canStart ? { action: <Button loading={start.isPending} onClick={() => start.mutate()}>{t.createButton}</Button> } : {})}
          />
        </CardContent>
      </Card>
    );
  }

  const sub = resolveSubStep(a, params.get("sub"));
  const ctx: AmaStepCtx = {
    dossierId: dossier.id,
    kind: dossier.direction === "NK" ? "IDA" : "EDA",
    a, view, submission, canEdit, fourEyes, refresh, goSub,
    editable: a === view.current && subStepEditable(a, sub, canEdit),
  };
  const h = a.header;
  const deadline = amaDeadline(h["TK_IPD"], today());
  const original = [h["TK_ICN"] && fill(t.origDecl, { no: h["TK_ICN"] }), h["TK_ICB"], h["TK_CHS"], h["TK_IPD"] && fill(t.clearedOn, { d: formatDate(h["TK_IPD"]) })].filter(Boolean).join(" · ");

  return (
    <Stack gap="lg">
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>{fill(t.seqTitle, { n: formatNumber(a.seq) })}</CardTitle>
            <StatusBadge status={AMA_STATUS[a.status]} />
            {deadline && a.status !== "REGISTERED" && (
              deadline.overdue ? (
                <Badge tone="warning">{fill(t.overdue, { d: formatDate(deadline.due) })}</Badge>
              ) : (
                <Badge tone="neutral">{fill(t.due, { d: formatDate(deadline.due), n: formatNumber(deadline.daysLeft) })}</Badge>
              )
            )}
          </div>
          {original && <p className="flex items-center gap-2 text-sm text-fg-muted"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" />{fill(t.original, { s: original })}</p>}
          <Stepper
            label={t.stepperLabel}
            steps={amaSubSteps(locale)}
            currentId={maxSubStep(a)}
            viewingId={sub}
            onStepClick={(s) => (sub === "edit" && dirty > 0 ? setLeaveTo(s as AmaSubStep) : goSub(s as AmaSubStep))}
          />
        </CardHeader>
      </Card>
      {sub === "pick" ? (
        <PickLines ctx={ctx} />
      ) : sub === "edit" ? (
        <EditLines ctx={ctx} onDirtyChange={setDirty} />
      ) : sub === "reason" ? (
        <ReasonApprove ctx={ctx} />
      ) : (
        <DeclareAma ctx={ctx} />
      )}

      <Dialog open={leaveTo !== null} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <DialogContent title={t.leaveTitle} icon={<Undo2 className="h-4 w-4" />} description={fill(t.leaveDesc, { n: formatNumber(dirty) })} size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (leaveTo) goSub(leaveTo);
              setDirty(0);
              setLeaveTo(null);
            }}
          >
            <p className="text-sm text-fg-muted">{t.leaveBody}</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLeaveTo(null)}>
                {t.stay}
              </Button>
              <Button type="submit" variant="danger">
                {t.discard}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
