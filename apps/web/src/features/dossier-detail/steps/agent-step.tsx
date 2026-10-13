"use client";
// Bước 4 – AI Agent xử lý: chọn việc → điều phối (tiến trình realtime) → xác nhận mã HS → sang Review.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Combobox, createDataTableColumnHelper,
  DataTable, Dialog, DialogContent, DialogFooter, Field, Grid, Progress, SegmentedControl, Spinner, Stack, StatusBadge, toast,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Circle, CircleSlash, Cpu, FileStack, Play, RotateCcw, Search, Workflow, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { dossierKeys } from "@/api/dossiers";
import {
  confirmHs, declarationKeys, getAgentRun, listHsCatalog, listLineItems, moveToReview, startAgentRun, unconfirmHs,
  type AgentMode, type AgentRunView,
} from "@/api/declaration";
import { formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";
import type { AgentTaskId, AgentTaskStatus, LineItem } from "@/mocks/types";
import { errorMessage, StepError, StepLoading, StickyActionBar } from "./declaration-parts";
import type { StepProps } from "./types";

const TASK_META: Record<AgentTaskId, { title: string; who: string; whoTone: "primary" | "neutral" | "info"; icon: ReactNode; description: string }> = {
  HS_LOOKUP: {
    title: "Tra cứu mã HS",
    who: "hscodepro",
    whoTone: "primary",
    icon: <Search className="h-4 w-4" />,
    description: "Gợi ý mã HS 8 số, thuế NK (MFN/FTA), VAT, chính sách quản lý cho từng dòng hàng",
  },
  MAPPING: {
    title: "Ánh xạ dữ liệu",
    who: "Code + cấu hình, không dùng AI",
    whoTone: "neutral",
    icon: <Workflow className="h-4 w-4" />,
    description: "Đưa dữ liệu lô hàng vào chỉ tiêu tờ khai theo skill ánh xạ (SK-MAP-IDA / SK-MAP-EDA)",
  },
  BUILD_DECLARATION: {
    title: "Dựng tờ khai",
    who: "Code",
    whoTone: "neutral",
    icon: <Cpu className="h-4 w-4" />,
    description: "Tạo tờ khai nháp, tính trị giá tính thuế và thuế dự kiến",
  },
  DIGITIZE: {
    title: "Số hóa chứng từ",
    who: "Code",
    whoTone: "neutral",
    icon: <FileStack className="h-4 w-4" />,
    description: "Tạo bản dữ liệu số (JSON/XML) của từng chứng từ để lưu và đính kèm HYS",
  },
};

const MODE_OPTIONS: { value: AgentMode; label: string }[] = [
  { value: "DECLARATION", label: "Tạo tờ khai" },
  { value: "DIGITIZE", label: "Số hóa chứng từ" },
  { value: "BOTH", label: "Cả hai" },
];
const MODE_HINT: Record<AgentMode, string> = {
  DECLARATION: "Tra HS → ánh xạ → dựng tờ khai nháp. Dùng khi cần khai báo ngay.",
  DIGITIZE: "Chỉ tạo dữ liệu số hóa chứng từ để lưu trữ / đính kèm HYS. Không tạo tờ khai.",
  BOTH: "Làm cả hai. Khuyến nghị cho lô hàng sẽ truyền Hải quan qua Customs Hub.",
};

function TaskIcon({ status }: { status: AgentTaskStatus }) {
  if (status === "DONE") return <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />;
  if (status === "RUNNING") return <Spinner className="h-5 w-5 text-primary" />;
  if (status === "ERROR") return <XCircle aria-hidden="true" className="h-5 w-5 text-danger" />;
  if (status === "SKIPPED") return <CircleSlash aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
  return <Circle aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
}

const STATUS_TEXT: Record<AgentTaskStatus, string> = { PENDING: "Đang chờ", RUNNING: "Đang chạy", DONE: "Hoàn tất", ERROR: "Lỗi", SKIPPED: "Không chạy" };

/* ---------- Hộp thoại chọn việc ---------- */

function ModeDialog({ open, onOpenChange, onStart, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (m: AgentMode) => void; pending: boolean }) {
  const [mode, setMode] = useState<AgentMode>("BOTH");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Chạy AI Agent" icon={<Bot className="h-4 w-4" />} description="Chọn việc agent cần làm cho hồ sơ này." size="md">
        <Stack gap="md">
          <SegmentedControl label="Việc cần làm" hideLabel value={mode} onChange={setMode} options={MODE_OPTIONS} className="w-full" />
          <p className="text-sm text-fg-muted">{MODE_HINT[mode]}</p>
          <ul className="flex flex-col gap-2">
            {(Object.keys(TASK_META) as AgentTaskId[]).map((id) => {
              const on = mode === "BOTH" || (mode === "DIGITIZE" ? id === "DIGITIZE" : id !== "DIGITIZE");
              const m = TASK_META[id];
              return (
                <li key={id} className={on ? "flex items-start gap-3 rounded-md border border-border p-3" : "flex items-start gap-3 rounded-md border border-border p-3 opacity-50"}>
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-fg" aria-hidden="true">{m.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {m.title} {!on && <span className="font-normal text-fg-subtle">– không chạy</span>}
                    </p>
                    <p className="text-sm text-fg-muted">{m.description}</p>
                  </div>
                  <Badge tone={m.whoTone} className="shrink-0">{m.who}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-fg-subtle">Chỉ bước tra HS gọi dịch vụ AI. Ánh xạ, dựng tờ khai, tính thuế là code thuần có kiểm thử.</p>
        </Stack>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button leftIcon={<Play className="h-4 w-4" />} loading={pending} onClick={() => onStart(mode)}>
            Bắt đầu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Điều phối agent ---------- */

function Orchestration({ view, onRerun }: { view: AgentRunView; onRerun: () => void }) {
  const running = !view.finished;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot aria-hidden="true" className="h-5 w-5 text-primary" />
            Điều phối agent
          </CardTitle>
          <CardDescription>
            {running
              ? `Đang chạy${view.current ? ` – ${TASK_META[view.current].title.toLowerCase()}` : ""}… Bạn có thể rời màn hình, agent vẫn chạy nền.`
              : `Hoàn tất · bắt đầu ${formatDateTime(view.run.startedAt)}`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {running ? <Badge tone="info">Đang chạy</Badge> : <Badge tone="success">Hoàn tất</Badge>}
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} disabled={running} onClick={onRerun}>
            Chạy lại
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Grid cols={{ base: 1, lg: 2 }} gap="lg">
          <ol className="flex flex-col gap-3" aria-label="Các việc của agent">
            {view.run.tasks.map((t) => {
              const m = TASK_META[t.id];
              return (
                <li key={t.id} className="rounded-md border border-border p-3" aria-busy={t.status === "RUNNING"}>
                  <div className="flex items-start gap-3">
                    <TaskIcon status={t.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-fg">{m.title}</p>
                        <Badge tone={m.whoTone}>{m.who}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-muted">
                        <span className="sr-only">{STATUS_TEXT[t.status]}: </span>
                        {t.message}
                      </p>
                    </div>
                  </div>
                  {t.status !== "SKIPPED" && (
                    <Progress
                      className="mt-3"
                      size="sm"
                      value={t.progress}
                      tone={t.status === "DONE" ? "success" : "primary"}
                      aria-label={`${m.title}: ${t.progress}%`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <section aria-label="Nhật ký agent" className="flex min-h-48 flex-col rounded-md border border-border bg-surface-muted">
            <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">Nhật ký</p>
            <ol className="max-h-80 flex-1 overflow-auto px-3 py-2 font-mono text-xs leading-relaxed" aria-live="polite">
              {view.logs.map((l, i) => (
                <li key={i} className={l.tone === "warning" ? "text-warning-subtle-fg" : l.tone === "success" ? "text-success-subtle-fg" : "text-fg-muted"}>
                  <span className="text-fg-subtle">{formatTime(l.at)}</span> {l.text}
                </li>
              ))}
              {running && <li className="text-fg-subtle">…</li>}
            </ol>
          </section>
        </Grid>
      </CardContent>
    </Card>
  );
}

/* ---------- Xác nhận mã HS ---------- */

/** Mã trên invoice nước ngoài chỉ dùng 6 số đầu: "8482.10.1000" → "8482.10". */
const sixDigits = (code: string) => {
  const d = code.replace(/\D/g, "").slice(0, 6);
  return d.length === 6 ? `${d.slice(0, 4)}.${d.slice(4)}` : code;
};

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 85 ? "success" : pct >= 70 ? "primary" : "warning";
  return (
    <div className="flex w-28 items-center gap-2">
      <Progress value={pct} size="sm" tone={tone} aria-label={`Độ tin cậy ${pct}%`} className="flex-1" />
      <span className="w-9 text-right text-xs tabular-nums text-fg-muted">{pct}%</span>
    </div>
  );
}

function ChangeHsDialog({ item, onClose, dossierId }: { item: LineItem | null; onClose: () => void; dossierId: string }) {
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: declarationKeys.hsCatalog, queryFn: listHsCatalog, staleTime: Infinity });
  const [code, setCode] = useState<string | null>(null);
  const current = code ?? item?.hsConfirmed ?? item?.hsSuggested ?? null;
  const entry = catalog.data?.find((h) => h.code === current);
  const save = useMutation({
    mutationFn: () => confirmHs(item!.id, current!),
    onSuccess: () => {
      toast({ tone: "success", title: `Đã xác nhận ${current} cho dòng ${item!.lineNo}` });
      void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      setCode(null);
      onClose();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  const options = useMemo(
    () => (catalog.data ?? []).map((h) => ({ value: h.code, label: h.code, description: h.description })),
    [catalog.data],
  );
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && (setCode(null), onClose())}>
      <DialogContent title={`Chọn mã HS – dòng ${item?.lineNo ?? ""}`} description={item?.description} size="md">
        <Stack gap="md">
          <Field label="Mã HS 8 số (biểu thuế Việt Nam)" hint="Gõ mã hoặc mô tả, không cần dấu: “o bi”, “8483”">
            <Combobox options={options} value={current} onChange={setCode} placeholder="Chọn mã HS" />
          </Field>
          {entry && (
            <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
              <p className="font-medium text-fg">{entry.description}</p>
              <p className="mt-1 text-fg-muted">
                Thuế NK MFN {entry.mfn}%
                {entry.pref?.AK !== undefined && ` · AKFTA ${entry.pref.AK}%`}
                {entry.pref?.EVFTA !== undefined && ` · EVFTA ${entry.pref.EVFTA}%`} · VAT {entry.vat}%
              </p>
              {entry.policy && <p className="mt-1 text-warning-subtle-fg">{entry.policy}</p>}
            </div>
          )}
          {item?.hsSuggested && current !== item.hsSuggested && (
            <Alert tone="info">Khác gợi ý hscodepro ({item.hsSuggested}). Lý do chọn mã sẽ được ghi vào nhật ký sửa.</Alert>
          )}
        </Stack>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={!current} loading={save.isPending} onClick={() => save.mutate()}>
            Xác nhận mã này
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const col = createDataTableColumnHelper<LineItem>();

function HsTable({ items, dossierId, currency }: { items: LineItem[]; dossierId: string; currency: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LineItem | null>(null);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
    void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
  };
  const confirm = useMutation({
    mutationFn: (it: LineItem) => confirmHs(it.id, it.hsSuggested!),
    onSuccess: (it) => {
      toast({ tone: "success", title: `Đã xác nhận ${it.hsConfirmed} cho dòng ${it.lineNo}` });
      invalidate();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  const undo = useMutation({ mutationFn: (it: LineItem) => unconfirmHs(it.id), onSuccess: invalidate, onError: (e) => toast({ tone: "danger", title: errorMessage(e) }) });

  const columns = col.columns([
    col.accessor("lineNo", { header: "#", size: 48, meta: { align: "center" } }),
    col.accessor("description", {
      header: "Mô tả hàng",
      size: 260,
      meta: { wrap: true },
      cell: (c) => (
        <div>
          <p className="text-fg">{c.getValue()}</p>
          <p className="text-xs text-fg-subtle">
            {formatNumber(c.row.original.quantity)} {c.row.original.unit} · xuất xứ {c.row.original.origin}
          </p>
        </div>
      ),
    }),
    col.accessor("amount", { header: `Trị giá (${currency})`, meta: { align: "end" }, cell: (c) => formatMoney(c.getValue()) }),
    col.accessor("invoiceHsCode", {
      header: "HS trên invoice",
      cell: (c) => {
        const v = c.getValue();
        return v ? (
          <span className="font-mono text-xs text-fg-muted" title={`Mã gốc ${v} – chỉ tham khảo 6 số đầu`}>
            {sixDigits(v)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        );
      },
    }),
    col.accessor("hsSuggested", {
      header: "Gợi ý hscodepro",
      cell: (c) => {
        const it = c.row.original;
        if (!it.hsSuggested) return <span className="text-xs text-fg-subtle">Chưa tra</span>;
        return (
          <div className="flex flex-col gap-1">
            <span className="font-mono text-sm text-fg">{it.hsSuggested}</span>
            {it.hsConfidence !== undefined && <ConfidenceMeter value={it.hsConfidence} />}
          </div>
        );
      },
    }),
    col.accessor("importDutyRate", {
      header: "Thuế NK · VAT",
      cell: (c) => {
        const it = c.row.original;
        return it.hsConfirmed ? (
          <div>
            <p className="tabular-nums text-fg">
              {it.importDutyRate}% · {it.vatRate}%
            </p>
            {it.policyNote && <p className="max-w-56 whitespace-normal text-xs text-fg-muted">{it.policyNote}</p>}
          </div>
        ) : (
          <span className="text-xs text-fg-subtle">Sau khi xác nhận</span>
        );
      },
    }),
    col.accessor("hsConfirmed", {
      header: "Xác nhận",
      size: 260,
      cell: (c) => {
        const it = c.row.original;
        if (it.hsConfirmed) {
          return (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <StatusBadge status="USER_CONFIRMED" label={it.hsConfirmed} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(it)} aria-label={`Đổi mã HS dòng ${it.lineNo}`}>
                Đổi
              </Button>
              <Button size="sm" variant="ghost" onClick={() => undo.mutate(it)} aria-label={`Bỏ xác nhận dòng ${it.lineNo}`}>
                Bỏ
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Button
              size="sm"
              disabled={!it.hsSuggested}
              loading={confirm.isPending && confirm.variables?.id === it.id}
              onClick={() => confirm.mutate(it)}
              aria-label={`Xác nhận mã ${it.hsSuggested ?? ""} cho dòng ${it.lineNo}`}
            >
              Xác nhận
            </Button>
            <Button size="sm" variant="secondary" disabled={!it.hsSuggested} onClick={() => setEditing(it)}>
              Chọn mã khác
            </Button>
          </div>
        );
      },
    }),
  ]);

  return (
    <>
      <DataTable aria-label="Xác nhận mã HS từng dòng hàng" columns={columns} data={items} getRowId={(r) => r.id} />
      <ChangeHsDialog item={editing} onClose={() => setEditing(null)} dossierId={dossierId} />
    </>
  );
}

/* ---------- Bước 4 ---------- */

export function AgentStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const runQ = useQuery({
    queryKey: declarationKeys.agentRun(dossier.id),
    queryFn: () => getAgentRun(dossier.id),
    refetchInterval: (q) => (q.state.data && !q.state.data.finished ? 1000 : false),
  });
  const finished = runQ.data?.finished;
  useEffect(() => {
    // Agent xong → trạng thái hồ sơ đổi (Đang xử lý → Cần kiểm tra): làm mới đầu trang + danh sách.
    if (finished) void qc.invalidateQueries({ queryKey: dossierKeys.all });
  }, [finished, qc]);
  const lookupDone = runQ.data?.run.tasks.find((t) => t.id === "HS_LOOKUP")?.status === "DONE";
  const itemsQ = useQuery({
    queryKey: [...declarationKeys.items(dossier.id), lookupDone],
    queryFn: () => listLineItems(dossier.id),
  });

  const start = useMutation({
    mutationFn: (mode: AgentMode) => startAgentRun(dossier.id, mode),
    onSuccess: () => {
      setDialogOpen(false);
      void qc.invalidateQueries({ queryKey: declarationKeys.agentRun(dossier.id) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  const next = useMutation({
    mutationFn: () => moveToReview(dossier.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      goTo("review");
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });

  if (runQ.isLoading || itemsQ.isLoading) return <StepLoading />;
  if (runQ.isError) return <StepError error={runQ.error} onRetry={() => void runQ.refetch()} />;
  if (itemsQ.isError) return <StepError error={itemsQ.error} onRetry={() => void itemsQ.refetch()} />;

  const view = runQ.data;
  const items = itemsQ.data ?? [];
  const confirmed = items.filter((i) => i.hsConfirmed).length;
  const makesDeclaration = view ? view.run.mode !== "DIGITIZE" : false;
  const buildDone = view?.run.tasks.find((t) => t.id === "BUILD_DECLARATION")?.status === "DONE";
  const canProceed = Boolean(view?.finished && makesDeclaration && buildDone && items.length > 0 && confirmed === items.length);

  return (
    <Stack gap="lg">
      {!view ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot aria-hidden="true" className="h-5 w-5 text-primary" />
              AI Agent xử lý
            </CardTitle>
            <CardDescription>
              Dữ liệu đã xác nhận ở bước OCR ({items.length} dòng hàng) sẵn sàng. Agent sẽ tra mã HS, ánh xạ vào chỉ tiêu tờ khai và dựng tờ khai nháp.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Grid cols={{ base: 1, md: 2, xl: 4 }} gap="sm">
              {(Object.keys(TASK_META) as AgentTaskId[]).map((id) => (
                <div key={id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-fg">
                    <span className="text-primary">{TASK_META[id].icon}</span>
                    <p className="text-sm font-medium">{TASK_META[id].title}</p>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{TASK_META[id].description}</p>
                  <Badge tone={TASK_META[id].whoTone} className="mt-2">{TASK_META[id].who}</Badge>
                </div>
              ))}
            </Grid>
            {items.length === 0 && (
              <Alert tone="warning" className="mt-4" title="Chưa có dòng hàng">
                Hoàn tất bước OCR & kiểm tra trước khi chạy agent.
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={() => goTo("ocr")}>
              Quay lại OCR
            </Button>
            <Button leftIcon={<Play className="h-4 w-4" />} disabled={items.length === 0} onClick={() => setDialogOpen(true)}>
              Chạy AI Agent
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Orchestration view={view} onRerun={() => setDialogOpen(true)} />
      )}

      {view && makesDeclaration && (
        <Card>
          <CardHeader>
            <CardTitle>Xác nhận mã HS</CardTitle>
            <CardDescription>
              Mã HS 8 số theo biểu Việt Nam luôn cần người xác nhận. Mã 8–10 số trên invoice nước ngoài chỉ dùng 6 số đầu làm tham khảo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lookupDone ? (
              <HsTable items={items} dossierId={dossier.id} currency={dossier.currency} />
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-6 text-sm text-fg-muted">
                <Spinner className="h-4 w-4" /> hscodepro đang tra {items.length} dòng hàng – kết quả hiện ở đây khi xong.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view && !makesDeclaration && view.finished && (
        <Alert
          tone="info"
          title="Đã số hóa chứng từ – chưa tạo tờ khai"
          action={
            <Button size="sm" variant="secondary" onClick={() => setDialogOpen(true)}>
              Chạy lại với “Tạo tờ khai”
            </Button>
          }
        >
          Lần chạy này chỉ số hóa chứng từ. Để khai báo, chạy agent với lựa chọn có tạo tờ khai.
        </Alert>
      )}

      {view && makesDeclaration && (
        <StickyActionBar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">
              Đã xác nhận {confirmed}/{items.length} mã HS
            </p>
            <Progress
              value={items.length ? Math.round((confirmed / items.length) * 100) : 0}
              size="sm"
              tone={confirmed === items.length && items.length > 0 ? "success" : "primary"}
              aria-label={`Đã xác nhận ${confirmed} trên ${items.length} mã HS`}
              className="mt-1 max-w-sm"
            />
          </div>
          <Button variant="ghost" onClick={() => goTo("ocr")}>
            Quay lại OCR
          </Button>
          <Button disabled={!canProceed} loading={next.isPending} onClick={() => next.mutate()}>
            Sang Review tờ khai
          </Button>
        </StickyActionBar>
      )}

      <ModeDialog open={dialogOpen} onOpenChange={setDialogOpen} onStart={(m) => start.mutate(m)} pending={start.isPending} />
    </Stack>
  );
}
