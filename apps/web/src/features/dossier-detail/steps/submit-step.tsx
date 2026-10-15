"use client";
// Bước 6 – Khai báo Hải quan: chọn chứng thư số → truyền IDA/IDC/HYS/IEX qua Customs Hub → kết quả + nhật ký thông điệp.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Grid, Select, Spinner, Stack,
  StatusBadge, toast, toastPromise,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, Circle, Clock3, KeyRound, Landmark, RotateCcw, Send, XCircle } from "lucide-react";
import { useState } from "react";
import { dossierKeys } from "@/api/dossiers";
import { customsKeys, getSubmission, listCertificates, resendOperation, submitDeclaration, type PipelineRow, type PipelineStatus, type SubmissionView } from "@/api/customs";
import { declarationKeys } from "@/api/declaration";
import { formatDate, formatDateTime, formatRelative, formatTime, formatVnd } from "@/lib/format";
import type { CustomsChannel } from "@/mocks/types";
import { errorMessage, KeyValue, StepError, StepLoading } from "./declaration-parts";
import type { StepProps } from "./types";

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

const CHANNEL_STATUS = { GREEN: "GREEN_CHANNEL", YELLOW: "YELLOW_CHANNEL", RED: "RED_CHANNEL" } as const satisfies Record<CustomsChannel, string>;

const PIPE: Record<PipelineStatus, { text: string; tone: "neutral" | "info" | "success" | "danger" }> = {
  NOT_SENT: { text: "Chưa gửi", tone: "neutral" },
  WAITING: { text: "Chờ đến lượt", tone: "neutral" },
  SENDING: { text: "Đang xử lý", tone: "info" },
  OK: { text: "Thành công", tone: "success" },
  ERROR: { text: "Lỗi", tone: "danger" },
};

function PipeIcon({ status }: { status: PipelineStatus }) {
  if (status === "OK") return <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />;
  if (status === "ERROR") return <XCircle aria-hidden="true" className="h-5 w-5 text-danger" />;
  if (status === "SENDING") return <Spinner className="h-5 w-5 text-primary" label={null} />;
  if (status === "WAITING") return <Clock3 aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
  return <Circle aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
}

function PipelineList({ rows, canResend, onResend, resending }: { rows: PipelineRow[]; canResend: boolean; onResend: (r: PipelineRow) => void; resending: string | null }) {
  return (
    <ol className="flex flex-col divide-y divide-border rounded-md border border-border" aria-label="Nghiệp vụ truyền nhận">
      {rows.map((r) => (
        <li key={r.op} className="flex flex-wrap items-center gap-3 px-3 py-3">
          <PipeIcon status={r.status} />
          <Badge tone="neutral" variant="outline" className="font-mono">
            {r.op}
          </Badge>
          <div className="min-w-48 flex-1">
            <p className="text-sm font-medium text-fg">{r.label}</p>
            <p className="text-sm text-fg-muted">{r.summary ?? (r.status === "NOT_SENT" ? "Chưa gửi" : r.status === "WAITING" ? "Gửi sau khi bước trước hoàn tất" : "Chờ phản hồi từ Hải quan")}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {r.at && <span className="hidden text-xs text-fg-subtle cq-sm:inline">{formatDateTime(r.at)}</span>}
            <Badge tone={PIPE[r.status].tone}>{PIPE[r.status].text}</Badge>
            {canResend && (r.status === "OK" || r.status === "ERROR") && (r.op === "HYS" || r.op === "IEX" || r.status === "ERROR") && (
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
                loading={resending === r.op}
                onClick={() => onResend(r)}
                aria-label={`${r.op === "IEX" ? "Tra cứu lại" : "Gửi lại"} ${r.op}`}
              >
                {r.op === "IEX" ? "Tra cứu lại" : "Gửi lại"}
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

const CLEARANCE = {
  WAITING: { text: "Chờ kết quả", tone: "neutral" },
  INSPECTING: { text: "Đang kiểm tra", tone: "warning" },
  CLEARED: { text: "Đã thông quan", tone: "success" },
  REJECTED: { text: "Hải quan từ chối", tone: "danger" },
} as const;

function ResultCard({ result, started }: { result: SubmissionView["result"]; started: boolean }) {
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
        {!started || !result ? (
          <EmptyState
            className="px-2 py-8"
            icon={started ? <Clock3 /> : <Landmark />}
            title={started ? "Đang chờ phản hồi đầu tiên" : "Chưa truyền"}
            description="Số tờ khai, phân luồng và kết quả thông quan sẽ hiện ở đây."
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
                <p className="mt-1 text-sm text-fg-subtle">Đang chờ</p>
              )}
            </div>
            <KeyValue
              label="Trạng thái"
              value={<Badge tone={CLEARANCE[result.clearanceStatus ?? "WAITING"].tone}>{CLEARANCE[result.clearanceStatus ?? "WAITING"].text}</Badge>}
            />
            <KeyValue label="Thuế Hải quan tính" value={result.customsTaxVnd ? formatVnd(result.customsTaxVnd) : <span className="text-fg-subtle">Đang chờ</span>} />
            {result.updatedAt && <KeyValue label="Cập nhật lúc" value={formatDateTime(result.updatedAt)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SubmitStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const [certId, setCertId] = useState<string>("");
  const [resending, setResending] = useState<string | null>(null);

  const subQ = useQuery({
    queryKey: customsKeys.submission(dossier.id),
    queryFn: () => getSubmission(dossier.id),
    refetchInterval: (q) => (q.state.data?.inProgress ? 1000 : false),
  });
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
        loading: { title: "Đang ký số và gửi tờ khai…" },
        success: { title: "Đã ký số và gửi tờ khai", description: "Customs Hub đang truyền tới VNACCS…" },
        error: (e) => ({ title: errorMessage(e) }),
      }),
    onSuccess: invalidate,
  });
  const resend = useMutation({
    mutationFn: (r: PipelineRow) => {
      setResending(r.op);
      return resendOperation(dossier.id, r.op);
    },
    onSuccess: (_n, r) => {
      toast({
        tone: "info",
        title: r.op === "IEX" ? "Đang tra cứu lại trạng thái" : `Đang gửi lại ${r.op}`,
        description: "Đã tra IEX trước để không gửi trùng thông điệp.",
      });
      invalidate();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
    onSettled: () => setResending(null),
  });

  if (subQ.isLoading) return <StepLoading />;
  if (subQ.isError) return <StepError error={subQ.error} onRetry={() => void subQ.refetch()} />;
  const s = subQ.data!;
  const notApproved = s.declarationStatus === "NOT_CREATED" || s.declarationStatus === "DRAFT";
  const blocked = notApproved || s.hsUnconfirmed > 0;
  const certExpired = selected ? selected.validTo < new Date().toISOString().slice(0, 10) : false;

  return (
    <Stack gap="lg">
      {notApproved && (
        <Alert
          tone="danger"
          title="Chưa thể truyền tờ khai"
          action={
            <Button size="sm" variant="secondary" onClick={() => goTo(s.declarationStatus === "NOT_CREATED" ? "agent" : "review")}>
              {s.declarationStatus === "NOT_CREATED" ? "Sang AI Agent" : "Mở Review tờ khai"}
            </Button>
          }
        >
          {s.declarationStatus === "NOT_CREATED" ? "Hồ sơ chưa có tờ khai." : "Tờ khai chưa được Người duyệt phê duyệt."} Hệ thống chặn truyền khi còn lỗi BLOCKER, mã HS chưa xác nhận hoặc chưa phê duyệt.
        </Alert>
      )}
      {!notApproved && s.hsUnconfirmed > 0 && (
        <Alert tone="danger" title={`Còn ${s.hsUnconfirmed} mã HS chưa xác nhận`}>
          Xác nhận mã HS ở bước AI Agent trước khi truyền.
        </Alert>
      )}

      <Grid cols={{ base: 1, lg: 3 }} gap="lg">
        <Card className="cq-lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send aria-hidden="true" className="h-5 w-5 text-primary" />
              Truyền tờ khai qua Customs Hub
            </CardTitle>
            <CardDescription>
              {dossier.direction === "NK" ? "IDA → IDC → HYS → IEX" : "EDA → EDC → HYS → IEX"} · ký bằng chứng thư số của doanh nghiệp
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              {!s.started && (
                <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-muted p-4 cq-md:flex-row cq-md:items-end">
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
                    disabled={blocked || !selectedId || certExpired}
                    loading={submit.isPending}
                    onClick={() => submit.mutate()}
                  >
                    Ký số & truyền tờ khai
                  </Button>
                </div>
              )}
              {!s.started && selected && (
                <p className="-mt-2 text-xs text-fg-subtle">
                  Số serial {selected.serial.slice(0, 14)}… · hết hạn {formatDate(selected.validTo)} · Customs Hub ký thay bằng chứng thư đã đăng ký
                </p>
              )}
              {certExpired && <Alert tone="warning">Chứng thư số đã hết hạn – chọn chứng thư khác.</Alert>}
              {s.inProgress && (
                <Alert tone="info" title="Đang truyền">
                  Đang trao đổi thông điệp với Hải quan. Có thể rời màn hình – hệ thống thông báo khi có kết quả.
                </Alert>
              )}
              <PipelineList rows={s.pipeline} canResend={s.started && !s.inProgress} onResend={(r) => resend.mutate(r)} resending={resending} />
            </Stack>
          </CardContent>
        </Card>

        <ResultCard result={s.result} started={s.started} />
      </Grid>

      <Card>
        <CardHeader>
          <CardTitle>Nhật ký thông điệp</CardTitle>
          <CardDescription>Mỗi lần gửi/nhận một dòng – lưu làm hồ sơ pháp lý (đã che thông tin nhạy cảm).</CardDescription>
        </CardHeader>
        <CardContent>
          {s.messages.length === 0 ? (
            <EmptyState title="Chưa có thông điệp" description="Thông điệp gửi/nhận với Hải quan sẽ hiện ở đây sau khi truyền." />
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border" aria-live="polite">
              {s.messages.map((m) => (
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
                      <span className="min-w-48 flex-1 text-sm text-fg">{m.summary}</span>
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
    </Stack>
  );
}
