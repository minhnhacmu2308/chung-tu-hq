"use client";
// Màn "Nghiệp vụ khác" (spec nghiệp vụ khác §6): kho số định danh xin theo lô. Bộ lọc + trang nằm trên URL (F5 / link thông báo `?batchId=` giữ nguyên);
// còn dòng Đang gửi → tải lại mỗi 5 giây. Chỉ dòng lỗi (bị từ chối / chưa phản hồi, chưa có số) chọn được để Gửi lại / Xóa.
import { IdentifierDisplayStatusSchema, IsoDateSchema, type IdentifierDisplayStatus, type IdentifierListItem, type IdentifierListQuery } from "@kb/contracts";
import {
  Abbreviation, Alert, Badge, Barcode, Button, ConfirmDialog, createDataTableColumnHelper, DataTable, DataTableFilterSelect, DateRangePicker, Dialog, Field, fill, Input,
  PageHeader, pickMessages, RowActions, Stack, StatusBadge, statusLabel, toast, useUiLocale, type Status, type UiLocale,
} from "@kb/ui";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareMore, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { customsOpsKeys, deleteIdentifiers, listIdentifiers, pollIdentifierRow, releaseIdentifier, retryIdentifier } from "@/api/customs-ops";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { useCodeList } from "../declaration-form/use-code-list";
import { CUSTOMS_OPS_MESSAGES } from "./customs-ops.messages";
import { IdentifierBatchDialog } from "./identifier-batch-dialog";

type Row = IdentifierListItem;
type Text = (typeof CUSTOMS_OPS_MESSAGES)["vi"];

const STATUS = {
  SENDING: "IDENTIFIER_SENDING", AVAILABLE: "IDENTIFIER_AVAILABLE", USED: "IDENTIFIER_USED", EXPIRED: "IDENTIFIER_EXPIRED", REJECTED: "IDENTIFIER_REJECTED", NO_RESPONSE: "IDENTIFIER_NO_RESPONSE",
} as const satisfies Record<IdentifierDisplayStatus, Status>;
const REFRESH_MS = 5_000;
const PAGE_SIZES = [20, 50, 100];
const DEFAULT_SIZE = 50;

/** Như backend (canDeleteIdentifier): chỉ dòng bị từ chối / chưa phản hồi chưa có số. */
const canDelete = (r: Row) => (r.status === "REJECTED" || r.status === "NO_RESPONSE") && !r.identifierNo;
const canRetry = (r: Row) => canDelete(r) && !!r.batchId;
const canPoll = (r: Row) => (r.status === "SENDING" || r.status === "NO_RESPONSE") && !!r.refId && !r.identifierNo;

const batchLabel = (r: Row, t: Text) => (r.batchId ? fill(t.batchLine, { batch: r.batchId.slice(0, 8), n: r.batchIndex ?? "" }) : r.id);
const rowName = (r: Row, t: Text) => r.identifierNo ?? batchLabel(r, t);
const dash = <span className="text-fg-subtle">—</span>;

const col = createDataTableColumnHelper<Row>();
const buildColumns = (locale: UiLocale, officeName: (code: string) => string | undefined) => {
  const t = pickMessages(CUSTOMS_OPS_MESSAGES, locale);
  return col.columns([
    col.accessor("identifierNo", {
      header: t.colNo,
      size: 230,
      meta: { hideable: false, sticky: true },
      cell: (c) => {
        const r = c.row.original;
        if (!r.identifierNo) return <span className="text-sm text-fg-muted">{t.noNumber}</span>;
        return (
          <span className="inline-flex items-center gap-2">
            {r.qrPng && <Barcode type="png" size="xs" surface="scan" value={r.qrPng} label={fill(t.qrLabel, { no: r.identifierNo })} />}
            <span className="font-mono text-sm">{r.identifierNo}</span>
          </span>
        );
      },
    }),
    col.accessor("batchId", {
      header: t.colBatch,
      size: 170,
      cell: (c) => {
        const r = c.row.original;
        return r.batchId ? (
          <Link href={`/customs/ops?batchId=${encodeURIComponent(r.batchId)}`} title={t.batchFilterHint} className="whitespace-nowrap font-mono text-xs text-primary hover:underline">
            {batchLabel(r, t)}
          </Link>
        ) : (
          dash
        );
      },
    }),
    col.accessor((r) => r.request.customsOffice, {
      id: "office",
      header: t.colOffice,
      size: 110,
      cell: (c) => {
        const name = officeName(c.getValue());
        return name ? <Abbreviation short={c.getValue()} full={name} className="font-mono text-xs" /> : <span className="font-mono text-xs">{c.getValue()}</span>;
      },
    }),
    col.accessor("displayStatus", {
      header: t.colStatus,
      size: 190,
      cell: (c) => (
        <span className="inline-flex flex-wrap items-center gap-1">
          <StatusBadge status={STATUS[c.getValue()]} />
          {c.row.original.expiringSoon && <Badge tone="warning" variant="outline">{t.expiringChip}</Badge>}
        </span>
      ),
    }),
    col.accessor("identifiedOn", { header: t.colIdentifiedOn, size: 120, cell: (c) => (c.getValue() ? formatDate(c.getValue()!) : dash) }),
    col.accessor("expiresOn", { header: t.colExpiresOn, size: 120, cell: (c) => (c.getValue() ? formatDate(c.getValue()!) : dash) }),
    col.accessor("usedByDossierId", {
      header: t.colUsedBy,
      size: 150,
      cell: (c) =>
        c.getValue() ? (
          <Link href={`/dossiers/${c.getValue()}`} className="font-mono text-xs text-primary hover:underline">{c.getValue()}</Link>
        ) : (
          dash
        ),
    }),
    col.accessor("sentAt", { header: t.colSentAt, size: 160, cell: (c) => <time dateTime={c.getValue()}>{formatDateTime(c.getValue())}</time> }),
  ]);
};

/** Bộ lọc trên URL. Giá trị lạ (status / ngày sai, tìm quá 50 ký tự) bị bỏ hoặc cắt – link hỏng không làm trang báo lỗi. */
function readParams(p: URLSearchParams) {
  const status = IdentifierDisplayStatusSchema.safeParse(p.get("status"));
  const day = (k: string) => (IsoDateSchema.safeParse(p.get(k)).success ? p.get(k)! : "");
  const page = Math.max(1, Number(p.get("page")) || 1);
  const size = PAGE_SIZES.includes(Number(p.get("size"))) ? Number(p.get("size")) : DEFAULT_SIZE;
  return {
    status: (status.success ? status.data : "") as IdentifierDisplayStatus | "", from: day("from"), to: day("to"), customsOffice: p.get("customsOffice") ?? "", batchId: p.get("batchId") ?? "",
    q: (p.get("q") ?? "").slice(0, 50).trim(), page, size,
  };
}
type Filters = ReturnType<typeof readParams>;

/**
 * Ô nhập ghi lên URL sau khi ngừng gõ 300 ms (cắt khoảng trắng lúc ghi): gõ nhanh không mất chữ, không gọi máy chủ mỗi phím.
 * URL đổi từ ngoài (Xóa bộ lọc, link thông báo) → ô theo URL.
 */
function useUrlDraft(urlValue: string, commit: (v: string) => void) {
  const [draft, setDraft] = useState(urlValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => setDraft((d) => (d.trim() === urlValue ? d : urlValue)), [urlValue]);
  useEffect(() => {
    if (draft.trim() === urlValue) return;
    const h = setTimeout(() => commitRef.current(draft.trim()), 300);
    return () => clearTimeout(h);
  }, [draft, urlValue]);
  return [draft, setDraft] as const;
}

type Confirm = { kind: "delete" | "retry"; rows: Row[]; clear: () => void } | { kind: "release"; row: Row };

function PageInner() {
  const locale = useUiLocale();
  const t = pickMessages(CUSTOMS_OPS_MESSAGES, locale);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = readParams(params);
  const [registering, setRegistering] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [retrying, setRetrying] = useState(false);

  const latest = useRef(params);
  latest.current = params;
  const setParams = (patch: Partial<Record<keyof Filters, string | number>>) => {
    const sp = new URLSearchParams(latest.current);
    if (!("page" in patch)) sp.delete("page");
    for (const [k, v] of Object.entries(patch)) {
      if (v === "" || (k === "page" && v === 1) || (k === "size" && v === DEFAULT_SIZE)) sp.delete(k);
      else sp.set(k, String(v));
    }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const [search, setSearch] = useUrlDraft(f.q, (q) => setParams({ q }));
  const [batch, setBatch] = useUrlDraft(f.batchId, (batchId) => setParams({ batchId }));

  const query: Partial<IdentifierListQuery> = {
    ...(f.status ? { status: f.status } : {}), ...(f.from ? { from: f.from } : {}), ...(f.to ? { to: f.to } : {}), ...(f.customsOffice ? { customsOffice: f.customsOffice } : {}),
    ...(f.batchId ? { batchId: f.batchId } : {}), ...(f.q ? { q: f.q } : {}), limit: f.size, offset: (f.page - 1) * f.size,
  };
  const list = useQuery({
    queryKey: customsOpsKeys.identifiers(query),
    queryFn: () => listIdentifiers(query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((r) => r.displayStatus === "SENDING") ? REFRESH_MS : false),
  });
  const rows = list.data?.items ?? [];
  const refresh = () => void qc.invalidateQueries({ queryKey: customsOpsKeys.all });

  const offices = useCodeList("A038");
  const officeName = useMemo(() => {
    const byCode = new Map((offices ?? []).map((o) => [o.code, o.name]));
    return (code: string) => byCode.get(code);
  }, [offices]);
  const columns = useMemo(() => buildColumns(locale, officeName), [locale, officeName]);

  const poll = useMutation({ mutationFn: pollIdentifierRow, onSuccess: () => { toast({ tone: "info", title: t.polled }); refresh(); }, onError: toastMutationError(t.pollFailed) });
  const release = useMutation({
    mutationFn: (r: Row) => releaseIdentifier(r.id, r.usedByDossierId!),
    onSuccess: (_v, r) => {
      toast({ tone: "success", title: fill(t.released, { no: r.identifierNo ?? "" }) });
      setConfirm(null);
      refresh();
    },
    onError: toastMutationError(t.releaseFailed),
  });
  const remove = useMutation({
    mutationFn: (rs: Row[]) => deleteIdentifiers(rs.map((r) => r.id)),
    onSuccess: ({ deleted }, rs) => {
      if (deleted.length) toast({ tone: "success", title: fill(t.deleted, { n: deleted.length }) });
      if (deleted.length < rs.length) toast({ tone: "warning", title: fill(t.deleteSkipped, { n: rs.length - deleted.length }) });
      if (confirm?.kind === "delete") confirm.clear();
      setConfirm(null);
      refresh();
    },
    onError: toastMutationError(t.deleteFailed),
  });

  /** Gửi lại từng dòng (API theo dòng), báo số dòng đã gửi lại / không gửi được. */
  const retryRows = async (rs: Row[], clear?: () => void) => {
    setRetrying(true);
    let done = 0;
    for (const r of rs) {
      try {
        await retryIdentifier(r.id);
        done += 1;
      } catch {
        /* đếm ở dưới */
      }
    }
    setRetrying(false);
    clear?.();
    refresh();
    if (done) toast({ tone: "success", title: fill(t.retried, { n: done }) });
    if (done < rs.length) toast({ tone: "warning", title: rs.length === 1 ? t.retryFailed : fill(t.retryPartFailed, { n: rs.length - done }) });
  };

  /** Có dòng chưa phản hồi → hỏi trước (Hải quan có thể vẫn trả số cho lần gửi cũ, gửi lại tính phí FPT thêm). */
  const askRetry = (rs: Row[], clear: () => void = () => {}) =>
    rs.some((r) => r.status === "NO_RESPONSE") ? setConfirm({ kind: "retry", rows: rs, clear }) : void retryRows(rs, clear);

  const activeFilters = [f.status, f.from || f.to, f.customsOffice, f.batchId].filter(Boolean).length;
  const expiring = list.data?.expiringCount ?? 0;
  const deleting = confirm?.kind === "delete" ? confirm.rows : [];
  const noResponse = deleting.filter((r) => r.status === "NO_RESPONSE").length;
  const retryingRows = confirm?.kind === "retry" ? confirm.rows : [];

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={<Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setRegistering(true)}>{t.register}</Button>}
      />
      {expiring > 0 && <Alert tone="warning" title={fill(t.expiringBanner, { n: expiring })} />}
      {list.isError ? (
        <LoadError title={t.loadError} onRetry={() => void list.refetch()} />
      ) : (
        <DataTable
          aria-label={t.tableLabel}
          columns={columns}
          data={rows}
          getRowId={(r) => r.id}
          rowLabel={(r) => rowName(r, t)}
          loading={list.isLoading}
          columnToggle
          pagination={{
            mode: "controlled", pageIndex: f.page - 1, pageSize: f.size, rowCount: list.data?.total ?? 0, pageSizeOptions: PAGE_SIZES,
            onChange: (p) => setParams({ page: p.pageIndex + 1, size: p.pageSize }),
          }}
          search={{ value: search, onChange: setSearch, placeholder: t.searchPlaceholder, label: t.searchLabel }}
          filtered={activeFilters > 0 || !!f.q}
          activeFilters={activeFilters}
          onClearFilters={() => {
            setSearch("");
            setBatch("");
            setParams({ status: "", from: "", to: "", customsOffice: "", batchId: "", q: "" });
          }}
          filters={
            <>
              <DataTableFilterSelect
                label={t.filterStatus}
                value={f.status}
                onChange={(v) => setParams({ status: v })}
                options={[{ value: "", label: t.statusAll }, ...IdentifierDisplayStatusSchema.options.map((s) => ({ value: s, label: statusLabel(STATUS[s], locale) }))]}
              />
              <DataTableFilterSelect
                label={t.filterOffice}
                value={f.customsOffice}
                onChange={(v) => setParams({ customsOffice: v })}
                options={[{ value: "", label: t.officeAll }, ...(offices ?? []).filter((o) => !o.inactive).map((o) => ({ value: o.code, label: `${o.code} – ${o.name}` }))]}
              />
              <Field label={t.filterDate}>
                <DateRangePicker value={{ from: f.from || null, to: f.to || null }} onChange={(r) => setParams({ from: r.from ?? "", to: r.to ?? "" })} />
              </Field>
              <Field label={t.filterBatch}>
                <Input value={batch} placeholder={t.batchPlaceholder} onChange={(e) => setBatch(e.target.value)} />
              </Field>
            </>
          }
          emptyTitle={t.emptyTitle}
          emptyDescription={t.emptyDescription}
          emptyAction={<Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setRegistering(true)}>{t.register}</Button>}
          selectable
          isRowSelectable={canDelete}
          selectionActions={(picked, clear) => {
            const retryable = picked.filter(canRetry);
            return (
              <>
                {retryable.length > 0 && (
                  <Button size="sm" variant="secondary" leftIcon={<RotateCcw className="h-4 w-4" />} loading={retrying} onClick={() => askRetry(retryable, clear)}>
                    {fill(t.bulkRetry, { n: retryable.length })}
                  </Button>
                )}
                <Button size="sm" variant="danger-outline" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setConfirm({ kind: "delete", rows: picked, clear })}>
                  {fill(t.bulkDelete, { n: picked.length })}
                </Button>
              </>
            );
          }}
          rowActions={(r) => {
            const actions = [
              ...(canPoll(r) ? [{ id: "poll", label: t.poll, icon: <MessageSquareMore />, onSelect: () => poll.mutate(r.id) }] : []),
              ...(canRetry(r) && !retrying ? [{ id: "retry", label: t.retry, icon: <RotateCcw />, onSelect: () => askRetry([r]) }] : []),
              ...(r.displayStatus === "USED" && r.usedByDossierId ? [{ id: "release", label: t.release, icon: <Undo2 />, quick: false, onSelect: () => setConfirm({ kind: "release", row: r }) }] : []),
              ...(canDelete(r) ? [{ id: "delete", label: t.delete, icon: <Trash2 />, tone: "danger" as const, onSelect: () => setConfirm({ kind: "delete", rows: [r], clear: () => {} }) }] : []),
            ];
            return actions.length ? <RowActions rowLabel={rowName(r, t)} actions={actions} /> : null;
          }}
        />
      )}

      <Dialog open={registering} onOpenChange={setRegistering}>
        {registering && <IdentifierBatchDialog lastRequest={rows[0]?.request ?? null} onClose={() => setRegistering(false)} />}
      </Dialog>
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        icon={<Trash2 className="h-4 w-4" />}
        title={fill(t.deleteTitle, { n: deleting.length })}
        confirmLabel={t.delete}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deleting)}
      >
        {noResponse > 0 ? fill(t.deleteNoResponse, { n: noResponse }) : t.deleteBody}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "retry"}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="warning"
        icon={<RotateCcw className="h-4 w-4" />}
        title={fill(t.retryTitle, { n: retryingRows.length })}
        confirmLabel={t.retry}
        loading={retrying}
        onConfirm={() => {
          if (confirm?.kind !== "retry") return;
          void retryRows(confirm.rows, confirm.clear).then(() => setConfirm(null));
        }}
      >
        {fill(t.retryNoResponse, { n: retryingRows.filter((r) => r.status === "NO_RESPONSE").length })}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm?.kind === "release"}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone="warning"
        icon={<Undo2 className="h-4 w-4" />}
        title={fill(t.releaseTitle, { no: confirm?.kind === "release" ? (confirm.row.identifierNo ?? "") : "" })}
        confirmLabel={t.release}
        loading={release.isPending}
        onConfirm={() => confirm?.kind === "release" && release.mutate(confirm.row)}
      >
        {t.releaseBody}
      </ConfirmDialog>
    </Stack>
  );
}

export function CustomsOpsPage() {
  return (
    <Suspense>
      <PageInner />
    </Suspense>
  );
}
