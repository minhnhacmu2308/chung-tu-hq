"use client";
// Bước ④ Khai Hải quan: một nút chính theo việc tiếp theo (khai tạm AMA → khai chính thức AMC), gọi về sửa AMB là nút phụ.
// Kết quả Hải quan trả về, thông điệp AMA/AMB/AMC (thu gọn) và lịch sử các lần bổ sung đã khai chính thức.
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Disclosure, EmptyState, Grid, Spinner, Stack, Stepper, fill, toast, useMessages, useUiLocale } from "@kb/ui";
import type { PostAmendment } from "@kb/contracts";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FilePlus2, MessageSquareText, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { performOperation, startPostAmendment } from "@/api/customs";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";
import { AMA_MESSAGES } from "./ama.messages";
import { AMA_OPS, amaPrimaryAction, amaRejection, reviewTarget } from "./ama-wizard";


const milestone = (a: PostAmendment) => (a.status === "REGISTERED" ? "DONE" : a.status === "PRE_DECLARED" ? "AMC" : "AMA");
const taxChange = (r: Record<string, string> | undefined) => (r?.["TK_A23"] ? `${r["TK_ADB"] === "-" ? "−" : "+"}${formatMoney(r["TK_A23"], "VND", 0)}` : "—");

export function DeclareAma({ ctx }: { ctx: AmaStepCtx }) {
  const { a, submission: s, view } = ctx;
  const t = useMessages(AMA_MESSAGES);
  const locale = useUiLocale();
  const milestones = [
    { id: "AMA", label: t.msProvisional },
    { id: "AMC", label: t.msOfficial },
    { id: "DONE", label: t.msDone },
  ];
  const [recallOpen, setRecallOpen] = useState(false);
  const sending = s.pipeline.some((r) => AMA_OPS.has(r.op) && r.status === "SENDING");
  const primary = amaPrimaryAction(a, { stage: s.stage, sending }, locale);
  const isCurrent = a === view.current;
  const rejected = amaRejection(a, s.rejection, isCurrent);
  const rejection = rejected?.rejection ?? null;
  const messages = s.messages.filter((m) => AMA_OPS.has(m.operation));

  const perform = useMutation({
    mutationFn: (op: "AMA" | "AMB" | "AMC") => performOperation(ctx.dossierId, op, ctx.branch),
    onSuccess: (r) => {
      setRecallOpen(false);
      toast({ tone: r.sent ? "info" : "success", title: r.message });
      ctx.refresh();
    },
    onError: toastMutationError(t.opFailed),
  });
  const startNew = useMutation({
    mutationFn: () => startPostAmendment(ctx.dossierId, ctx.branch),
    onSuccess: () => {
      toast({ tone: "success", title: t.newCreated, description: t.createdDesc });
      ctx.refresh();
      ctx.goSub("pick");
    },
    onError: toastMutationError(t.createFailed),
  });

  const canRecall = isCurrent && ctx.canEdit && a.status === "PRE_DECLARED" && s.stage === "POST_PRE_DECLARED" && !sending;
  const canStartNew = !view.current && s.stage === "CLEARED" && ctx.canEdit;

  return (
    <>
      <Stack gap="md">
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <CardTitle as="h3">{t.subDeclare}</CardTitle>
            <Stepper label={t.progressLabel} steps={milestones} currentId={milestone(a)} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sending && (
              <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
                <Spinner className="h-4 w-4" /> {t.waiting}
              </p>
            )}
            {rejection && (
              <Alert
                tone="danger"
                title={fill(t.rejectedAt, { op: rejection.operation, at: formatDateTime(rejection.at) })}
                // AMA bị từ chối: sửa nội dung rồi khai lại. AMB/AMC bị từ chối: bản khai giữ nguyên, xem lỗi rồi gửi lại.
                {...(rejected?.fixable
                  ? {
                      action: (
                        <Button size="sm" variant="secondary" onClick={() => ctx.goSub("edit")}>
                          {t.fixAgain}
                        </Button>
                      ),
                    }
                  : {})}
              >
                <ul className="flex flex-col gap-1">
                  {rejection.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.line !== undefined ? fill(t.goodsLine, { n: e.line }) : fill(t.errCode, { code: e.code })}:</span> {e.message}
                      {e.solution ? ` → ${e.solution}` : ""}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {a.result ? (
              <Grid cols={{ base: 1, md: 2 }} gap="sm" className="rounded-md border border-border px-4 py-3 text-sm">
                <p><span className="text-fg-muted">{t.resNo}</span> <span className="font-mono">{a.result["TK_SYN"] || "—"}</span></p>
                <p><span className="text-fg-muted">{t.resNotice}</span> <span className="font-mono">{a.result["TK_ADD"] || "—"}</span></p>
                <p><span className="text-fg-muted">{t.resDate}</span> {a.result["TK_A02"] ? formatDate(a.result["TK_A02"]) : "—"}</p>
                <p><span className="text-fg-muted">{t.resTax}</span> {taxChange(a.result)}</p>
                {a.result["TK_ADE"] && <p className="text-warning-subtle-fg">{t.over60}</p>}
              </Grid>
            ) : (
              !sending && <p className="text-sm text-fg-muted">{t.noResult}</p>
            )}
            {a.status === "REGISTERED" && (
              <Alert tone="success" title={t.registeredTitle}>
                {fill(t.registeredBody, { n: formatNumber(a.seq) })}
              </Alert>
            )}
          </CardContent>
        </Card>

        <Disclosure title={t.messagesTitle} meta={<Badge tone="neutral">{formatNumber(messages.length)}</Badge>}>
          {messages.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-3 py-2">
                  <MessageSquareText aria-hidden="true" className="mt-0.5 h-4 w-4 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      <span className="font-mono font-medium">{m.operation}</span> · {m.direction === "OUT" ? t.sent : t.received} – {m.summary}
                    </p>
                    <p className="text-xs text-fg-muted">{formatDateTime(m.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<MessageSquareText />} title={t.noMsg} />
          )}
        </Disclosure>

        {view.history.length > 0 && (
          <Disclosure title={t.history} meta={<Badge tone="neutral">{fill(t.timesN, { n: formatNumber(view.history.length) })}</Badge>}>
            <ul className="flex flex-col divide-y divide-border">
              {view.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-fg">{fill(t.timeN, { n: formatNumber(h.seq) })}</span>
                  <span className="text-fg-muted">{h.result?.["TK_A02"] ? formatDate(h.result["TK_A02"]) : "—"}</span>
                  <span className="font-mono text-fg-muted">{h.result?.["TK_SYN"] || "—"}</span>
                  <span className="tabular-nums text-fg">{taxChange(h.result)}</span>
                </li>
              ))}
            </ul>
          </Disclosure>
        )}
      </Stack>

      <StickyActionBar>
        <p className="min-w-0 flex-1 basis-48 text-sm text-fg-muted">
          {primary ? t.nextStep : sending ? t.waitingShort : a.status === "REGISTERED" ? t.doneAll : t.notYetDeclare}
        </p>
        {/* Màn hẹp thanh bước nhỏ không bấm được – nút này là đường quay lại xem/sửa bản khai. */}
        <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => ctx.goSub(reviewTarget(a))}>
          {t.review}
        </Button>
        {canRecall && (
          <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setRecallOpen(true)}>
            {t.recall}
          </Button>
        )}
        {primary && ctx.canEdit && (
          <Button leftIcon={<Send className="h-4 w-4" />} loading={perform.isPending && perform.variables !== "AMB"} onClick={() => perform.mutate(primary.op)}>
            {primary.label}
          </Button>
        )}
        {canStartNew && (
          <Button leftIcon={<FilePlus2 className="h-4 w-4" />} loading={startNew.isPending} onClick={() => startNew.mutate()}>
            {fill(t.createNth, { n: formatNumber((view.history[0]?.seq ?? 0) + 1) })}
          </Button>
        )}
      </StickyActionBar>

      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent title={t.recall} icon={<RotateCcw className="h-4 w-4" />} description={fill(t.seqTitle, { n: formatNumber(a.seq) })} size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform.mutate("AMB");
            }}
          >
            <p className="text-sm text-fg-muted">{t.recallBody}</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRecallOpen(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" loading={perform.isPending} leftIcon={<RotateCcw className="h-4 w-4" />}>
                {t.recall}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
