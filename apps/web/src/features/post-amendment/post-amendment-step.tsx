"use client";
// Bước 7 "Sửa sau thông quan": mọi việc của bản khai bổ sung AMA ở một chỗ – dòng tóm tắt tờ khai gốc + hạn 60 ngày,
// rồi 4 bước nhỏ ① Chọn dòng · ② Sửa nội dung · ③ Lý do & phê duyệt · ④ Khai Hải quan (?sub=…, mặc định theo trạng thái bản khai).
// Spec: docs/superpowers/specs/2026-10-20-ama-sau-thong-quan-redesign-design.md
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, Stack, StatusBadge, Stepper, toast } from "@kb/ui";
import { canEditDeclaration } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, Undo2 } from "lucide-react";
import { useState } from "react";
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
import { AMA_SUB_STEPS, amaDeadline, defaultSubStep, resolveSubStep, subStepEditable, type AmaSubStep } from "./ama-wizard";
import { AMA_STATUS, type AmaStepCtx } from "./ama-context";
import { EditLines } from "./line-compare";
import { PickLines } from "./pick-lines";

const today = () => new Date().toISOString().slice(0, 10);

export function PostAmendmentStep({ dossier }: StepProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: postAmendmentKeys.view(dossier.id), queryFn: () => getPostAmendmentView(dossier.id) });
  const subQ = useQuery({ queryKey: customsKeys.submission(dossier.id), queryFn: () => getSubmission(dossier.id) });
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
      toast({ tone: "success", title: "Đã lập bản khai bổ sung", description: "Chọn dòng hàng cần sửa." });
      refresh();
      goSub("pick");
    },
    onError: toastMutationError("Không lập được bản khai bổ sung"),
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
            title="Cần sửa sau thông quan?"
            description="Lập bản khai bổ sung riêng, điền sẵn từ tờ khai gốc và số Hải quan trả về. Tờ khai gốc giữ nguyên. Hạn khai bổ sung: 60 ngày kể từ ngày thông quan (TT121 Điều 20)."
            {...(canStart ? { action: <Button loading={start.isPending} onClick={() => start.mutate()}>Lập bản khai bổ sung</Button> } : {})}
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
  const original = [h["TK_ICN"] && `TK ${h["TK_ICN"]}`, h["TK_ICB"], h["TK_CHS"], h["TK_IPD"] && `thông quan ${formatDate(h["TK_IPD"])}`].filter(Boolean).join(" · ");

  return (
    <Stack gap="lg">
      <Card>
        <CardHeader className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CardTitle>Bản khai bổ sung lần {formatNumber(a.seq)}</CardTitle>
            <StatusBadge status={AMA_STATUS[a.status]} />
            {deadline && a.status !== "REGISTERED" && (
              deadline.overdue ? (
                <Badge tone="warning">Quá hạn 60 ngày ({formatDate(deadline.due)})</Badge>
              ) : (
                <Badge tone="neutral">Hạn {formatDate(deadline.due)} · còn {formatNumber(deadline.daysLeft)} ngày</Badge>
              )
            )}
          </div>
          {original && <p className="flex items-center gap-2 text-sm text-fg-muted"><FileText aria-hidden="true" className="h-4 w-4 shrink-0" />Tờ khai gốc: {original}</p>}
          <Stepper
            label="Các bước sửa sau thông quan"
            steps={AMA_SUB_STEPS}
            currentId={defaultSubStep(a)}
            viewingId={sub}
            onStepClick={(s) => (sub === "edit" && dirty > 0 ? setLeaveTo(s as AmaSubStep) : goSub(s as AmaSubStep))}
          />
        </CardHeader>
      </Card>
      {sub === "pick" ? (
        <PickLines ctx={ctx} />
      ) : sub === "edit" ? (
        <EditLines ctx={ctx} onDirtyChange={setDirty} />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <EmptyState title="Đang xây dựng" description={AMA_SUB_STEPS.find((s) => s.id === sub)?.label ?? ""} />
          </CardContent>
        </Card>
      )}

      <Dialog open={leaveTo !== null} onOpenChange={(o) => !o && setLeaveTo(null)}>
        <DialogContent title="Bỏ thay đổi chưa lưu?" icon={<Undo2 className="h-4 w-4" />} description={`Còn ${formatNumber(dirty)} ô đã sửa ở bước Sửa nội dung chưa lưu.`} size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (leaveTo) goSub(leaveTo);
              setDirty(0);
              setLeaveTo(null);
            }}
          >
            <p className="text-sm text-fg-muted">Chuyển bước sẽ bỏ các thay đổi này. Muốn giữ thì ở lại và bấm Lưu.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setLeaveTo(null)}>
                Ở lại
              </Button>
              <Button type="submit" variant="danger">
                Bỏ thay đổi
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
