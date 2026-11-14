"use client";
// Tab Chờ duyệt (spec §6.3): mục chờ ghép mã → mặt hàng. Mã/tên theo bộ (kèm loại bộ – bộ đối tác có thể trùng tên) → ghép vào, mức
// (StatusBadge), lý do (nhãn cho mọi ITEM_MATCH_REASONS), người đề xuất; lọc "Của tôi"/bộ mã/mức. Người phụ trách bộ (Quản trị: mọi bộ)
// mới có thao tác / chọn được dòng; ô hệ số trên dòng khi ĐVT khác ĐVT gốc chưa quy đổi (bắt buộc trước khi xác nhận); chọn nhiều →
// "Xác nhận n mục" (có mục sẽ tạo mặt hàng mới → hỏi lại; mục lỗi báo riêng theo dòng).
// Mặt hàng gợi ý + ứng viên đến kèm danh sách (một lần đọc theo lô ở backend) – không tải chi tiết từng mặt hàng; chỉ mặt hàng "chọn khác"
// (ngoài gợi ý) mới tải chi tiết để biết đã có quy đổi chưa.
import {
  CatalogFactorSchema, itemUnitKey, type CodeSet, type ItemMatchLevel, type ListQueueQueryInput, type MatchQueueListRow, type QueueTargetSummary,
} from "@kb/contracts";
import {
  Button, Checkbox, ConfirmDialog, createDataTableColumnHelper, DataTable, Field, fill, Input, pickMessages, RowActions, Select, StatusBadge, statusLabel, toast, useMessages,
  useUiLocale,
} from "@kb/ui";
import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { catalogKeys, decideQueueBulk, decideQueueItem, getCatalogItem, listCodeSets, listMatchQueue } from "@/api/catalog";
import { listMembers, memberKeys } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { formatHs } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { errorText } from "@/lib/reason-codes";
import { useCatalogAccess } from "./catalog-access";
import { MATCH_LEVEL } from "./catalog-display";
import { CATALOG_QUEUE_MESSAGES } from "./catalog.messages";
import { setTitle } from "./catalog-xlsx";
import { CodeSetLabel } from "./code-set-label";
import { ChooseItemDialog, queueRowActions, reasonLabel } from "./queue-row-actions";

type Messages = (typeof CATALOG_QUEUE_MESSAGES)["vi"];
type Row = MatchQueueListRow;
const LEVELS: readonly ItemMatchLevel[] = ["SURE", "MAYBE", "NONE"];
const MAX_FAILED_LINES = 5;
const PAGE_SIZES = [20, 50];
const col = createDataTableColumnHelper<Row>();

/** Hệ số người dùng gõ: cho phép dấu phẩy thập phân. */
const normFactor = (s: string) => s.trim().replace(",", ".");
const factorOk = (s: string | undefined) => !!s && CatalogFactorSchema.safeParse(normFactor(s)).success;
/** Nhãn số nhiều (tiếng Anh): khóa `<key>One` khi n = 1. */
const plural = (t: Messages, key: "bulkConfirm" | "bulkDone" | "bulkFailed" | "bulkMore", n: number) => fill(n === 1 ? t[`${key}One`] : t[key], { n });
/** Lỗi theo dòng của lần xác nhận hàng loạt → câu đã dịch (không bao giờ hiện mã thô). */
const failText = (f: { code: string; reason: string | null }, locale: ReturnType<typeof useUiLocale>, fallback: string) =>
  errorText(Object.assign(new Error(""), { code: f.code, ...(f.reason ? { reason: f.reason } : {}) }), locale, fallback);

export function QueueTab() {
  const t = useMessages(CATALOG_QUEUE_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [mine, setMine] = useState(false);
  const [setId, setSetId] = useState("");
  const [level, setLevel] = useState<ItemMatchLevel | "">("");
  const [page, setPage] = useState({ pageIndex: 0, pageSize: 50 });
  /** Mặt hàng chọn khác trên từng dòng (chưa gửi) và hệ số đang gõ. */
  const [chosen, setChosen] = useState<Record<string, QueueTargetSummary>>({});
  const [factors, setFactors] = useState<Record<string, string>>({});
  const [choosing, setChoosing] = useState<Row | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  /** Xác nhận hàng loạt có mục sẽ tạo mặt hàng mới → hỏi lại trước khi chạy. */
  const [bulkCheck, setBulkCheck] = useState<{ rows: Row[]; clear: () => void } | null>(null);

  const codeSets = useQuery({ queryKey: catalogKeys.codeSets, queryFn: listCodeSets });
  const sets = useMemo(() => codeSets.data ?? [], [codeSets.data]);
  const access = useCatalogAccess(sets);
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  const query: ListQueueQueryInput = {
    ...(mine ? { mine: true } : {}), ...(setId ? { codeSetId: setId } : {}), ...(level ? { level } : {}), page: page.pageIndex + 1, pageSize: page.pageSize,
  };
  const queue = useQuery({ queryKey: catalogKeys.queue(query), queryFn: () => listMatchQueue(query), placeholderData: keepPreviousData });
  const rows = useMemo(() => queue.data?.rows ?? [], [queue.data]);

  // Chỉ mặt hàng chọn khác (không phải gợi ý) mới cần tải quy đổi.
  const extraIds = [...new Set(rows.flatMap((r) => (chosen[r.id] && chosen[r.id]!.id !== r.suggested?.id ? [chosen[r.id]!.id] : [])))];
  const extra = useQueries({ queries: extraIds.map((id) => ({ queryKey: catalogKeys.item(id), queryFn: () => getCatalogItem(id) })) });
  const conversionsOf = new Map(extra.flatMap((q, i) => (q.data ? [[extraIds[i]!, q.data.conversions] as const] : [])));

  const targetOf = (r: Row): QueueTargetSummary | null => chosen[r.id] ?? r.suggested;
  /** Cần hệ số? true/false; null = chưa biết (mặt hàng chọn khác đang tải quy đổi). */
  const needsFactor = (r: Row): boolean | null => {
    const tg = targetOf(r);
    if (!tg) return false;
    if (r.suggested && tg.id === r.suggested.id) return r.suggested.needsFactor;
    if (!r.unit || !tg.baseUnit || itemUnitKey(r.unit) === itemUnitKey(tg.baseUnit)) return false;
    const convs = conversionsOf.get(tg.id);
    return convs ? !convs.some((c) => itemUnitKey(c.unit) === itemUnitKey(r.unit!)) : null;
  };
  const forget = (id: string) => {
    setChosen(({ [id]: _, ...rest }) => rest);
    setFactors(({ [id]: _, ...rest }) => rest);
  };
  /** Hệ số trên dòng: người duyệt đang gõ, chưa gõ thì điền sẵn từ cột Quy đổi của file (`factor` của mục). */
  const factorOf = (r: Row) => factors[r.id] ?? r.factor ?? "";
  const confirmInput = (r: Row) => {
    const f = needsFactor(r) && factorOk(factorOf(r)) ? { factor: normFactor(factorOf(r)) } : {};
    const pick = chosen[r.id];
    return pick ? { action: "CHOOSE" as const, itemId: pick.id, ...f } : { action: "CONFIRM" as const, ...f };
  };
  /** Sau khi duyệt: chỉ tải lại hàng chờ (kèm số đếm ở tab), danh sách mặt hàng và chi tiết các mặt hàng vừa nhận mã. */
  const refresh = (itemIds: readonly (string | null | undefined)[] = []) => {
    void qc.invalidateQueries({ queryKey: [...catalogKeys.all, "queue"] });
    void qc.invalidateQueries({ queryKey: [...catalogKeys.all, "items"] });
    for (const id of new Set(itemIds)) if (id) void qc.invalidateQueries({ queryKey: catalogKeys.item(id) });
  };

  const decide = useMutation({
    mutationFn: ({ r, action }: { r: Row; action: "CONFIRM" | "CREATE" | "SKIP" }) => decideQueueItem(r.id, action === "CONFIRM" ? confirmInput(r) : { action }),
    onSuccess: (done, { r, action }) => {
      const code = r.code || r.name;
      const tg = targetOf(r);
      const title =
        action === "SKIP" ? fill(t.skipped, { code })
        : action === "CONFIRM" && tg ? fill(t.decided, { code, itemNo: tg.itemNo })
        : fill(t.created, { code });
      toast({ tone: "success", title });
      forget(done.id);
      refresh([done.suggestedItemId]);
    },
    onError: toastMutationError(t.actionFailed),
  });

  const runBulk = async (picked: Row[], clear: () => void) => {
    setBulkRunning(true);
    const failed: string[] = [];
    const targets: (string | null)[] = [];
    let done = 0;
    const codeOf = (r: Row) => r.code || r.name;
    // Dòng có lựa chọn riêng (chọn khác / hệ số) gửi từng mục; còn lại gửi một lần.
    const single = picked.filter((r) => chosen[r.id] || (needsFactor(r) && factors[r.id] !== undefined && factorOk(factors[r.id])));
    const bulk = picked.filter((r) => !single.includes(r));
    try {
      for (const r of single) {
        try {
          const res = await decideQueueItem(r.id, confirmInput(r));
          targets.push(res.suggestedItemId);
          forget(r.id);
          done += 1;
        } catch (e) {
          failed.push(fill(t.bulkFailedRow, { code: codeOf(r), reason: errorText(e, locale, t.actionFailed) }));
        }
      }
      if (bulk.length) {
        const res = await decideQueueBulk({ ids: bulk.map((r) => r.id), action: "CONFIRM" });
        done += res.decided.length;
        targets.push(...bulk.filter((r) => res.decided.includes(r.id)).map((r) => r.suggested?.id ?? null));
        for (const f of res.failed) {
          const r = bulk.find((x) => x.id === f.id);
          failed.push(fill(t.bulkFailedRow, { code: r ? codeOf(r) : f.id, reason: failText(f, locale, t.actionFailed) }));
        }
      }
    } catch (e) {
      toastMutationError(t.actionFailed)(e);
    } finally {
      setBulkRunning(false);
      clear();
      refresh(targets);
    }
    if (done) toast({ tone: "success", title: plural(t, "bulkDone", done) });
    if (failed.length) {
      const extraCount = failed.length - MAX_FAILED_LINES;
      const shown = failed.slice(0, MAX_FAILED_LINES).join(" · ") + (extraCount > 0 ? ` · ${plural(t, "bulkMore", extraCount)}` : "");
      toast({ tone: "warning", title: plural(t, "bulkFailed", failed.length), description: shown });
    }
  };
  /** Có mục sẽ tạo mặt hàng mới (không gợi ý, chưa chọn khác) → hỏi lại kèm số ghép / tạo mới. */
  const startBulk = (picked: Row[], clear: () => void) => {
    if (picked.some((r) => !targetOf(r))) setBulkCheck({ rows: picked, clear });
    else void runBulk(picked, clear);
  };

  const memberName = useMemo(() => {
    const byId = new Map((members.data ?? []).map((m) => [m.id, m.name]));
    return (id: string) => byId.get(id) ?? t.sourceMember;
  }, [members.data, t.sourceMember]);
  const sourceOf = (r: Row) => {
    if (r.reason === "MIGRATION_DUPLICATE_CODE") return t.sourceMigration;
    if (r.sourceRef?.startsWith("user:")) return memberName(r.sourceRef.slice(5));
    if (r.importId) return t.sourceImport;
    return r.sourceRef ? t.sourceDocument : "";
  };
  // Theo ngôn ngữ (useMessages trả object mới mỗi lần dựng) – cột đổi thì ô bị dựng lại, ô nhập mất focus.
  const columns = useMemo(() => buildColumns(pickMessages(CATALOG_QUEUE_MESSAGES, locale)), [locale]);
  const view: QueueView = {
    sets, targetOf, needsFactor, chosen, factorOf, sourceOf, manages: access.managesSet,
    setFactor: (id, v) => setFactors((f) => ({ ...f, [id]: v })),
  };

  const canDecideAny = access.isAdmin || (access.canContribute && sets.some((s) => access.managesSet(s.id)));
  const filtered = mine || !!setId || !!level;
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage((p) => ({ ...p, pageIndex: 0 }));
  };
  const check = bulkCheck ? { created: bulkCheck.rows.filter((r) => !targetOf(r)).length, total: bulkCheck.rows.length } : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.setFilter} className="w-full cq-sm:w-64">
          <Select
            options={[{ value: "", label: t.setAll }, ...sets.map((s) => ({ value: s.id, label: setTitle(s, locale) }))]}
            value={setId}
            onChange={(e) => resetPage(setSetId)(e.target.value)}
          />
        </Field>
        <Field label={t.levelFilter} className="w-full cq-sm:w-48">
          <Select
            options={[{ value: "", label: t.levelAll }, ...LEVELS.map((l) => ({ value: l, label: statusLabel(MATCH_LEVEL[l], locale) }))]}
            value={level}
            onChange={(e) => resetPage(setLevel)(e.target.value as ItemMatchLevel | "")}
          />
        </Field>
        <div className="pb-2">
          <Checkbox label={t.mine} checked={mine} onChange={(e) => resetPage(setMine)(e.target.checked)} />
        </div>
      </div>

      {queue.isError && <LoadError onRetry={() => void queue.refetch()} title={t.loadError} />}
      {!queue.isError && (
        <QueueViewContext.Provider value={view}>
          <DataTable
            aria-label={t.tableLabel}
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            rowLabel={(r) => r.code || r.name}
            loading={queue.isLoading}
            pagination={{ mode: "controlled", ...page, rowCount: queue.data?.total ?? 0, onChange: setPage, pageSizeOptions: PAGE_SIZES }}
            filtered={filtered}
            onClearFilters={() => {
              setMine(false);
              setSetId("");
              setLevel("");
              setPage((p) => ({ ...p, pageIndex: 0 }));
            }}
            emptyTitle={t.emptyTitle}
            emptyDescription={t.emptyDescription}
            {...(canDecideAny
              ? {
                  selectable: true,
                  isRowSelectable: (r: Row) => access.managesSet(r.codeSetId),
                  selectionActions: (picked: Row[], clear: () => void) => (
                    <Button size="sm" leftIcon={<CheckCheck className="h-4 w-4" />} loading={bulkRunning} onClick={() => startBulk(picked, clear)}>
                      {plural(t, "bulkConfirm", picked.length)}
                    </Button>
                  ),
                }
              : {})}
            rowActions={(r) => {
              if (!access.managesSet(r.codeSetId)) return null;
              const need = needsFactor(r);
              const actions = queueRowActions(
                t,
                { target: targetOf(r), factorBlocked: need === null || (need && !factorOk(factorOf(r))), pending: decide.isPending || bulkRunning },
                {
                  confirm: () => decide.mutate({ r, action: "CONFIRM" }),
                  choose: () => setChoosing(r),
                  create: () => decide.mutate({ r, action: "CREATE" }),
                  skip: () => decide.mutate({ r, action: "SKIP" }),
                },
              );
              return <RowActions rowLabel={r.code || r.name} actions={actions} />;
            }}
          />
        </QueueViewContext.Provider>
      )}
      {choosing && <ChooseItemDialog row={choosing} onPick={(item) => setChosen((c) => ({ ...c, [choosing.id]: item }))} onClose={() => setChoosing(null)} />}
      <ConfirmDialog
        open={bulkCheck !== null}
        onOpenChange={(o) => !o && setBulkCheck(null)}
        tone="warning"
        icon={<CheckCheck className="h-4 w-4" />}
        title={t.bulkCheckTitle}
        confirmLabel={check ? plural(t, "bulkConfirm", check.total) : t.bulkCheckConfirm}
        loading={bulkRunning}
        onConfirm={() => {
          const b = bulkCheck;
          setBulkCheck(null);
          if (b) void runBulk(b.rows, b.clear);
        }}
      >
        {check && fill(t.bulkCheckBody, { matched: check.total - check.created, created: check.created })}
      </ConfirmDialog>
    </div>
  );
}

// ---------- ô của bảng: đọc trạng thái qua context để cột ổn định (ô nhập hệ số không bị dựng lại mỗi lần gõ) ----------
type QueueView = {
  sets: readonly CodeSet[];
  targetOf: (r: Row) => QueueTargetSummary | null;
  needsFactor: (r: Row) => boolean | null;
  chosen: Record<string, QueueTargetSummary>;
  factorOf: (r: Row) => string;
  setFactor: (id: string, value: string) => void;
  sourceOf: (r: Row) => string;
  manages: (codeSetId: string) => boolean;
};
const QueueViewContext = createContext<QueueView | null>(null);
const useQueueView = () => useContext(QueueViewContext)!;

function CodeCell({ r }: { r: Row }) {
  const set = useQueueView().sets.find((s) => s.id === r.codeSetId);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="break-all font-mono text-fg">{r.code}</span>
      {set && <CodeSetLabel name={set.name} kind={set.kind} />}
    </span>
  );
}

function TargetCell({ r }: { r: Row }) {
  const t = useMessages(CATALOG_QUEUE_MESSAGES);
  const v = useQueueView();
  const tg = v.targetOf(r);
  if (!tg) return <span className="text-fg-muted">{t.targetNew}</span>;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="font-mono text-fg">{tg.itemNo}</span>
      <span className="line-clamp-2 text-sm text-fg-muted">{tg.name}</span>
      {v.chosen[r.id] && <span className="text-sm text-fg-subtle">{t.targetChosen}</span>}
    </span>
  );
}

function SourceCell({ r }: { r: Row }) {
  return <span className="text-fg">{useQueueView().sourceOf(r)}</span>;
}

function FactorCell({ r }: { r: Row }) {
  const t = useMessages(CATALOG_QUEUE_MESSAGES);
  const v = useQueueView();
  if (!v.needsFactor(r) || !v.manages(r.codeSetId)) return null;
  const value = v.factorOf(r);
  const fromFile = !!r.factor && value === r.factor;
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Input
        aria-label={fill(t.factorLabel, { code: r.code || r.name })}
        value={value}
        onChange={(e) => v.setFactor(r.id, e.target.value)}
        placeholder={fill(t.factorPlaceholder, { unit: r.unit ?? "", base: v.targetOf(r)?.baseUnit ?? "" })}
        inputMode="decimal"
        aria-invalid={value !== "" && !factorOk(value)}
      />
      {fromFile && <span className="text-xs text-fg-muted">{fill(t.factorFromFile, { factor: r.factor! })}</span>}
    </span>
  );
}

function NameCell({ r }: { r: Row }) {
  const t = useMessages(CATALOG_QUEUE_MESSAGES);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="line-clamp-2 text-fg">{r.name}</span>
      {r.itemFields && <span className="text-sm text-fg-muted">{t.itemFieldsHint}</span>}
    </span>
  );
}

function buildColumns(t: Messages) {
  return col.columns([
    col.accessor("code", { header: t.colCode, size: 220, meta: { sticky: true, hideable: false, wrap: true }, cell: (c) => <CodeCell r={c.row.original} /> }),
    col.accessor("name", { header: t.colName, size: 260, minSize: 200, meta: { wrap: true }, cell: (c) => <NameCell r={c.row.original} /> }),
    col.accessor((r) => r.unit ?? "", { id: "unit", header: t.colUnit, size: 80 }),
    col.accessor((r) => formatHs(r.hsCode ?? ""), { id: "hs", header: t.colHs, size: 110, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
    col.display({ id: "target", header: t.colTarget, size: 260, meta: { wrap: true }, cell: (c) => <TargetCell r={c.row.original} /> }),
    col.accessor("level", { header: t.colLevel, size: 120, cell: (c) => <StatusBadge status={MATCH_LEVEL[c.getValue()]} /> }),
    col.accessor((r) => reasonLabel(t, r.reason), { id: "reason", header: t.colReason, size: 240, meta: { wrap: true }, cell: (c) => <span className="text-sm text-fg">{c.getValue()}</span> }),
    col.display({ id: "source", header: t.colSource, size: 150, cell: (c) => <SourceCell r={c.row.original} /> }),
    col.display({ id: "factor", header: t.colFactor, size: 170, cell: (c) => <FactorCell r={c.row.original} /> }),
  ]);
}
