"use client";
// Bước 6 – Khai báo Hải quan: dòng đời tờ khai theo giai đoạn ① Khai báo ② Sửa đổi bổ sung ③ Sau thông quan ④ Chứng từ & cảng.
// Quy tắc bấm được / việc tiếp theo do backend (hoặc mock) tính bằng @kb/contracts customs-flow – màn chỉ hiển thị.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, EmptyState, Field,
  Grid, IconTile, Select, Spinner, Stack, StatusBadge, toast, toastPromise, type Tone,
} from "@kb/ui";
import { baseOp, CUSTOMS_OPERATIONS, CUSTOMS_PHASES, type CustomsOperation, type CustomsPhase, type CustomsStage } from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, CheckCircle2, Circle, Clock3, FilePen, KeyRound, Landmark, RefreshCw, RotateCcw, Search, Send, Sparkles, XCircle,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { dossierKeys } from "@/api/dossiers";
import {
  customsKeys, getSubmission, listCertificates, performOperation, resendOperation, startPostAmendment, submitDeclaration,
  type PipelineRow, type PipelineStatus, type SubmissionView,
} from "@/api/customs";
import { declarationKeys, getDeclarationView } from "@/api/declaration";
import { formatDate, formatDateTime, formatRelative, formatTime, formatVnd } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import type { CustomsChannel, Declaration } from "@/mocks/types";
import { CustomsInfoPanel, type CustomsEstimate } from "./customs-info-panel";
import { errorMessage, KeyValue, StepError, StepLoading } from "./declaration-parts";
import type { StepProps } from "./types";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

const STAGE_TEXT: Record<CustomsStage, string> = {
  NOT_SENT: "Chưa khai báo – ký số và khai tạm để nhận số tờ khai",
  PRE_DECLARED: "Đã khai tạm – kiểm tra số tờ khai, thuế dự kiến rồi khai chính thức",
  RECALLED: "Tờ khai tạm đã gọi về sửa – sửa, phê duyệt lại rồi khai tạm lại",
  DECLARED: "Đã khai chính thức và phân luồng – chờ thông quan",
  AMEND_RECALLED: "Đang sửa đổi bổ sung – sửa, phê duyệt lại rồi khai tạm sửa đổi",
  AMEND_PRE_DECLARED: "Đã khai tạm sửa đổi – chờ khai chính thức sửa đổi",
  CLEARED: "Đã thông quan",
  POST_EDITING: "Sửa sau thông quan – sửa, phê duyệt lại rồi khai AMA",
  POST_PRE_DECLARED: "Đã khai tạm AMA – chờ khai chính thức (AMC)",
  POST_RECALLED: "Bản khai AMA đã gọi về – sửa, phê duyệt lại rồi khai AMA lại",
  REJECTED: "Hải quan từ chối / hủy tờ khai",
};

const PIPE: Record<PipelineStatus, { text: string; tone: Tone }> = {
  NOT_SENT: { text: "Chưa gửi", tone: "neutral" },
  WAITING: { text: "Chờ đến lượt", tone: "neutral" },
  SENDING: { text: "Đang xử lý", tone: "info" },
  OK: { text: "Thành công", tone: "success" },
  ERROR: { text: "Lỗi", tone: "danger" },
};

/** Nhãn nút gửi theo nghiệp vụ gốc (mã nhập; mã xuất E… dùng chung). */
const SEND_LABEL: Partial<Record<CustomsOperation, string>> = {
  IDA: "Khai tạm", IDB: "Gọi về sửa", IDC: "Khai chính thức", IDD: "Gọi về sửa", IDA01: "Khai tạm sửa đổi", IDE: "Khai chính thức sửa đổi",
  AMA: "Khai tạm AMA", AMB: "Gọi về sửa", AMC: "Khai chính thức AMA", HYS: "Gửi", CONT: "Gửi", PORT_FEE: "Nộp lệ phí",
};
const sendLabel = (r: PipelineRow, stage: CustomsStage) => (baseOp(r.op) === "IDA" && stage === "RECALLED" ? "Khai tạm lại" : SEND_LABEL[baseOp(r.op)] ?? "Gửi");
/** Gửi lại khi lỗi: chỉ các nghiệp vụ có kịch bản tra cứu-trước-khi-gửi-lại (ADR 0005). */
const RESENDABLE: ReadonlySet<CustomsOperation> = new Set(["IDA", "EDA", "IDC", "EDC", "HYS"]);
const isRecall = (op: CustomsOperation) => CUSTOMS_OPERATIONS[op].kind === "recall";

type PhaseState = { text: string; tone: Tone };
function phaseState(rows: PipelineRow[], stage: CustomsStage, phase: CustomsPhase): PhaseState {
  if (rows.some((r) => r.status === "SENDING" || r.enabled)) return { text: "Đang mở", tone: "info" };
  if (rows.some((r) => r.status === "OK")) return { text: "Hoàn tất", tone: "success" };
  const passed = phase === "AMEND" && (stage === "CLEARED" || stage.startsWith("POST_"));
  return passed ? { text: "Không phát sinh", tone: "neutral" } : { text: "Chưa tới", tone: "neutral" };
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
  const loading = h.busyOp === r.op;
  if (r.status === "ERROR" && RESENDABLE.has(r.op) && h.canResend) {
    return (
      <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} loading={loading} onClick={() => h.onResend(r)} aria-label={`Gửi lại ${r.op}`}>
        Gửi lại
      </Button>
    );
  }
  if (!r.enabled) return null;
  const primary = h.nextOp === r.op;
  if (r.action === "EDIT") {
    return (
      <Button size="sm" variant={primary ? "primary" : "secondary"} leftIcon={<FilePen className="h-3.5 w-3.5" />} onClick={() => h.onAction(r)} aria-label={`Sửa tờ khai trước khi gửi ${r.op}`}>
        Sửa tờ khai
      </Button>
    );
  }
  if (r.action === "START_POST_EDIT") {
    return (
      <Button size="sm" variant="secondary" leftIcon={<FilePen className="h-3.5 w-3.5" />} loading={loading} onClick={() => h.onAction(r)}>
        Bắt đầu sửa sau thông quan
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
      aria-label={`${sendLabel(r, h.stage)} (${r.op})`}
    >
      {sendLabel(r, h.stage)}
    </Button>
  );
}

function OperationRow({ r, h }: { r: PipelineRow; h: RowHandlers }) {
  // Khóa vì đang chờ phản hồi: khung "Việc tiếp theo" đã báo – dòng giữ kết quả gần nhất cho đỡ lặp.
  const busyLock = r.status === "SENDING" || Boolean(r.reason?.startsWith("Đang chờ phản hồi"));
  // Ưu tiên: hướng dẫn sửa tờ khai → kết quả gần nhất (đã gửi) → lý do bị khóa (chưa gửi).
  const note = r.enabled && r.action === "EDIT" ? r.reason : r.summary ?? (busyLock ? undefined : r.reason);
  return (
    <li className="flex flex-wrap items-start gap-3 px-3 py-3">
      <PipeIcon status={r.status} />
      <div className="flex min-w-0 flex-1 flex-col gap-1 cq-sm:min-w-56">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral" variant="outline" className="font-mono">
            {r.op}
          </Badge>
          <span className="text-sm font-medium text-fg">{r.label}</span>
          <Badge tone={PIPE[r.status].tone}>{PIPE[r.status].text}</Badge>
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
  const st = phaseState(rows, h.stage, phase.id);
  return (
    <section aria-labelledby={`phase-${phase.id}`} className="rounded-md border border-border">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <h3 id={`phase-${phase.id}`} className="text-sm font-semibold text-fg">
            {index}. {phase.title}
          </h3>
          <p className="text-xs text-fg-muted">{phase.hint}</p>
        </div>
        <Badge tone={st.tone} dot>
          {st.text}
        </Badge>
      </header>
      <ol className="flex flex-col divide-y divide-border" aria-label={phase.title}>
        {rows.map((r) => (
          <OperationRow key={r.op} r={r} h={h} />
        ))}
      </ol>
    </section>
  );
}

const CLEARANCE = {
  WAITING: { text: "Chờ kết quả", tone: "neutral" },
  INSPECTING: { text: "Đang kiểm tra", tone: "warning" },
  CLEARED: { text: "Đã thông quan", tone: "success" },
  REJECTED: { text: "Hải quan từ chối", tone: "danger" },
} as const;

function ResultCard({ s }: { s: SubmissionView }) {
  const result = s.result;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark aria-hidden="true" className="h-5 w-5 text-primary" />
          Kết quả từ Hải quan
        </CardTitle>
        {result?.updatedAt && <CardDescription>Cập nhật {formatRelative(result.updatedAt)}</CardDescription>}
      </CardHeader>
      <CardContent>
        {!result ? (
          <EmptyState
            className="px-2 py-8"
            icon={s.started ? <Clock3 /> : <Landmark />}
            title={s.started ? "Đang chờ phản hồi đầu tiên" : "Chưa khai báo"}
            description="Số tờ khai, thuế dự kiến, phân luồng và kết quả thông quan sẽ hiện ở đây."
          />
        ) : (
          <div className="divide-y divide-border">
            <KeyValue label="Số tờ khai" value={result.declarationNo ? <span className="font-mono">{result.declarationNo}</span> : <span className="text-fg-subtle">Đang chờ</span>} />
            <div className="py-2">
              <p className="text-sm text-fg-muted">Phân luồng</p>
              {result.channel ? (
                <div className="mt-1 flex flex-col gap-1">
                  <StatusBadge status={CHANNEL_STATUS[result.channel]} className="self-start" />
                  <p className="text-sm text-fg-muted">{result.channelNote}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-fg-subtle">Có sau khi khai chính thức</p>
              )}
            </div>
            <KeyValue
              label="Trạng thái"
              value={<Badge tone={CLEARANCE[result.clearanceStatus ?? "WAITING"].tone}>{CLEARANCE[result.clearanceStatus ?? "WAITING"].text}</Badge>}
            />
            <KeyValue label="Thuế dự kiến" value={result.customsTaxVnd ? formatVnd(result.customsTaxVnd) : <span className="text-fg-subtle">Đang chờ</span>} />
            {(s.amendments > 0 || s.postAmendments > 0) && (
              <KeyValue label="Đã sửa đổi" value={`${s.amendments} lần bổ sung · ${s.postAmendments} lần sau thông quan`} />
            )}
            {result.updatedAt && <KeyValue label="Cập nhật lúc" value={formatDateTime(result.updatedAt)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MessageLog({ messages }: { messages: SubmissionView["messages"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nhật ký thông điệp</CardTitle>
        <CardDescription>Mỗi lần gửi/nhận một dòng – lưu làm hồ sơ pháp lý (đã che thông tin nhạy cảm).</CardDescription>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <EmptyState title="Chưa có thông điệp" description="Thông điệp gửi/nhận với Hải quan sẽ hiện ở đây sau khi khai báo." />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-live="polite">
            {messages.map((m) => (
              <li key={m.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    {m.direction === "OUT" ? (
                      <ArrowUpRight aria-label="Gửi đi" className="h-4 w-4 text-fg-subtle" />
                    ) : (
                      <ArrowDownLeft aria-label="Nhận về" className="h-4 w-4 text-primary" />
                    )}
                    <Badge tone="neutral" variant="outline" className="font-mono">
                      {m.operation}
                    </Badge>
                    <span className="min-w-0 flex-1 text-sm text-fg cq-sm:min-w-48">{m.summary}</span>
                    <Badge tone={m.result === "OK" ? "success" : m.result === "ERROR" ? "danger" : "info"}>
                      {m.result === "OK" ? "Thành công" : m.result === "ERROR" ? "Lỗi" : "Đang xử lý"}
                    </Badge>
                    <span className="text-xs tabular-nums text-fg-subtle" title={formatDateTime(m.at)}>{isToday(m.at) ? formatTime(m.at) : formatDateTime(m.at)}</span>
                  </summary>
                  <pre className="mx-3 mb-3 overflow-x-auto rounded-md bg-surface-muted p-3 font-mono text-xs text-fg-muted">{m.payloadPreview}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Nghiệp vụ cần xác nhận: gọi về sửa (IDB/IDD/AMB) hoặc bắt đầu sửa sau thông quan – đều mở lại tờ khai. */
type Confirm = { row: PipelineRow; kind: "recall" | "post" };

function ConfirmReopenDialog({ confirm, onClose, onConfirm, pending, code }: { confirm: Confirm | null; onClose: () => void; onConfirm: (c: Confirm) => void; pending: boolean; code: string }) {
  const post = confirm?.kind === "post";
  return (
    <Dialog open={confirm !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={post ? "Bắt đầu sửa đổi sau thông quan" : `${confirm?.row.label ?? ""} (${confirm?.row.op ?? ""})`}
        icon={<RotateCcw className="h-4 w-4" />}
        description={code}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (confirm) onConfirm(confirm);
          }}
        >
          <Stack gap="sm">
            <p className="text-sm text-fg-muted">
              {post
                ? "Tờ khai đã thông quan sẽ được mở lại để sửa chỉ tiêu (khai bổ sung trong 60 ngày – TT121 Điều 20)."
                : "Hải quan chấp nhận gọi về thì tờ khai được mở lại để sửa chỉ tiêu."}{" "}
              Tờ khai quay về bản nháp ở bước Review và phê duyệt hiện tại bị hủy – sửa xong, Người duyệt phải phê duyệt lại thì mới gửi
              {post ? " AMA" : " lại"} được.
            </p>
          </Stack>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" loading={pending} leftIcon={<RotateCcw className="h-4 w-4" />}>
              {post ? "Mở sửa sau thông quan" : `Gọi về sửa (${confirm?.row.op ?? ""})`}
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

export function SubmitStep({ dossier, goTo }: StepProps) {
  const declQ = useQuery({ queryKey: declarationKeys.view(dossier.id), queryFn: () => getDeclarationView(dossier.id) });
  const qc = useQueryClient();
  const [certId, setCertId] = useState<string>("");
  const [busyOp, setBusyOp] = useState<CustomsOperation | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    refetchInterval: (q) => (q.state.data?.inProgress ? 1000 : false),
    // Quay lại từ Review (sửa + duyệt lại) → khả năng bấm đã đổi; không dùng bản cache cũ.
    refetchOnMount: "always",
  });
  // Giai đoạn đổi do phản hồi Hải quan (poll) → làm mới đầu trang hồ sơ (trạng thái, số tờ khai, luồng).
  const stage = subQ.data?.stage;
  useEffect(() => {
    if (stage) void qc.invalidateQueries({ queryKey: dossierKeys.all });
  }, [stage, qc]);
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
        loading: { title: "Đang ký số và khai tạm tờ khai…" },
        success: { title: "Đã ký số và gửi khai tạm", description: "Chờ Hải quan cấp số tờ khai và tính thuế dự kiến." },
        error: (e) => ({ title: errorMessage(e) }),
      }),
    onSuccess: invalidate,
    // Lỗi đã hiện trong toast của toastPromise (cùng một toast với "đang ký số…").
    onError: () => undefined,
  });
  const perform = useMutation({
    mutationFn: (op: CustomsOperation) => {
      setBusyOp(op);
      return performOperation(dossier.id, op);
    },
    onSuccess: (r) => {
      setConfirm(null);
      toast({ tone: r.sent ? "info" : "success", title: r.message });
      invalidate();
    },
    onError: toastMutationError("Không thực hiện được nghiệp vụ"),
    onSettled: () => setBusyOp(null),
  });
  const postEdit = useMutation({
    mutationFn: () => {
      setBusyOp("AMA");
      return startPostAmendment(dossier.id);
    },
    onSuccess: () => {
      setConfirm(null);
      toast({ tone: "success", title: "Đã mở tờ khai để sửa sau thông quan", description: "Sửa chỉ tiêu, phê duyệt lại rồi quay lại đây khai AMA." });
      invalidate();
      goTo("review");
    },
    onError: toastMutationError("Không mở được sửa sau thông quan"),
    onSettled: () => setBusyOp(null),
  });
  const resend = useMutation({
    mutationFn: (r: PipelineRow) => {
      setBusyOp(r.op);
      return resendOperation(dossier.id, r.op);
    },
    onSuccess: (res, r) => {
      toast({ tone: "info", title: res.resent ? `Đang gửi lại ${r.op}` : res.message, description: "Đã tra cứu trạng thái trước để không gửi trùng thông điệp." });
      invalidate();
    },
    onError: toastMutationError("Không gửi lại được"),
    onSettled: () => setBusyOp(null),
  });

  if (subQ.isLoading) return <StepLoading />;
  if (subQ.isError) return <StepError error={subQ.error} onRetry={() => void subQ.refetch()} />;
  const s = subQ.data!;
  const firstSend = s.stage === "NOT_SENT";
  const notApproved = s.declarationStatus === "NOT_CREATED" || (firstSend && s.declarationStatus === "DRAFT");
  const blocked = notApproved || s.hsUnconfirmed > 0;
  const certExpired = selected ? selected.validTo < new Date().toISOString().slice(0, 10) : false;
  const sending = s.pipeline.find((r) => r.status === "SENDING");
  const anyBusy = Boolean(sending) || perform.isPending || resend.isPending || postEdit.isPending || submit.isPending;
  const hasNumber = Boolean(s.result?.declarationNo);
  const next = s.nextOp ? s.pipeline.find((r) => r.op === s.nextOp) : undefined;

  const onAction = (r: PipelineRow) => {
    if (r.action === "EDIT") return goTo("review");
    if (r.action === "START_POST_EDIT") return setConfirm({ row: r, kind: "post" });
    if (isRecall(r.op)) return setConfirm({ row: r, kind: "recall" });
    if (firstSend && baseOp(r.op) === "IDA") return submit.mutate();
    perform.mutate(r.op);
  };
  const h: RowHandlers = { stage: s.stage, nextOp: s.nextOp, busyOp, canResend: !anyBusy, onAction, onResend: (r) => resend.mutate(r) };

  return (
    <Stack gap="lg">
      {notApproved && (
        <Alert
          tone="danger"
          title="Chưa thể khai báo tờ khai"
          action={
            <Button size="sm" variant="secondary" onClick={() => goTo(s.declarationStatus === "NOT_CREATED" ? "agent" : "review")}>
              {s.declarationStatus === "NOT_CREATED" ? "Sang AI Agent" : "Mở Review tờ khai"}
            </Button>
          }
        >
          {s.declarationStatus === "NOT_CREATED" ? "Hồ sơ chưa có tờ khai." : "Tờ khai chưa được Người duyệt phê duyệt."} Hệ thống chặn gửi khi còn lỗi BLOCKER, mã HS chưa xác nhận hoặc chưa phê duyệt.
        </Alert>
      )}
      {!notApproved && s.hsUnconfirmed > 0 && (
        <Alert tone="danger" title={`Còn ${s.hsUnconfirmed} mã HS chưa xác nhận`}>
          Xác nhận mã HS ở bước AI Agent trước khi gửi nội dung tờ khai.
        </Alert>
      )}

      {s.rejection && (
        <Alert
          tone="danger"
          title={`Hải quan từ chối ${s.rejection.operation} – ${s.rejection.errors.length} lỗi`}
          action={
            <Button size="sm" variant="secondary" onClick={() => goTo("review")}>
              Xem lỗi trên tờ khai
            </Button>
          }
        >
          Lỗi được gắn vào đúng ô chỉ tiêu ở bước Review tờ khai. Mở lại tờ khai, sửa, phê duyệt lại rồi gửi lại {s.rejection.operation}.
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
                    Tờ khai <span className="font-mono">{s.result!.declarationNo}</span>
                  </>
                ) : (
                  "Khai báo Hải quan"
                )}
                {s.result?.channel && <StatusBadge status={CHANNEL_STATUS[s.result.channel]} />}
              </CardTitle>
              <CardDescription>{STAGE_TEXT[s.stage]}</CardDescription>
            </div>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<Search className="h-4 w-4" />}
              disabled={!hasNumber || anyBusy}
              loading={busyOp === s.queryOp}
              onClick={() => perform.mutate(s.queryOp)}
            >
              Tra cứu trạng thái ({s.queryOp})
            </Button>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <NextStep
                s={s}
                next={next}
                sending={sending}
                firstSend={firstSend}
                h={h}
                certPicker={
                  firstSend && next && baseOp(next.op) === "IDA" ? (
                    <div className="flex flex-col gap-3 cq-md:flex-row cq-md:items-end">
                      <Field label="Chứng thư số dùng để ký" className="flex-1">
                        <Select
                          value={selectedId}
                          onChange={(e) => setCertId(e.currentTarget.value)}
                          disabled={certQ.isLoading || blocked}
                          options={certs.map((c) => ({ value: c.id, label: `${c.subject} – ${c.issuer}, hết hạn ${formatDate(c.validTo).slice(3)}` }))}
                        />
                      </Field>
                      <Button
                        leftIcon={<KeyRound className="h-4 w-4" />}
                        disabled={blocked || !selectedId || certExpired || anyBusy}
                        loading={submit.isPending}
                        onClick={() => submit.mutate()}
                      >
                        Ký số & khai tạm ({next.op})
                      </Button>
                    </div>
                  ) : null
                }
                certNote={
                  firstSend && selected ? (
                    <p className="text-xs text-fg-subtle">
                      Số serial {selected.serial.slice(0, 14)}… · hết hạn {formatDate(selected.validTo)} · Customs Hub ký thay bằng chứng thư đã đăng ký
                    </p>
                  ) : null
                }
              />
              {firstSend && certExpired && <Alert tone="warning">Chứng thư số đã hết hạn – chọn chứng thư khác.</Alert>}

              {CUSTOMS_PHASES.map((p, i) => (
                <PhaseSection key={p.id} index={i + 1} phase={p} rows={s.pipeline.filter((r) => r.phase === p.id)} h={h} />
              ))}
            </Stack>
          </CardContent>
        </Card>

        <ResultCard s={s} />
      </Grid>

      {s.customsInfo && <CustomsInfoPanel kind={dossier.direction === "NK" ? "IDA" : "EDA"} info={s.customsInfo} estimate={estimateOf(declQ.data?.declaration)} />}

      <MessageLog messages={s.messages} />

      <ConfirmReopenDialog
        confirm={confirm}
        code={`${dossier.code} · ${dossier.partner}`}
        pending={perform.isPending || postEdit.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={(c) => (c.kind === "post" ? postEdit.mutate() : perform.mutate(c.row.op))}
      />
    </Stack>
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
  if (sending) {
    return (
      <Alert tone="info" title={`Đang chờ phản hồi ${sending.op} – ${sending.label.toLowerCase()}`}>
        Đang trao đổi thông điệp với Hải quan; các nghiệp vụ khác tạm khóa. Có thể rời màn hình – hệ thống thông báo khi có kết quả.
      </Alert>
    );
  }
  if (!next) {
    const cleared = s.stage === "CLEARED";
    return (
      <Alert tone={cleared ? "success" : "info"} title={cleared ? "Tờ khai đã thông quan" : "Đang chờ Hải quan"}>
        {cleared
          ? "Không còn việc bắt buộc. Khi cần, mở sửa đổi sau thông quan hoặc làm thủ tục chứng từ & cảng bên dưới."
          : s.inProgress
            ? "Hệ thống tự hỏi trạng thái tờ khai định kỳ; kết quả thông quan sẽ hiện ở đây."
            : "Không có việc cần làm ngay – tra cứu trạng thái để cập nhật."}
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary bg-primary-subtle p-4">
      <div className="flex flex-wrap items-start gap-3">
        <IconTile icon={<Sparkles />} tone="primary" size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary-subtle-fg">Việc tiếp theo</p>
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            <Badge tone="primary" variant="outline" className="font-mono">
              {next.op}
            </Badge>
            {next.label}
          </p>
          {next.reason && <p className="mt-1 text-sm text-fg-muted">{next.reason}</p>}
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
          Khai tạm chưa phải khai chính thức: xem số tờ khai và thuế dự kiến trước, rồi mới khai chính thức để nhận phân luồng.
        </p>
      )}
    </div>
  );
}
