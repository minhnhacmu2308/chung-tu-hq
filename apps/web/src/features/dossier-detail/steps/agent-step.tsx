"use client";
// Bước 4 – AI Agent xử lý: chọn việc → điều phối (tiến trình realtime) → xác nhận mã HS → sang Review.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Combobox, createDataTableColumnHelper,
  DataTable, Dialog, DialogContent, DialogFooter, Field, Grid, Input, Progress, RadioGroup, SegmentedControl, Spinner, Stack, StatusBadge, toast, IconTile, fill, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, CheckCircle2, Circle, CircleSlash, Cpu, FileStack, Play, RotateCcw, Search, Workflow, XCircle } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { dossierKeys } from "@/api/dossiers";
import { listProducts, productKeys } from "@/api/products";
import {
  confirmHs, declarationKeys, getAgentRun, listHsCatalog, listLineItems, moveToReview, startAgentRun, unconfirmHs,
  type AgentMode, type AgentRunView,
} from "@/api/declaration";
import { formatDateTime, formatMoney, formatNumber, formatTime } from "@/lib/format";
import type { AgentTaskId, AgentTaskStatus, LineItem } from "@/mocks/types";
import { errorMessage, StepError, StepLoading, StickyActionBar } from "./declaration-parts";
import { matchCatalog, type CatalogMatch } from "./hs/catalog-match";
import { DeclaredBeforeHint, HsSuggestionCell } from "./hs/hs-cell";
import { HsAnswerDialog, ReclassifyDialog } from "./hs/hs-dialogs";
import { formatRates, formatTax, hsBusy, normalizeHsInput } from "./hs/hs-format";
import type { StepProps } from "./types";
import { AGENT_MESSAGES } from "./agent-step.messages";

type Tm = Record<keyof (typeof AGENT_MESSAGES)["vi"], string>;
type TaskMeta = { title: string; who: string; whoTone: "primary" | "neutral" | "info"; icon: ReactNode; description: string };

const taskMeta = (t: Tm): Record<AgentTaskId, TaskMeta> => ({
  HS_LOOKUP: { title: t.taskHsTitle, who: "hscodepro", whoTone: "primary", icon: <Search className="h-4 w-4" />, description: t.taskHsDesc },
  MAPPING: { title: t.taskMapTitle, who: t.taskMapWho, whoTone: "neutral", icon: <Workflow className="h-4 w-4" />, description: t.taskMapDesc },
  BUILD_DECLARATION: { title: t.taskBuildTitle, who: t.whoCode, whoTone: "neutral", icon: <Cpu className="h-4 w-4" />, description: t.taskBuildDesc },
  DIGITIZE: { title: t.taskDigitizeTitle, who: t.whoCode, whoTone: "neutral", icon: <FileStack className="h-4 w-4" />, description: t.taskDigitizeDesc },
});
const TASK_IDS: AgentTaskId[] = ["HS_LOOKUP", "MAPPING", "BUILD_DECLARATION", "DIGITIZE"];

const modeOptions = (t: Tm): { value: AgentMode; label: string }[] => [
  { value: "DECLARATION", label: t.modeDeclaration },
  { value: "DIGITIZE", label: t.modeDigitize },
  { value: "BOTH", label: t.modeBoth },
];
const modeHint = (t: Tm): Record<AgentMode, string> => ({ DECLARATION: t.hintDeclaration, DIGITIZE: t.hintDigitize, BOTH: t.hintBoth });

function TaskIcon({ status }: { status: AgentTaskStatus }) {
  if (status === "DONE") return <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-success" />;
  if (status === "RUNNING") return <Spinner className="h-5 w-5 text-primary" />;
  if (status === "ERROR") return <XCircle aria-hidden="true" className="h-5 w-5 text-danger" />;
  if (status === "SKIPPED") return <CircleSlash aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
  return <Circle aria-hidden="true" className="h-5 w-5 text-fg-subtle" />;
}

const statusText = (t: Tm): Record<AgentTaskStatus, string> => ({ PENDING: t.statusPending, RUNNING: t.statusRunning, DONE: t.statusDone, ERROR: t.statusError, SKIPPED: t.statusSkipped });

/* ---------- Hộp thoại chọn việc ---------- */

function ModeDialog({ open, onOpenChange, onStart, pending }: { open: boolean; onOpenChange: (o: boolean) => void; onStart: (m: AgentMode) => void; pending: boolean }) {
  const t = useMessages(AGENT_MESSAGES);
  const meta = taskMeta(t);
  const [mode, setMode] = useState<AgentMode>("BOTH");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.dialogTitle} icon={<Bot className="h-4 w-4" />} description={t.dialogDesc} size="md">
        <Stack gap="md">
          <SegmentedControl label={t.modeLabel} hideLabel value={mode} onChange={setMode} options={modeOptions(t)} className="w-full" />
          <p className="text-sm text-fg-muted">{modeHint(t)[mode]}</p>
          <ul className="flex flex-col gap-2">
            {TASK_IDS.map((id) => {
              const on = mode === "BOTH" || (mode === "DIGITIZE" ? id === "DIGITIZE" : id !== "DIGITIZE");
              const m = meta[id];
              return (
                <li key={id} className={on ? "flex items-start gap-3 rounded-md border border-border p-3" : "flex items-start gap-3 rounded-md border border-border p-3 opacity-50"}>
                  <IconTile icon={m.icon} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-fg">
                      {m.title} {!on && <span className="font-normal text-fg-subtle">{t.notRun}</span>}
                    </p>
                    <p className="text-sm text-fg-muted">{m.description}</p>
                  </div>
                  <Badge tone={m.whoTone} className="shrink-0">{m.who}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-fg-subtle">{t.aiNote}</p>
        </Stack>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t.cancel}
          </Button>
          <Button leftIcon={<Play className="h-4 w-4" />} loading={pending} onClick={() => onStart(mode)}>
            {t.start}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Điều phối agent ---------- */

function Orchestration({ view, onRerun }: { view: AgentRunView; onRerun: () => void }) {
  const t = useMessages(AGENT_MESSAGES);
  const meta = taskMeta(t);
  const status = statusText(t);
  const running = !view.finished;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bot aria-hidden="true" className="h-5 w-5 text-primary" />
            {t.orchTitle}
          </CardTitle>
          <CardDescription>
            {running
              ? fill(t.runningDesc, { task: view.current ? fill(t.runningTask, { title: meta[view.current].title.toLowerCase() }) : "" })
              : fill(t.doneDesc, { at: formatDateTime(view.run.startedAt) })}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {running ? <Badge tone="info">{t.badgeRunning}</Badge> : <Badge tone="success">{t.badgeDone}</Badge>}
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} disabled={running} onClick={onRerun}>
            {t.rerun}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Grid cols={{ base: 1, lg: 2 }} gap="lg">
          <ol className="flex flex-col gap-3" aria-label={t.tasksAria}>
            {view.run.tasks.map((task) => {
              const m = meta[task.id];
              return (
                <li key={task.id} className="rounded-md border border-border p-3" aria-busy={task.status === "RUNNING"}>
                  <div className="flex items-start gap-3">
                    <TaskIcon status={task.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-fg">{m.title}</p>
                        <Badge tone={m.whoTone}>{m.who}</Badge>
                      </div>
                      <p className="mt-0.5 text-sm text-fg-muted">
                        <span className="sr-only">{status[task.status]}: </span>
                        {task.message}
                      </p>
                    </div>
                  </div>
                  {task.status !== "SKIPPED" && (
                    <Progress
                      className="mt-3"
                      size="sm"
                      value={task.progress}
                      tone={task.status === "DONE" ? "success" : "primary"}
                      aria-label={`${m.title}: ${task.progress}%`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
          <section aria-label={t.logAria} className="flex min-h-48 flex-col rounded-md border border-border bg-surface-muted">
            <p className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wide text-fg-subtle">{t.logTitle}</p>
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

/** Chọn / xác nhận mã HS cho một dòng – dùng ở bước AI Agent và panel dòng hàng của tờ khai đầy đủ. */
export function ChangeHsDialog({ item, onClose, dossierId }: { item: LineItem | null; onClose: () => void; dossierId: string }) {
  const t = useMessages(AGENT_MESSAGES);
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(t.changeHsTitle, { line: item?.lineNo ?? "" })} icon={<Search className="h-4 w-4" />} description={item?.description} size="md">
        {item && <ChangeHsForm key={item.id} item={item} onDone={onClose} dossierId={dossierId} />}
      </DialogContent>
    </Dialog>
  );
}

function ChangeHsForm({ item, onDone, dossierId }: { item: LineItem; onDone: () => void; dossierId: string }) {
  const t = useMessages(AGENT_MESSAGES);
  const qc = useQueryClient();
  const catalog = useQuery({ queryKey: declarationKeys.hsCatalog, queryFn: listHsCatalog, staleTime: Infinity });
  const products = useQuery({ queryKey: productKeys.all, queryFn: listProducts, staleTime: 60_000 });
  const declared = useMemo(() => matchCatalog(item.description, products.data ?? []), [item.description, products.data]);
  const productOptions = useMemo(
    () => (products.data ?? []).flatMap((p) => {
      const c = normalizeHsInput(p.hsCode);
      const meta = [p.code, p.origin].filter(Boolean).join(" · ");
      return c ? [{ value: p.id, label: fill(t.productOption, { code: c, name: p.name }), ...(meta ? { description: meta } : {}) }] : [];
    }),
    [products.data, t.productOption],
  );
  const candidates = item.hs?.candidates ?? [];
  const [picked, setPicked] = useState<string | null>(item.hsConfirmed ?? item.hsSuggested ?? candidates[0]?.code ?? null);
  const [manual, setManual] = useState("");
  const manualCode = normalizeHsInput(manual);
  const code = manual.trim() ? manualCode : picked;
  const cand = candidates.find((c) => c.code === code);
  const entry = catalog.data?.find((h) => h.code === code);
  const save = useMutation({
    mutationFn: () => confirmHs(item.id, code!),
    onSuccess: () => {
      toast({ tone: "success", title: fill(t.toastConfirmed, { code: code ?? "", line: item.lineNo }) });
      void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      onDone();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  const catalogOptions = useMemo(
    () => (catalog.data ?? []).filter((h) => !candidates.some((c) => c.code === h.code)).map((h) => ({ value: h.code, label: h.code, description: h.description })),
    [catalog.data, candidates],
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code) save.mutate();
      }}
    >
      <Stack gap="md">
        {candidates.length > 0 && (
          <RadioGroup
            label={t.suggestLabel}
            description={t.suggestDesc}
            value={manual.trim() ? null : picked}
            onChange={(v) => (setPicked(v), setManual(""))}
            options={candidates.map((c, i) => ({
              value: c.code,
              label: `${c.code} · ${Math.round(c.confidence * 100)}% · ${formatTax(c)}${i === 0 ? t.mainSuggestion : ""}`,
              description: c.whyNot ? fill(t.whyNot, { desc: c.description, why: c.whyNot }) : c.description,
            }))}
          />
        )}
        {declared.length > 0 && (
          <RadioGroup
            label={t.productsLabel}
            description={t.productsDesc}
            value={manual.trim() ? null : (declared.find((d) => d.code === picked)?.code ?? null)}
            onChange={(v) => (setPicked(v), setManual(""))}
            options={declared.map((d) => ({
              value: d.code,
              label: fill(t.productOption, { code: d.code, name: d.product.name }),
              description: fill(d.exact ? t.productMeta : t.productMetaSimilar, { n: d.product.timesDeclared }),
            }))}
          />
        )}
        {productOptions.length > 0 && (
          <Field label={t.productsSearchLabel} hint={t.productsSearchHint}>
            <Combobox
              options={productOptions}
              value={null}
              onChange={(id) => {
                const c = normalizeHsInput(products.data?.find((p) => p.id === id)?.hsCode ?? "");
                if (c) (setPicked(c), setManual(""));
              }}
              placeholder={t.productsSearchPlaceholder}
            />
          </Field>
        )}
        {catalogOptions.length > 0 && (
          <Field label={t.catalogLabel} hint={t.catalogHint}>
            <Combobox options={catalogOptions} value={catalogOptions.some((o) => o.value === picked) ? picked : null} onChange={(v) => (setPicked(v), setManual(""))} placeholder={t.catalogPlaceholder} />
          </Field>
        )}
        <Field label={t.manualLabel} hint={t.manualHint} {...(manual.trim() && !manualCode ? { error: t.manualError } : {})}>
          <Input className="cq-sm:max-w-48 font-mono" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="8483.40.90" />
        </Field>
        {(cand || entry) && (
          <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
            <p className="font-medium text-fg">{cand?.description ?? entry?.description}</p>
            <p className="mt-1 text-fg-muted">{cand ? fill(t.taxCandidate, { tax: formatTax(cand) }) : entry ? fill(t.taxEntry, { mfn: entry.mfn, vat: entry.vat }) : null}</p>
            {entry?.policy && <p className="mt-1 text-warning-subtle-fg">{entry.policy}</p>}
          </div>
        )}
        {item.hs?.reasoning && (
          <div className="text-sm">
            <p className="font-medium text-fg">{fill(t.reasonTitle, { code: item.hsSuggested ?? "" })}</p>
            <p className="mt-1 text-fg-muted">{item.hs.reasoning}</p>
            {item.hs.legalBasis.length > 0 && <p className="mt-1 text-xs text-fg-subtle">{fill(t.legalBasis, { list: item.hs.legalBasis.join("; ") })}</p>}
          </div>
        )}
        {item.hsSuggested && code && code !== item.hsSuggested && (
          <Alert tone="info">{fill(t.differs, { code: item.hsSuggested })}</Alert>
        )}
      </Stack>
      <DialogFooter>
        <Button variant="ghost" type="button" onClick={onDone}>
          {t.cancel}
        </Button>
        <Button type="submit" disabled={!code} loading={save.isPending}>
          {t.confirmThis}
        </Button>
      </DialogFooter>
    </form>
  );
}

const col = createDataTableColumnHelper<LineItem>();

function HsTable({ items, dossierId, currency }: { items: LineItem[]; dossierId: string; currency: string }) {
  const t = useMessages(AGENT_MESSAGES);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LineItem | null>(null);
  const [answering, setAnswering] = useState<LineItem | null>(null);
  const [reclassifying, setReclassifying] = useState<LineItem | null>(null);
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
    void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
  };
  const products = useQuery({ queryKey: productKeys.all, queryFn: listProducts, staleTime: 60_000 });
  /** Mặt hàng cùng tên (khớp đúng) đã khai trong danh mục, theo dòng. */
  const declared = useMemo(() => {
    const m = new Map<string, CatalogMatch>();
    if (products.data?.length) for (const it of items) {
      const hit = matchCatalog(it.description, products.data, { limit: 1 })[0];
      if (hit?.exact) m.set(it.id, hit);
    }
    return m;
  }, [items, products.data]);
  const confirm = useMutation({
    mutationFn: ({ it, code }: { it: LineItem; code: string }) => confirmHs(it.id, code),
    onSuccess: (it) => {
      toast({ tone: "success", title: fill(t.toastConfirmed, { code: it.hsConfirmed ?? "", line: it.lineNo }) });
      invalidate();
    },
    onError: (e) => toast({ tone: "danger", title: errorMessage(e) }),
  });
  const undo = useMutation({ mutationFn: (it: LineItem) => unconfirmHs(it.id), onSuccess: invalidate, onError: (e) => toast({ tone: "danger", title: errorMessage(e) }) });

  const columns = col.columns([
    col.accessor("lineNo", { header: "#", size: 48, meta: { align: "center" } }),
    col.accessor("description", {
      header: t.colDescription,
      size: 260,
      meta: { wrap: true },
      cell: (c) => (
        <div>
          <p className="text-fg">{c.getValue()}</p>
          <p className="text-xs text-fg-subtle">
            {fill(t.qtyOrigin, { qty: formatNumber(c.row.original.quantity), unit: c.row.original.unit, origin: c.row.original.origin })}
          </p>
        </div>
      ),
    }),
    col.accessor("amount", { header: fill(t.colAmount, { currency }), meta: { align: "end" }, cell: (c) => formatMoney(c.getValue()) }),
    col.accessor("invoiceHsCode", {
      header: t.colInvoiceHs,
      cell: (c) => {
        const v = c.getValue();
        return v ? (
          <span className="font-mono text-xs text-fg-muted" title={fill(t.invoiceHsTitle, { code: v })}>
            {sixDigits(v)}
          </span>
        ) : (
          <span className="text-fg-subtle">—</span>
        );
      },
    }),
    col.accessor("hsSuggested", {
      header: t.colSuggest,
      size: 220,
      meta: { wrap: true },
      cell: (c) => {
        const it = c.row.original;
        const hit = declared.get(it.id);
        return (
          <>
            <HsSuggestionCell item={it} onAnswer={setAnswering} onReclassify={setReclassifying} />
            {hit && hit.code !== it.hsConfirmed && (
              <DeclaredBeforeHint item={it} match={hit} busy={confirm.isPending && confirm.variables?.it.id === it.id && confirm.variables.code === hit.code} onUse={(row, code) => confirm.mutate({ it: row, code })} />
            )}
          </>
        );
      },
    }),
    col.accessor("importDutyRate", {
      header: t.colTax,
      cell: (c) => {
        const it = c.row.original;
        return it.hsConfirmed ? (
          <div>
            <p className="tabular-nums text-fg">{formatRates(it.importDutyRate, it.vatRate)}</p>
            {it.policyNote && <p className="max-w-56 whitespace-normal text-xs text-fg-muted">{it.policyNote}</p>}
          </div>
        ) : it.hs?.candidates[0] ? (
          <p className="tabular-nums text-fg-muted" title={t.taxPreviewTitle}>
            {formatTax(it.hs.candidates[0])}
          </p>
        ) : (
          <span className="text-xs text-fg-subtle">{t.afterConfirm}</span>
        );
      },
    }),
    col.accessor("hsConfirmed", {
      header: t.colConfirm,
      size: 260,
      cell: (c) => {
        const it = c.row.original;
        if (it.hsConfirmed) {
          return (
            <div className="flex items-center gap-2 whitespace-nowrap">
              <StatusBadge status="USER_CONFIRMED" label={it.hsConfirmed} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(it)} aria-label={fill(t.changeAria, { line: it.lineNo })}>
                {t.change}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => undo.mutate(it)} aria-label={fill(t.unconfirmAria, { line: it.lineNo })}>
                {t.unconfirm}
              </Button>
            </div>
          );
        }
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <Button
              size="sm"
              disabled={!it.hsSuggested}
              loading={confirm.isPending && confirm.variables?.it.id === it.id && confirm.variables.code === it.hsSuggested}
              onClick={() => confirm.mutate({ it, code: it.hsSuggested! })}
              aria-label={fill(t.confirmAria, { code: it.hsSuggested ?? "", line: it.lineNo })}
            >
              {t.confirm}
            </Button>
            <Button size="sm" variant="secondary" disabled={!!it.hs && hsBusy(it.hs.status)} onClick={() => setEditing(it)}>
              {t.pickOther}
            </Button>
          </div>
        );
      },
    }),
  ]);

  return (
    <>
      <DataTable aria-label={t.tableAria} columns={columns} data={items} getRowId={(r) => r.id} />
      <ChangeHsDialog item={editing} onClose={() => setEditing(null)} dossierId={dossierId} />
      <HsAnswerDialog item={answering} onClose={() => setAnswering(null)} dossierId={dossierId} />
      <ReclassifyDialog item={reclassifying} onClose={() => setReclassifying(null)} dossierId={dossierId} />
    </>
  );
}

/* ---------- Bước 4 ---------- */

export function AgentStep({ dossier, goTo }: StepProps) {
  const t = useMessages(AGENT_MESSAGES);
  const meta = taskMeta(t);
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
    // HSCodePro chạy nền (20–90 giây/dòng): còn dòng đang chờ / đang phân loại / đang gửi trả lời → tự làm mới.
    refetchInterval: (q) => (q.state.data?.some((i) => i.hs && hsBusy(i.hs.status)) ? 3000 : false),
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
              {t.introTitle}
            </CardTitle>
            <CardDescription>{fill(t.introDesc, { n: items.length })}</CardDescription>
          </CardHeader>
          <CardContent>
            <Grid cols={{ base: 1, md: 2, xl: 4 }} gap="sm">
              {TASK_IDS.map((id) => (
                <div key={id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2 text-fg">
                    <span className="text-primary">{meta[id].icon}</span>
                    <p className="text-sm font-medium">{meta[id].title}</p>
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">{meta[id].description}</p>
                  <Badge tone={meta[id].whoTone} className="mt-2">{meta[id].who}</Badge>
                </div>
              ))}
            </Grid>
            {items.length === 0 && (
              <Alert tone="warning" className="mt-4" title={t.noItemsTitle}>
                {t.noItemsBody}
              </Alert>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="ghost" onClick={() => goTo("ocr")}>
              {t.backToOcr}
            </Button>
            <Button leftIcon={<Play className="h-4 w-4" />} disabled={items.length === 0} onClick={() => setDialogOpen(true)}>
              {t.runAgent}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Orchestration view={view} onRerun={() => setDialogOpen(true)} />
      )}

      {view && makesDeclaration && (
        <Card>
          <CardHeader>
            <CardTitle>{t.hsTitle}</CardTitle>
            <CardDescription>{t.hsDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            {lookupDone ? (
              <HsTable items={items} dossierId={dossier.id} currency={dossier.currency} />
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-6 text-sm text-fg-muted">
                <Spinner className="h-4 w-4" /> {fill(t.lookingUp, { n: items.length })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {view && !makesDeclaration && view.finished && (
        <Alert
          tone="info"
          title={t.digitizedTitle}
          action={
            <Button size="sm" variant="secondary" onClick={() => setDialogOpen(true)}>
              {t.rerunDeclaration}
            </Button>
          }
        >
          {t.digitizedBody}
        </Alert>
      )}

      {view && makesDeclaration && (
        <StickyActionBar>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-sm font-medium text-fg">
              {fill(t.confirmedCount, { done: confirmed, total: items.length })}
            </p>
            <Progress
              value={items.length ? Math.round((confirmed / items.length) * 100) : 0}
              size="sm"
              tone={confirmed === items.length && items.length > 0 ? "success" : "primary"}
              aria-label={fill(t.confirmedAria, { done: confirmed, total: items.length })}
              className="mt-1 max-w-sm"
            />
          </div>
          <Button variant="ghost" onClick={() => goTo("ocr")}>
            {t.backToOcr}
          </Button>
          <Button disabled={!canProceed} loading={next.isPending} onClick={() => next.mutate()}>
            {t.toReview}
          </Button>
        </StickyActionBar>
      )}

      <ModeDialog open={dialogOpen} onOpenChange={setDialogOpen} onStart={(m) => start.mutate(m)} pending={start.isPending} />
    </Stack>
  );
}
