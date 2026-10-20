"use client";
// Bước ④ Khai Hải quan: một nút chính theo việc tiếp theo (khai tạm AMA → khai chính thức AMC), gọi về sửa AMB là nút phụ.
// Kết quả Hải quan trả về, thông điệp AMA/AMB/AMC (thu gọn) và lịch sử các lần bổ sung đã khai chính thức.
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Disclosure, EmptyState, Grid, Spinner, Stack, Stepper, toast } from "@kb/ui";
import type { PostAmendment } from "@kb/contracts";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, FilePlus2, MessageSquareText, RotateCcw, Send } from "lucide-react";
import { useState } from "react";
import { performOperation, startPostAmendment } from "@/api/customs";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { StickyActionBar } from "../dossier-detail/steps/declaration-parts";
import type { AmaStepCtx } from "./ama-context";
import { AMA_OPS, amaPrimaryAction, amaRejection, reviewTarget } from "./ama-wizard";


const MILESTONES = [
  { id: "AMA", label: "Khai tạm AMA" },
  { id: "AMC", label: "Khai chính thức AMC" },
  { id: "DONE", label: "Hoàn tất" },
];
const milestone = (a: PostAmendment) => (a.status === "REGISTERED" ? "DONE" : a.status === "PRE_DECLARED" ? "AMC" : "AMA");
const taxChange = (r: Record<string, string> | undefined) => (r?.["TK_A23"] ? `${r["TK_ADB"] === "-" ? "−" : "+"}${formatMoney(r["TK_A23"], "VND", 0)}` : "—");

export function DeclareAma({ ctx }: { ctx: AmaStepCtx }) {
  const { a, submission: s, view } = ctx;
  const [recallOpen, setRecallOpen] = useState(false);
  const sending = s.pipeline.some((r) => AMA_OPS.has(r.op) && r.status === "SENDING");
  const primary = amaPrimaryAction(a, { stage: s.stage, sending });
  const isCurrent = a === view.current;
  const rejected = amaRejection(a, s.rejection, isCurrent);
  const rejection = rejected?.rejection ?? null;
  const messages = s.messages.filter((m) => AMA_OPS.has(m.operation));

  const perform = useMutation({
    mutationFn: (op: "AMA" | "AMB" | "AMC") => performOperation(ctx.dossierId, op),
    onSuccess: (r) => {
      setRecallOpen(false);
      toast({ tone: r.sent ? "info" : "success", title: r.message });
      ctx.refresh();
    },
    onError: toastMutationError("Không thực hiện được nghiệp vụ"),
  });
  const startNew = useMutation({
    mutationFn: () => startPostAmendment(ctx.dossierId),
    onSuccess: () => {
      toast({ tone: "success", title: "Đã lập bản khai bổ sung mới", description: "Chọn dòng hàng cần sửa." });
      ctx.refresh();
      ctx.goSub("pick");
    },
    onError: toastMutationError("Không lập được bản khai bổ sung"),
  });

  const canRecall = isCurrent && ctx.canEdit && a.status === "PRE_DECLARED" && s.stage === "POST_PRE_DECLARED" && !sending;
  const canStartNew = !view.current && s.stage === "CLEARED" && ctx.canEdit;

  return (
    <>
      <Stack gap="md">
        <Card>
          <CardHeader className="flex flex-col gap-3">
            <CardTitle as="h3">Khai Hải quan</CardTitle>
            <Stepper label="Tiến trình khai bản bổ sung" steps={MILESTONES} currentId={milestone(a)} />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {sending && (
              <p className="flex items-center gap-2 text-sm text-fg-muted" aria-live="polite">
                <Spinner className="h-4 w-4" /> Đang chờ Hải quan phản hồi…
              </p>
            )}
            {rejection && (
              <Alert
                tone="danger"
                title={`Hải quan từ chối ${rejection.operation} lúc ${formatDateTime(rejection.at)}`}
                // AMA bị từ chối: sửa nội dung rồi khai lại. AMB/AMC bị từ chối: bản khai giữ nguyên, xem lỗi rồi gửi lại.
                {...(rejected?.fixable
                  ? {
                      action: (
                        <Button size="sm" variant="secondary" onClick={() => ctx.goSub("edit")}>
                          Sửa lại
                        </Button>
                      ),
                    }
                  : {})}
              >
                <ul className="flex flex-col gap-1">
                  {rejection.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.line !== undefined ? `Dòng hàng ${e.line}` : `Mã lỗi ${e.code}`}:</span> {e.message}
                      {e.solution ? ` → ${e.solution}` : ""}
                    </li>
                  ))}
                </ul>
              </Alert>
            )}
            {a.result ? (
              <Grid cols={{ base: 1, md: 2 }} gap="sm" className="rounded-md border border-border px-4 py-3 text-sm">
                <p><span className="text-fg-muted">Số tờ khai bổ sung:</span> <span className="font-mono">{a.result["TK_SYN"] || "—"}</span></p>
                <p><span className="text-fg-muted">Số thông báo:</span> <span className="font-mono">{a.result["TK_ADD"] || "—"}</span></p>
                <p><span className="text-fg-muted">Ngày đăng ký khai bổ sung:</span> {a.result["TK_A02"] ? formatDate(a.result["TK_A02"]) : "—"}</p>
                <p><span className="text-fg-muted">Tổng tiền thuế tăng/giảm:</span> {taxChange(a.result)}</p>
                {a.result["TK_ADE"] && <p className="text-warning-subtle-fg">Quá 60 ngày kể từ ngày thông quan</p>}
              </Grid>
            ) : (
              !sending && <p className="text-sm text-fg-muted">Chưa có kết quả – số tờ khai bổ sung và thuế tăng/giảm hiện ở đây sau khi khai tạm AMA.</p>
            )}
            {a.status === "REGISTERED" && (
              <Alert tone="success" title="Đã khai chính thức">
                Bản khai bổ sung lần {formatNumber(a.seq)} đã khóa. Cần sửa tiếp thì lập bản khai bổ sung mới.
              </Alert>
            )}
          </CardContent>
        </Card>

        <Disclosure title="Thông điệp AMA/AMB/AMC" meta={<Badge tone="neutral">{formatNumber(messages.length)}</Badge>}>
          {messages.length ? (
            <ul className="flex flex-col divide-y divide-border">
              {messages.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start gap-3 py-2">
                  <MessageSquareText aria-hidden="true" className="mt-0.5 h-4 w-4 text-fg-subtle" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-fg">
                      <span className="font-mono font-medium">{m.operation}</span> · {m.direction === "OUT" ? "Gửi đi" : "Nhận về"} – {m.summary}
                    </p>
                    <p className="text-xs text-fg-muted">{formatDateTime(m.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<MessageSquareText />} title="Chưa có thông điệp" />
          )}
        </Disclosure>

        {view.history.length > 0 && (
          <Disclosure title="Lịch sử bổ sung" meta={<Badge tone="neutral">{formatNumber(view.history.length)} lần</Badge>}>
            <ul className="flex flex-col divide-y divide-border">
              {view.history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-fg">Lần {formatNumber(h.seq)}</span>
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
          {primary ? "Việc tiếp theo" : sending ? "Đang chờ Hải quan" : a.status === "REGISTERED" ? "Đã hoàn tất bản khai bổ sung" : "Chưa đến bước khai – phê duyệt bản khai trước"}
        </p>
        {/* Màn hẹp thanh bước nhỏ không bấm được – nút này là đường quay lại xem/sửa bản khai. */}
        <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => ctx.goSub(reviewTarget(a))}>
          Xem lại bản khai
        </Button>
        {canRecall && (
          <Button variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />} onClick={() => setRecallOpen(true)}>
            Gọi về sửa (AMB)
          </Button>
        )}
        {primary && ctx.canEdit && (
          <Button leftIcon={<Send className="h-4 w-4" />} loading={perform.isPending && perform.variables !== "AMB"} onClick={() => perform.mutate(primary.op)}>
            {primary.label}
          </Button>
        )}
        {canStartNew && (
          <Button leftIcon={<FilePlus2 className="h-4 w-4" />} loading={startNew.isPending} onClick={() => startNew.mutate()}>
            Lập bản khai bổ sung lần {formatNumber((view.history[0]?.seq ?? 0) + 1)}
          </Button>
        )}
      </StickyActionBar>

      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent title="Gọi về sửa (AMB)" icon={<RotateCcw className="h-4 w-4" />} description={`Bản khai bổ sung lần ${formatNumber(a.seq)}`} size="sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform.mutate("AMB");
            }}
          >
            <p className="text-sm text-fg-muted">Hải quan chấp nhận gọi về thì bản khai bổ sung mở lại để sửa. Phê duyệt hiện tại bị hủy – sửa xong phải phê duyệt lại rồi khai tạm AMA lại.</p>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setRecallOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" loading={perform.isPending} leftIcon={<RotateCcw className="h-4 w-4" />}>
                Gọi về sửa (AMB)
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
