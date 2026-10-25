"use client";
// Bước 6 – Khai báo Hải quan: dòng đời tờ khai theo giai đoạn ① Khai báo ② Sửa đổi bổ sung ④ Chứng từ & cảng.
// Sửa sau thông quan (AMA/AMB/AMC) làm ở bước 7 – ở đây chỉ còn thẻ lối vào. Quy tắc bấm được / việc tiếp theo do backend (hoặc mock)
// tính bằng @kb/contracts customs-flow – màn chỉ hiển thị.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Disclosure, EmptyState, Field,
  fill, Grid, IconTile, pickMessages, Select, Spinner, Stack, StatusBadge, toast, toastPromise, useMessages, useUiLocale, type Tone, type UiLocale,
} from "@kb/ui";
import { baseOp, CUSTOMS_OPERATIONS, CUSTOMS_PHASES, type CustomsOperation, type CustomsPhase, type CustomsStage } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Circle, Clock3, FilePen, KeyRound, Landmark, RefreshCw, RotateCcw, Search, Send, Sparkles, XCircle,
} from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { dossierKeys } from "@/api/dossiers";
import {
  customsKeys, getSubmission, listCertificates, performOperation, resendOperation, submitDeclaration,
  type BranchSubmission, type PipelineRow, type PipelineStatus, type SubmissionView,
} from "@/api/customs";
import { declarationKeys, getDeclarationView } from "@/api/declaration";
import { getPostAmendmentView, postAmendmentKeys } from "@/api/post-amendment";
import { fromMinor, toMinor } from "@/lib/decimal";
import { formatDate, formatDateTime, formatRelative, formatTime, formatVnd } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { rowReason } from "@/lib/reason-codes";
import type { CustomsChannel, Declaration } from "@/mocks/types";
import { CustomsInfoPanel, type CustomsEstimate } from "./customs-info-panel";
import { errorMessage, KeyValue, StepError, StepLoading } from "./declaration-parts";
import type { StepProps } from "./types";
import { AMA_STATUS } from "../../post-amendment/ama-context";
import { declarationGapsOf } from "../../declaration-print/print-state";
import { RequiredGapsAlert } from "../../declaration-print/required-gaps-alert";
import { AMA_OPS, postStepVisible } from "../../post-amendment/ama-wizard";
import { OPERATION_MESSAGES, PHASE_MESSAGES, SHEET_MESSAGES, STAGE_MESSAGES, SUBMIT_MESSAGES } from "./submit-step.messages";
import { anyInProgress, problemOf, sheetsOf, sheetView, waitingOn } from "./branch-sheets";

type SubmitText = Record<keyof (typeof SUBMIT_MESSAGES)["vi"], string>;

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

const PIPE_TONE: Record<PipelineStatus, Tone> = { NOT_SENT: "neutral", WAITING: "neutral", SENDING: "info", OK: "success", ERROR: "danger" };
const PIPE_KEY = { NOT_SENT: "pipeNotSent", WAITING: "pipeWaiting", SENDING: "pipeSending", OK: "pipeOk", ERROR: "pipeError" } as const satisfies Record<PipelineStatus, keyof SubmitText>;

/** Nhãn + màu trạng thái từng nghiệp vụ theo ngôn ngữ. */
export function pipeStatus(locale: UiLocale): Record<PipelineStatus, { text: string; tone: Tone }> {
  const t = pickMessages(SUBMIT_MESSAGES, locale);
  return Object.fromEntries((Object.keys(PIPE_TONE) as PipelineStatus[]).map((k) => [k, { text: t[PIPE_KEY[k]], tone: PIPE_TONE[k] }])) as Record<PipelineStatus, { text: string; tone: Tone }>;
}
/** @deprecated Bản tiếng Việt cố định – giữ cho nơi gọi cũ (declaration-form/dossier-tabs.tsx); dùng `pipeStatus(locale)`. */
export const PIPE = pipeStatus("vi");

type OpKey = keyof (typeof OPERATION_MESSAGES)["vi"];
/** Tên mô tả nghiệp vụ theo ngôn ngữ (mã giữ nguyên); mã lạ → nhãn có sẵn trên dòng. */
const opLabel = (ops: Record<OpKey, string>, r: Pick<PipelineRow, "op" | "label">) => ops[baseOp(r.op) as OpKey] ?? r.label;

/** Nhãn nút gửi theo nghiệp vụ gốc (mã nhập; mã xuất E… dùng chung). */
const SEND_KEY: Partial<Record<CustomsOperation, keyof SubmitText>> = {
  IDA: "sendIDA", IDB: "sendRecall", IDC: "sendIDC", IDD: "sendRecall", IDA01: "sendIDA01", IDE: "sendIDE",
  AMA: "sendAMA", AMB: "sendRecall", AMC: "sendAMC", HYS: "send", CONT: "send", PORT_FEE: "sendPortFee",
};
const sendLabel = (t: SubmitText, r: PipelineRow, stage: CustomsStage) => {
  if (baseOp(r.op) === "IDA" && stage === "RECALLED") return t.sendIDAAgain;
  const key = SEND_KEY[baseOp(r.op)];
  return key ? t[key] : t.send;
};
/** Tháng/năm hết hạn chứng thư: "10/2027" (vi, en) · "2027/10" (zh). */
const monthYear = (iso: string, locale: UiLocale) => (locale === "zh" ? `${iso.slice(0, 4)}/${iso.slice(5, 7)}` : `${iso.slice(5, 7)}/${iso.slice(0, 4)}`);
/** Gửi lại khi lỗi: chỉ các nghiệp vụ có kịch bản tra cứu-trước-khi-gửi-lại (ADR 0005). */
const RESENDABLE: ReadonlySet<CustomsOperation> = new Set(["IDA", "EDA", "IDC", "EDC", "HYS"]);
const isRecall = (op: CustomsOperation) => CUSTOMS_OPERATIONS[op].kind === "recall";

type PhaseState = { text: string; tone: Tone };
function phaseState(t: SubmitText, rows: PipelineRow[], stage: CustomsStage, phase: CustomsPhase): PhaseState {
  if (rows.some((r) => r.status === "SENDING" || r.enabled)) return { text: t.phaseOpen, tone: "info" };
  if (rows.some((r) => r.status === "OK")) return { text: t.phaseDone, tone: "success" };
  const passed = phase === "AMEND" && (stage === "CLEARED" || stage.startsWith("POST_"));
  return passed ? { text: t.phaseSkipped, tone: "neutral" } : { text: t.phasePending, tone: "neutral" };
}

function PipeIcon({ status }: { status: PipelineStatus }) {
  if (status === "OK") return <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-success" />;
  if (status === "ERROR") return <XCircle aria-hidden="true" className="h-5 w-5 shrink-0 text-danger" />;
  if (status === "SENDING") return <Spinner className="h-5 w-5 shrink-0 text-primary" label={null} />;
  if (status === "WAITING") return <Clock3 aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />;
  return <Circle aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />;
}

type RowHandlers = {
  stage: CustomsStage;
  nextOp: CustomsOperation | null;
  busyOp: CustomsOperation | null;
  canResend: boolean;
  onAction: (r: PipelineRow) => void;
  onResend: (r: PipelineRow) => void;
};

function RowButton({ r, h }: { r: PipelineRow; h: RowHandlers }) {
  const t = useMessages(SUBMIT_MESSAGES);
  const loading = h.busyOp === r.op;
  if (r.status === "ERROR" && RESENDABLE.has(r.op) && h.canResend) {
    return (
      <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} loading={loading} onClick={() => h.onResend(r)} aria-label={fill(t.resendAria, { op: r.op })}>
        {t.resend}
      </Button>
    );
  }
  if (!r.enabled) return null;
  const primary = h.nextOp === r.op;
  if (r.action === "EDIT") {
    return (
      <Button size="sm" variant={primary ? "primary" : "secondary"} leftIcon={<FilePen className="h-3.5 w-3.5" />} onClick={() => h.onAction(r)} aria-label={fill(t.editBeforeAria, { op: r.op })}>
        {t.editDecl}
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      variant={primary ? "primary" : isRecall(r.op) ? "ghost" : "secondary"}
      leftIcon={isRecall(r.op) ? <RotateCcw className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
      loading={loading}
      onClick={() => h.onAction(r)}
      aria-label={`${sendLabel(t, r, h.stage)} (${r.op})`}
    >
      {sendLabel(t, r, h.stage)}
    </Button>
  );
}

function OperationRow({ r, h }: { r: PipelineRow; h: RowHandlers }) {
  const locale = useUiLocale();
  const ops = useMessages(OPERATION_MESSAGES);
  const pipe = pipeStatus(locale);
  // Khóa vì đang chờ phản hồi: khung "Việc tiếp theo" đã báo – dòng giữ kết quả gần nhất cho đỡ lặp.
  const busyLock = r.status === "SENDING" || r.reasonCode === "OPERATION_PENDING";
  // Lý do theo mã (dịch theo ngôn ngữ); mã lạ → câu tiếng Việt server gửi kèm.
  const reason = rowReason(r, locale);
  // Ưu tiên: hướng dẫn sửa tờ khai → kết quả gần nhất (đã gửi) → lý do bị khóa (chưa gửi).
  const note = r.enabled && r.action === "EDIT" ? reason : r.summary ?? (busyLock ? undefined : reason);
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-3">
      <PipeIcon status={r.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 cq-sm:min-w-56">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" variant="outline" className="font-mono">
            {r.op}
          </Badge>
          <span className="text-sm font-medium text-fg">{opLabel(ops, r)}</span>
          <Badge tone={pipe[r.status].tone}>{pipe[r.status].text}</Badge>
        </div>
        {note && <p className={r.enabled || r.summary === note ? "text-sm text-fg-muted" : "text-sm text-fg-subtle"}>{note}</p>}
        {r.at && <p className="text-xs tabular-nums text-fg-subtle">{formatDateTime(r.at)}</p>}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <RowButton r={r} h={h} />
      </div>
    </li>
  );
}

function PhaseSection({ index, phase, rows, h }: { index: number; phase: (typeof CUSTOMS_PHASES)[number]; rows: PipelineRow[]; h: RowHandlers }) {
  const t = useMessages(SUBMIT_MESSAGES);
  const phases = useMessages(PHASE_MESSAGES);
  const title = phases[phase.id];
  const st = phaseState(t, rows, h.stage, phase.id);
  // Lô nhiều tờ: mỗi thẻ tờ có bộ giai đoạn riêng → id tiêu đề riêng từng thẻ.
  const headingId = `${useId()}-phase-${phase.id}`;
  return (
    <section aria-labelledby={headingId} className="rounded-md border border-border">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 id={headingId} className="text-sm font-semibold text-fg">
            {index}. {title}
          </h3>
          <p className="text-xs text-fg-muted">{phases[`${phase.id}_hint`]}</p>
        </div>
        <Badge tone={st.tone} dot>
          {st.text}
        </Badge>
      </header>
      <ol className="flex flex-col divide-y divide-border" aria-label={title}>
        {rows.map((r) => (
          <OperationRow key={r.op} r={r} h={h} />
        ))}
      </ol>
    </section>
  );
}

const CLEARANCE = {
  WAITING: { key: "clearWaiting", tone: "neutral" },
  INSPECTING: { key: "clearInspecting", tone: "warning" },
  CLEARED: { key: "clearCleared", tone: "success" },
  REJECTED: { key: "clearRejected", tone: "danger" },
} as const;

function ResultCard({ s }: { s: SubmissionView }) {
  const t = useMessages(SUBMIT_MESSAGES);
  const result = s.result;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark aria-hidden="true" className="h-5 w-5 text-primary" />
          {t.resultTitle}
        </CardTitle>
        {result?.updatedAt && <CardDescription>{fill(t.updated, { when: formatRelative(result.updatedAt) })}</CardDescription>}
      </CardHeader>
      <CardContent>
        {!result ? (
          <EmptyState
            className="px-2 py-8"
            icon={s.started ? <Clock3 /> : <Landmark />}
            title={s.started ? t.waitingFirst : t.notFiled}
            description={t.resultEmptyDesc}
          />
        ) : (
          <div className="divide-y divide-border">
            <KeyValue label={t.declNo} value={result.declarationNo ? <span className="font-mono">{result.declarationNo}</span> : <span className="text-fg-subtle">{t.waiting}</span>} />
            <div className="py-2">
              <p className="text-sm text-fg-muted">{t.channel}</p>
              {result.channel ? (
                <div className="mt-1 flex flex-col gap-1">
                  <StatusBadge status={CHANNEL_STATUS[result.channel]} className="self-start" />
                  <p className="text-sm text-fg-muted">{result.channelNote}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-fg-subtle">{t.afterOfficial}</p>
              )}
            </div>
            <KeyValue
              label={t.status}
              value={<Badge tone={CLEARANCE[result.clearanceStatus ?? "WAITING"].tone}>{t[CLEARANCE[result.clearanceStatus ?? "WAITING"].key]}</Badge>}
            />
            <KeyValue label={t.estTax} value={result.customsTaxVnd ? formatVnd(result.customsTaxVnd) : <span className="text-fg-subtle">{t.waiting}</span>} />
            {(s.amendments > 0 || s.postAmendments > 0) && (
              <KeyValue label={t.amended} value={fill(t.amendedValue, { a: s.amendments, p: s.postAmendments })} />
            )}
            {result.updatedAt && <KeyValue label={t.updatedAt} value={formatDateTime(result.updatedAt)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MessageLog({ messages }: { messages: SubmissionView["messages"] }) {
  const t = useMessages(SUBMIT_MESSAGES);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.logTitle}</CardTitle>
        <CardDescription>{t.logDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <MessageList messages={messages} />
      </CardContent>
    </Card>
  );
}

/** Danh sách thông điệp gửi/nhận (thẻ nhật ký của hồ sơ, hoặc khối nhật ký trong thẻ từng tờ). */
function MessageList({ messages }: { messages: SubmissionView["messages"] }) {
  const t = useMessages(SUBMIT_MESSAGES);
  return (
    <>
        {messages.length === 0 ? (
          <EmptyState title={t.logEmptyTitle} description={t.logEmptyDesc} />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    {m.direction === "OUT" ? (
                      <ArrowUpRight aria-label={t.outgoing} className="h-4 w-4 text-fg-subtle" />
                    ) : (
                      <ArrowDownLeft aria-label={t.incoming} className="h-4 w-4 text-primary" />
                    )}
                    <Badge tone="neutral" variant="outline" className="font-mono">
                      {m.operation}
                    </Badge>
                    <span className="min-w-0 flex-1 text-sm text-fg cq-sm:min-w-48">{m.summary}</span>
                    <Badge tone={m.result === "OK" ? "success" : m.result === "ERROR" ? "danger" : "info"}>
                      {m.result === "OK" ? t.pipeOk : m.result === "ERROR" ? t.pipeError : t.pipeSending}
                    </Badge>
                    <span className="text-xs tabular-nums text-fg-subtle" title={formatDateTime(m.at)}>{isToday(m.at) ? formatTime(m.at) : formatDateTime(m.at)}</span>
                  </summary>
                  <pre className="mx-3 mb-3 overflow-x-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-fg-muted">{m.payloadPreview}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
    </>
  );
}

/** Nghiệp vụ cần xác nhận: gọi về sửa (IDB/IDD mở lại tờ khai) trên tờ `branch`. AMB (gọi về bản khai bổ sung) làm ở bước 7. */
type Confirm = { row: PipelineRow; branch: number };

function ConfirmReopenDialog({ confirm, onClose, onConfirm, pending, code }: { confirm: Confirm | null; onClose: () => void; onConfirm: (c: Confirm) => void; pending: boolean; code: string }) {
  const t = useMessages(SUBMIT_MESSAGES);
  const ops = useMessages(OPERATION_MESSAGES);
  return (
    <Dialog open={confirm !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`${confirm ? opLabel(ops, confirm.row) : ""} (${confirm?.row.op ?? ""})`} icon={<RotateCcw className="h-4 w-4" />} description={code} size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm) onConfirm(confirm);
          }}
        >
          <Stack gap="sm">
            <p className="text-sm text-fg-muted">
              {t.recallBody}
            </p>
          </Stack>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              {t.cancel}
            </Button>
            <Button type="submit" loading={pending} leftIcon={<RotateCcw className="h-4 w-4" />}>
              {fill(t.recallAction, { op: confirm?.row.op ?? "" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Số ứng dụng ước tính lúc dựng tờ khai (tờ khai xuất chưa ước tính thuế). */
function estimateOf(decl: Declaration | null | undefined): CustomsEstimate | undefined {
  if (!decl) return undefined;
  return {
    customsValueVnd: decl.customsValueVnd,
    exchangeRate: decl.exchangeRate,
    ...(decl.kind === "IDA" ? { taxVnd: String(Number(decl.estimatedImportDutyVnd) + Number(decl.estimatedVatVnd)) } : {}),
  };
}

type DeclBranch = NonNullable<Awaited<ReturnType<typeof getDeclarationView>>>["branches"][number];
/** Ước tính của một tờ (lô nhiều tờ): trị giá tính thuế và thuế của các dòng thuộc tờ – cộng số nguyên VND, không cộng số thực. */
function sheetEstimateOf(decl: Declaration | null | undefined, b: DeclBranch | undefined): CustomsEstimate | undefined {
  if (!decl || !b) return undefined;
  return {
    customsValueVnd: b.customsValueVnd,
    exchangeRate: decl.exchangeRate,
    ...(decl.kind === "IDA" ? { taxVnd: fromMinor(toMinor(b.estImportDutyVnd, 0) + toMinor(b.estVatVnd, 0), 0) } : {}),
  };
}

/** Nghiệp vụ đang bấm: mã + tờ (nút quay của đúng thẻ). */
type Busy = { op: CustomsOperation; branch: number };

export function SubmitStep({ dossier, goTo }: StepProps) {
  const t = useMessages(SUBMIT_MESSAGES);
  const sh = useMessages(SHEET_MESSAGES);
  const stages = useMessages(STAGE_MESSAGES);
  const locale = useUiLocale();
  const declQ = useQuery({ queryKey: declarationKeys.view(dossier.id), queryFn: () => getDeclarationView(dossier.id) });
  const qc = useQueryClient();
  const [certId, setCertId] = useState<string>("");
  const [busy, setBusy] = useState<Busy | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    // Lô nhiều tờ: còn tờ nào đang chờ phản hồi / hỏi trạng thái thì hỏi lại.
    refetchInterval: (q) => (q.state.data && anyInProgress(q.state.data) ? 1000 : false),
    // Quay lại từ Review (sửa + duyệt lại) → khả năng bấm đã đổi; không dùng bản cache cũ.
    refetchOnMount: "always",
  });
  // Giai đoạn (của bất kỳ tờ nào) đổi do phản hồi Hải quan (poll) → làm mới đầu trang hồ sơ (trạng thái, số tờ khai, luồng).
  const stageKey = subQ.data ? [subQ.data.stage, ...subQ.data.branches.map((b) => b.stage)].join(",") : undefined;
  useEffect(() => {
    if (stageKey) void qc.invalidateQueries({ queryKey: dossierKeys.all });
  }, [stageKey, qc]);
  const certQ = useQuery({ queryKey: customsKeys.certificates, queryFn: listCertificates });
  const certs = certQ.data ?? [];
  const selectedId = certId || certs.find((c) => c.isDefault)?.id || certs[0]?.id || "";
  const selected = certs.find((c) => c.id === selectedId);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: customsKeys.all });
    void qc.invalidateQueries({ queryKey: dossierKeys.all });
    void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
  };
  const submit = useMutation({
    // Một toast đi suốt thao tác: "đang ký số…" → "đã gửi" hoặc lỗi.
    mutationFn: () =>
      toastPromise(submitDeclaration(dossier.id, selectedId), {
        loading: { title: t.submitLoading },
        success: { title: t.submitSuccess, description: t.submitSuccessDesc },
        error: (e) => ({ title: errorMessage(e, locale) }),
      }),
    onSuccess: invalidate,
    // Lỗi đã hiện trong toast của toastPromise (cùng một toast với "đang ký số…").
    onError: () => undefined,
  });
  const perform = useMutation({
    mutationFn: (b: Busy) => {
      setBusy(b);
      return performOperation(dossier.id, b.op, b.branch);
    },
    onSuccess: (r) => {
      setConfirm(null);
      toast({ tone: r.sent ? "info" : "success", title: r.message });
      invalidate();
    },
    onError: toastMutationError(t.performFailed),
    onSettled: () => setBusy(null),
  });
  const resend = useMutation({
    mutationFn: ({ r, branch }: { r: PipelineRow; branch: number }) => {
      setBusy({ op: r.op, branch });
      return resendOperation(dossier.id, r.op, branch);
    },
    onSuccess: (res, { r }) => {
      toast({ tone: "info", title: res.resent ? fill(t.resending, { op: r.op }) : res.message, description: t.resendDesc });
      invalidate();
    },
    onError: toastMutationError(t.resendFailed),
    onSettled: () => setBusy(null),
  });

  if (subQ.isLoading) return <StepLoading />;
  if (subQ.isError) return <StepError error={subQ.error} onRetry={() => void subQ.refetch()} />;
  const s = subQ.data!;
  const sheets = sheetsOf(s);
  const multi = sheets.length > 1;
  const firstSend = s.stage === "NOT_SENT";
  const notApproved = s.declarationStatus === "NOT_CREATED" || (firstSend && s.declarationStatus === "DRAFT");
  // Lần khai đầu: kiểm lại ô bắt buộc (dữ liệu có thể đổi sau khi duyệt) – backend chặn lần nữa trước khi đánh dấu đã khai.
  const view = declQ.data;
  const required = firstSend && !notApproved && view?.declaration ? declarationGapsOf(view.declaration, view.items, s) : { gaps: [], lineNos: [] };
  const blocked = notApproved || s.hsUnconfirmed > 0 || required.gaps.length > 0;
  const certExpired = selected ? selected.validTo < new Date().toISOString().slice(0, 10) : false;
  const sending = s.pipeline.find((r) => r.status === "SENDING");
  const anySending = sheets.some((b) => b.pipeline.some((r) => r.status === "SENDING"));
  const anyBusy = anySending || perform.isPending || resend.isPending || submit.isPending;
  const hasNumber = Boolean(s.result?.declarationNo);
  // AMA/AMB/AMC thuộc bước 7 – không hiện ở danh sách nghiệp vụ / việc tiếp theo của bước này.
  const pipeline = s.pipeline.filter((r) => !AMA_OPS.has(r.op));
  const next = s.nextOp && !AMA_OPS.has(s.nextOp) ? pipeline.find((r) => r.op === s.nextOp) : undefined;
  const rejection = s.rejection && !AMA_OPS.has(s.rejection.operation) ? s.rejection : null;

  /** Bộ xử lý nút của tờ `branch` (lô 1 tờ: tờ 1). */
  const handlersFor = (branch: number, stage: CustomsStage, nextOp: CustomsOperation | null): RowHandlers => ({
    stage,
    nextOp,
    busyOp: busy?.branch === branch ? busy.op : null,
    canResend: !anyBusy,
    onAction: (r) => {
      if (r.action === "EDIT") return goTo("review");
      if (isRecall(r.op)) return setConfirm({ row: r, branch });
      if (firstSend && branch === 1 && baseOp(r.op) === "IDA") return submit.mutate();
      perform.mutate({ op: r.op, branch });
    },
    onResend: (r) => resend.mutate({ r, branch }),
  });
  const h = handlersFor(1, s.stage, s.nextOp);

  const certPicker =
    firstSend && next && baseOp(next.op) === "IDA" ? (
      <div className="flex flex-col gap-3 cq-md:flex-row cq-md:items-end">
        <Field label={t.certLabel} className="flex-1">
          <Select
            value={selectedId}
            onChange={(e) => setCertId(e.currentTarget.value)}
            disabled={certQ.isLoading || blocked}
            options={certs.map((c) => ({ value: c.id, label: fill(t.certOption, { subject: c.subject, issuer: c.issuer, date: monthYear(c.validTo, locale) }) }))}
          />
        </Field>
        <Button
          leftIcon={<KeyRound className="h-4 w-4" />}
          disabled={blocked || !selectedId || certExpired || anyBusy}
          loading={submit.isPending}
          onClick={() => submit.mutate()}
        >
          {fill(t.signSend, { op: next.op })}
        </Button>
      </div>
    ) : null;
  const certNote =
    firstSend && selected ? (
      <p className="text-xs text-fg-subtle">
        {fill(t.certNote, { serial: selected.serial.slice(0, 14), date: formatDate(selected.validTo) })}
      </p>
    ) : null;

  const alerts = (
    <>
      {notApproved && (
        <Alert
          tone="danger"
          title={t.notReadyTitle}
          action={
            <Button size="sm" variant="secondary" onClick={() => goTo(s.declarationStatus === "NOT_CREATED" ? "agent" : "review")}>
              {s.declarationStatus === "NOT_CREATED" ? t.toAgent : t.openReview}
            </Button>
          }
        >
          {s.declarationStatus === "NOT_CREATED" ? t.noDecl : t.notApproved}
          {t.blockedNote}
        </Alert>
      )}
      {!notApproved && s.hsUnconfirmed > 0 && (
        <Alert tone="danger" title={fill(t.hsTitle, { n: s.hsUnconfirmed })}>
          {t.hsBody}
        </Alert>
      )}

      <RequiredGapsAlert gaps={required.gaps} lineNos={required.lineNos} actionLabel={t.openReview} onAction={() => goTo("review")}>
        {t.gapsBody}
      </RequiredGapsAlert>
    </>
  );
  const confirmDialog = (
    <ConfirmReopenDialog
      confirm={confirm}
      code={confirm && multi ? `${dossier.code} · ${fill(sh.sheetTitle, { no: confirm.branch, of: sheets.length })}` : `${dossier.code} · ${dossier.partner}`}
      pending={perform.isPending}
      onClose={() => setConfirm(null)}
      onConfirm={(c) => perform.mutate({ op: c.row.op, branch: c.branch })}
    />
  );

  // Lô nhiều tờ (> 50 dòng): thẻ chung (ký số & truyền lần đầu, tổng thông quan k/N) + mỗi tờ một thẻ có vòng đời riêng.
  if (multi) {
    const kind = dossier.direction === "NK" ? "IDA" : "EDA";
    return (
      <Stack gap="lg">
        {alerts}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Send aria-hidden="true" className="h-5 w-5 text-primary" />
              {t.filingTitle}
              <Badge tone={s.summary.cleared === sheets.length ? "success" : "neutral"}>{fill(sh.clearedOf, { cleared: s.summary.cleared, of: sheets.length })}</Badge>
              {s.summary.problems.map((p) => (
                <Badge key={p.no} tone="danger" icon={<XCircle />}>
                  {fill(p.kind === "REJECTED" ? sh.problemREJECTED : sh.problemSEND_FAILED, { no: p.no })}
                </Badge>
              ))}
            </CardTitle>
            <CardDescription>{fill(sh.sheetsDesc, { of: sheets.length })}</CardDescription>
          </CardHeader>
          {firstSend && (
            <CardContent>
              <Stack gap="md">
                <NextStep s={s} next={next} sending={sending} firstSend={firstSend} h={h} certPicker={certPicker} certNote={certNote} />
                {certExpired && <Alert tone="warning">{t.certExpired}</Alert>}
              </Stack>
            </CardContent>
          )}
        </Card>

        {sheets.map((b) => (
          <SheetCard
            key={b.no}
            b={b}
            of={sheets.length}
            s={sheetView(s, b.no)}
            waiting={waitingOn(sheets, b.no)}
            problem={problemOf(s, b.no)}
            h={handlersFor(b.no, b.stage, b.nextOp)}
            anyBusy={anyBusy}
            hideNext={firstSend && b.no === 1}
            onQuery={() => perform.mutate({ op: b.queryOp, branch: b.no })}
            onViewErrors={() => goTo("review")}
            onPost={() => goTo("post", { branch: b.no })}
          />
        ))}

        {sheets.map((b) =>
          b.customsInfo ? (
            <CustomsInfoPanel
              key={b.no}
              kind={kind}
              info={b.customsInfo}
              sheet={fill(sh.sheetTitle, { no: b.no, of: sheets.length })}
              estimate={sheetEstimateOf(declQ.data?.declaration, declQ.data?.branches.find((x) => x.no === b.no))}
            />
          ) : null,
        )}
        {confirmDialog}
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {alerts}

      {postStepVisible(s.stage) && <PostAmendmentEntry dossierId={dossier.id} onOpen={() => goTo("post")} />}

      {rejection && (
        <Alert
          tone="danger"
          title={fill(t.rejectedTitle, { op: rejection.operation, n: rejection.errors.length })}
          action={
            <Button size="sm" variant="secondary" onClick={() => goTo("review")}>
              {t.viewErrors}
            </Button>
          }
        >
          {fill(t.rejectedBody, { op: rejection.operation })}
        </Alert>
      )}

      <Grid cols={{ base: 1, lg: 3 }} gap="lg">
        <Card className="cq-lg:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <CardTitle className="flex flex-wrap items-center gap-2">
                <Send aria-hidden="true" className="h-5 w-5 text-primary" />
                {hasNumber ? (
                  <>
                    {t.declTitle} <span className="font-mono">{s.result!.declarationNo}</span>
                  </>
                ) : (
                  t.filingTitle
                )}
                {s.result?.channel && <StatusBadge status={CHANNEL_STATUS[s.result.channel]} />}
              </CardTitle>
              <CardDescription>{stages[s.stage]}</CardDescription>
            </div>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Search className="h-4 w-4" />}
              disabled={!hasNumber || anyBusy}
              loading={h.busyOp === s.queryOp}
              onClick={() => perform.mutate({ op: s.queryOp, branch: 1 })}
            >
              {fill(t.query, { op: s.queryOp })}
            </Button>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <NextStep s={s} next={next} sending={sending} firstSend={firstSend} h={h} certPicker={certPicker} certNote={certNote} />
              {firstSend && certExpired && <Alert tone="warning">{t.certExpired}</Alert>}

              {CUSTOMS_PHASES.filter((p) => pipeline.some((r) => r.phase === p.id)).map((p, i) => (
                <PhaseSection key={p.id} index={i + 1} phase={p} rows={pipeline.filter((r) => r.phase === p.id)} h={h} />
              ))}
            </Stack>
          </CardContent>
        </Card>

        <ResultCard s={s} />
      </Grid>

      {s.customsInfo && <CustomsInfoPanel kind={dossier.direction === "NK" ? "IDA" : "EDA"} info={s.customsInfo} estimate={estimateOf(declQ.data?.declaration)} />}

      <MessageLog messages={s.messages} />

      {confirmDialog}
    </Stack>
  );
}

/**
 * Thẻ một tờ khai nhánh: "Tờ k/N – số tờ khai", giai đoạn, phân luồng, tờ lỗi (chữ, không chỉ màu), "Chờ tờ j", việc tiếp theo,
 * nghiệp vụ theo giai đoạn và nhật ký của tờ; tờ đã thông quan có nút sang bước 7 (AMA của tờ).
 */
function SheetCard({
  b, of, s, waiting, problem, h, anyBusy, hideNext, onQuery, onViewErrors, onPost,
}: {
  b: BranchSubmission;
  of: number;
  s: SubmissionView;
  waiting: number | null;
  problem: "REJECTED" | "SEND_FAILED" | null;
  h: RowHandlers;
  anyBusy: boolean;
  hideNext: boolean;
  onQuery: () => void;
  onViewErrors: () => void;
  onPost: () => void;
}) {
  const t = useMessages(SUBMIT_MESSAGES);
  const sh = useMessages(SHEET_MESSAGES);
  const stages = useMessages(STAGE_MESSAGES);
  const titleId = useId();
  const pipeline = b.pipeline.filter((r) => !AMA_OPS.has(r.op));
  const next = b.nextOp && !AMA_OPS.has(b.nextOp) ? pipeline.find((r) => r.op === b.nextOp) : undefined;
  const sending = pipeline.find((r) => r.status === "SENDING");
  const rejection = b.rejection && !AMA_OPS.has(b.rejection.operation) ? b.rejection : null;
  const channel = b.channel ?? b.result?.channel ?? null;
  return (
    <Card aria-labelledby={titleId}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <CardTitle as="h3" id={titleId} className="flex flex-wrap items-center gap-2">
            <span>
              {b.declarationNo ? fill(sh.sheetTitleNo, { no: b.no, of, decl: b.declarationNo }) : fill(sh.sheetTitle, { no: b.no, of })}
            </span>
            {channel && <StatusBadge status={CHANNEL_STATUS[channel]} />}
            {problem && (
              <Badge tone="danger" icon={<XCircle />}>
                {sh[problem]}
              </Badge>
            )}
            {waiting && (
              <Badge tone="neutral" icon={<Clock3 />}>
                {fill(sh.waitingSheet, { no: waiting })}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {stages[b.stage]}
            {!b.declarationNo && <> · {sh.noNumber}</>}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {postStepVisible(b.stage) && (
            <Button size="sm" variant="secondary" leftIcon={<FilePen className="h-4 w-4" />} onClick={onPost}>
              {sh.postAmend}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Search className="h-4 w-4" />}
            disabled={!b.declarationNo || anyBusy}
            loading={h.busyOp === b.queryOp}
            onClick={onQuery}
            aria-label={fill(sh.queryAria, { no: b.no, op: b.queryOp })}
          >
            {fill(t.query, { op: b.queryOp })}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
          {rejection && (
            <Alert
              tone="danger"
              title={fill(t.rejectedTitle, { op: rejection.operation, n: rejection.errors.length })}
              action={
                <Button size="sm" variant="secondary" onClick={onViewErrors}>
                  {t.viewErrors}
                </Button>
              }
            >
              {fill(t.rejectedBody, { op: rejection.operation })}
            </Alert>
          )}
          {waiting ? (
            <Alert tone="info" title={fill(sh.waitingSheet, { no: waiting })}>
              {fill(sh.waitingSheetBody, { no: waiting })}
            </Alert>
          ) : hideNext ? null : (
            <NextStep s={s} next={next} sending={sending} firstSend={false} h={h} certPicker={null} certNote={null} />
          )}
          <Disclosure title={sh.opsTitle} defaultOpen={problem !== null}>
            <Stack gap="md">
              {CUSTOMS_PHASES.filter((p) => pipeline.some((r) => r.phase === p.id)).map((p, i) => (
                <PhaseSection key={p.id} index={i + 1} phase={p} rows={pipeline.filter((r) => r.phase === p.id)} h={h} />
              ))}
            </Stack>
          </Disclosure>
          <Disclosure title={sh.sheetLog} meta={<Badge tone="neutral">{b.messages.length}</Badge>}>
            <MessageList messages={b.messages} />
          </Disclosure>
        </Stack>
      </CardContent>
    </Card>
  );
}

/** Thẻ lối vào bước 7: tờ khai đã thông quan – sửa sau thông quan làm ở bước riêng. */
function PostAmendmentEntry({ dossierId, onOpen }: { dossierId: string; onOpen: () => void }) {
  const t = useMessages(SUBMIT_MESSAGES);
  const q = useQuery({ queryKey: postAmendmentKeys.view(dossierId), queryFn: () => getPostAmendmentView(dossierId) });
  const current = q.data?.current ?? null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center gap-3 pt-5">
        <IconTile icon={<FilePen />} tone={current ? "warning" : "neutral"} size="md" />
        <div className="min-w-0 flex-1 basis-48">
          {current ? (
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
              {fill(t.postAmending, { n: current.seq })} <StatusBadge status={AMA_STATUS[current.status]} />
            </p>
          ) : (
            <p className="text-sm font-medium text-fg">{t.postNeed}</p>
          )}
          <p className="text-sm text-fg-muted">{t.postDesc}</p>
        </div>
        <Button variant={current ? "primary" : "secondary"} rightIcon={<ArrowRight className="h-4 w-4" />} disabled={q.isLoading} onClick={onOpen}>
          {current ? t.continue : t.postCreate}
        </Button>
      </CardContent>
    </Card>
  );
}

function NextStep({
  s, next, sending, firstSend, h, certPicker, certNote,
}: {
  s: SubmissionView;
  next: PipelineRow | undefined;
  sending: PipelineRow | undefined;
  firstSend: boolean;
  h: RowHandlers;
  certPicker: ReactNode;
  certNote: ReactNode;
}) {
  const t = useMessages(SUBMIT_MESSAGES);
  const ops = useMessages(OPERATION_MESSAGES);
  const locale = useUiLocale();
  if (sending) {
    return (
      <Alert tone="info" title={fill(t.awaiting, { op: sending.op, label: opLabel(ops, sending).toLowerCase() })}>
        {t.awaitingBody}
      </Alert>
    );
  }
  if (!next) {
    const cleared = s.stage === "CLEARED" || s.stage.startsWith("POST_");
    return (
      <Alert tone={cleared ? "success" : "info"} title={cleared ? t.clearedTitle : t.waitingCustoms}>
        {cleared ? t.clearedBody : s.inProgress ? t.pollingBody : t.idleBody}
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary bg-primary-subtle p-4">
      <div className="flex flex-wrap items-start gap-3">
        <IconTile icon={<Sparkles />} tone="primary" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-subtle-fg">{t.nextStep}</p>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            <Badge tone="primary" variant="outline" className="font-mono">
              {next.op}
            </Badge>
            {opLabel(ops, next)}
          </p>
          {next.reason && <p className="mt-1 text-sm text-fg-muted">{rowReason(next, locale)}</p>}
        </div>
        {!certPicker && (
          <div className="flex items-center gap-2">
            <RowButton r={next} h={h} />
            {next.action === "EDIT" && <ArrowRight aria-hidden="true" className="h-4 w-4 text-fg-subtle" />}
          </div>
        )}
      </div>
      {certPicker}
      {certNote}
      {firstSend && (
        <p className="flex items-center gap-1.5 text-xs text-fg-subtle">
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          {t.provisionalNote}
        </p>
      )}
    </div>
  );
}
