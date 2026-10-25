"use client";
// Bước 7 "Sửa sau thông quan": mọi việc của bản khai bổ sung AMA ở một chỗ – dòng tóm tắt tờ khai gốc + hạn 60 ngày,
// rồi 4 bước nhỏ ① Chọn dòng · ② Sửa nội dung · ③ Lý do & phê duyệt · ④ Khai Hải quan (?sub=…, mặc định theo trạng thái bản khai).
// Spec: docs/superpowers/specs/2026-10-20-ama-sau-thong-quan-redesign-design.md
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, SegmentedControl, Stack, StatusBadge, Stepper, fill, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { canEditDeclaration } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FilePlus2, FileText, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { customsKeys, getSubmission, startPostAmendment } from "@/api/customs";
import { dossierKeys } from "@/api/dossiers";
import { copyPostAmendmentHeader, getPostAmendmentView, postAmendmentKeys } from "@/api/post-amendment";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys } from "@/api/settings";
import { formatDate, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StepError, StepLoading } from "../dossier-detail/steps/declaration-parts";
import { anyInProgress, postSheet, sheetsOf, sheetView } from "../dossier-detail/steps/branch-sheets";
import type { StepProps } from "../dossier-detail/steps/types";
import { AMA_MESSAGES } from "./ama.messages";
import { amaHeaderLabel, amaSubSteps, amaDeadline, copyResultLines, maxSubStep, postStepVisible, resolveSubStep, subStepEditable, type AmaSubStep } from "./ama-wizard";
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
  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    // Đang chờ Hải quan phản hồi AMA/AMB/AMC (của bất kỳ tờ nào) → hỏi lại mỗi giây.
    refetchInterval: (sq) => (sq.state.data && anyInProgress(sq.state.data) ? 1000 : false),
  });
  // Lô nhiều tờ khai: AMA theo từng tờ (?branch=k; vắng → tờ đang sửa sau thông quan / đã thông quan). Lô 1 tờ: tờ 1.
  const sheets = subQ.data ? sheetsOf(subQ.data) : [];
  const branch = postSheet(sheets, params.get("branch"));
  const of = Math.max(1, sheets.length);
  const q = useQuery({
    queryKey: [...postAmendmentKeys.view(dossier.id), branch],
    queryFn: () => getPostAmendmentView(dossier.id, branch),
    enabled: Boolean(subQ.data),
  });
  // Giai đoạn (của tờ bất kỳ) đổi do phản hồi Hải quan → trạng thái bản khai (và bước nhỏ) đổi theo.
  const stageKey = subQ.data ? sheets.map((b) => b.stage).join(",") : undefined;
  useEffect(() => {
    if (!stageKey) return;
    void qc.invalidateQueries({ queryKey: postAmendmentKeys.view(dossier.id) });
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
  }, [stageKey, qc, dossier.id]);
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
  const sheetParam = of > 1 ? `&branch=${branch}` : "";
  const goSub = (s: AmaSubStep) => router.replace(`${pathname}?step=post&sub=${s}${sheetParam}`, { scroll: false });
  const goSheet = (no: number) => router.replace(`${pathname}?step=post&branch=${no}`, { scroll: false });
  const start = useMutation({
    mutationFn: () => startPostAmendment(dossier.id, branch),
    onSuccess: () => {
      toast({ tone: "success", title: t.createdToast, description: t.createdDesc });
      refresh();
      goSub("pick");
    },
    onError: toastMutationError(t.createFailed),
  });
  const copy = useMutation({
    mutationFn: (keys: string[]) => copyPostAmendmentHeader(dossier.id, { fromBranch: branch, keys }),
    onSuccess: (r) => {
      toast({ tone: r.applied.length ? "success" : "warning", title: t.copyDone });
      refresh();
    },
    onError: toastMutationError(t.copyFailed),
  });
  // Kết quả nhân bản thuộc tờ vừa bấm – đổi tờ thì bỏ.
  const resetCopy = copy.reset;
  useEffect(() => resetCopy(), [branch, resetCopy]);

  if (subQ.isLoading || (subQ.data && q.isLoading)) return <StepLoading />;
  if (q.isError) return <StepError error={q.error} onRetry={() => void q.refetch()} />;
  if (subQ.isError) return <StepError error={subQ.error} onRetry={() => void subQ.refetch()} />;
  const view = q.data!;
  const submission = sheetView(subQ.data!, branch);
  const a = view.current ?? view.history[0] ?? null;
  const canStart = submission.stage === "CLEARED" && canEdit;
  const sheet = sheets[branch - 1];
  // Lô nhiều tờ: tên tờ + số tờ khai ở đầu bước; chọn tờ khi có ≥ 2 tờ đã thông quan.
  const heading = of > 1 ? (sheet?.declarationNo ? fill(t.sheetHeading, { no: branch, of, decl: sheet.declarationNo }) : fill(t.sheetHeadingNoNo, { no: branch, of })) : null;
  const postSheets = sheets.filter((b) => postStepVisible(b.stage));
  const sheetBar = heading ? (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-fg">
        <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        {heading}
      </p>
      {postSheets.length > 1 && (
        <SegmentedControl<string>
          label={t.sheetPick}
          hideLabel
          value={String(branch)}
          onChange={(v) => goSheet(Number(v))}
          options={postSheets.map((b) => ({ value: String(b.no), label: fill(t.sheetOption, { no: b.no, of }) }))}
        />
      )}
    </div>
  ) : null;

  if (!a) {
    return (
      <Stack gap="lg">
      {sheetBar}
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
      </Stack>
    );
  }

  const sub = resolveSubStep(a, params.get("sub"));
  const ctx: AmaStepCtx = {
    dossierId: dossier.id,
    branch,
    of,
    kind: dossier.direction === "NK" ? "IDA" : "EDA",
    a, view, submission, canEdit, fourEyes, refresh, goSub,
    editable: a === view.current && subStepEditable(a, sub, canEdit),
  };
  const h = a.header;
  const deadline = amaDeadline(h["TK_IPD"], today());
  const original = [h["TK_ICN"] && fill(t.origDecl, { no: h["TK_ICN"] }), h["TK_ICB"], h["TK_CHS"], h["TK_IPD"] && fill(t.clearedOn, { d: formatDate(h["TK_IPD"]) })].filter(Boolean).join(" · ");

  // Sửa chỉ tiêu chung (ô đầu VN_AMA giống nhau ở mọi tờ) trên bản khai của tờ này → các tờ khác vẫn giữ giá trị cũ (spec §6.6).
  const others = sheets.filter((b) => b.no !== branch);
  const commonEdits = of > 1 && view.current ? view.commonEdits : [];
  const notCleared = others.filter((b) => !postStepVisible(b.stage)).map((b) => b.no);

  return (
    <Stack gap="lg">
      {sheetBar}
      {commonEdits.length > 0 && (
        <Alert
          tone="warning"
          title={fill(t.commonTitle, { sheets: others.map((b) => b.no).join(", ") })}
          {...(canEdit
            ? {
                action: (
                  <Button size="sm" variant="secondary" leftIcon={<Copy className="h-4 w-4" />} loading={copy.isPending} onClick={() => copy.mutate(commonEdits)}>
                    {t.copyButton}
                  </Button>
                ),
              }
            : {})}
        >
          <p>{fill(t.commonBody, { fields: commonEdits.map(amaHeaderLabel).join(", ") })}</p>
          {notCleared.length > 0 && <p>{fill(t.commonNotCleared, { sheets: notCleared.join(", ") })}</p>}
          {copy.data && (
            <ul className="mt-2 flex flex-col gap-1" aria-live="polite">
              {copyResultLines(copy.data, locale).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
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
