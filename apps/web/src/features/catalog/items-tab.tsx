"use client";
// Tab Mặt hàng (spec §6.1): bảng (thẻ trên mobile) – mã hiển thị chính, tên, HS, ĐVT gốc, loại, số bộ có mã, trạng thái.
// Tìm phía server theo mọi mã / mã nối / tên (mã ở bộ khác không nằm trong dòng nên ô tìm của bảng không làm được); "Xem theo bộ mã" đổi cột
// mã/tên/ĐVT; lọc loại / chưa có mã XNK / chưa có quy đổi; Thêm, Xuất Excel, Xuất bảng đối chiếu mã. Bấm dòng → panel chi tiết.
import type { CatalogItemKind, CatalogItemListRow, CodeSet, ListCatalogItemsQueryInput } from "@kb/contracts";
import {
  Button, Checkbox, createDataTableColumnHelper, DataTable, Field, fill, Input, pickMessages, RecordCard, RowActions, Select, StatusBadge, statusLabel, toast, useMessages, useUiLocale, type UiLocale,
} from "@kb/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Download, Eye, Plus, TableProperties } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogKeys, exportCrossReference, listCatalogItems, listCodeSets } from "@/api/catalog";
import { LoadError } from "@/components/common/load-error";
import { formatHs } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { saveBlob } from "@/lib/xlsx-download";
import { AddItemDialog } from "./add-item-dialog";
import { useCatalogAccess } from "./catalog-access";
import { ITEM_KINDS, ITEM_STATUS } from "./catalog-display";
import { CATALOG_MESSAGES } from "./catalog.messages";
import { buildCrossRefXlsx, buildItemsXlsx, setTitle } from "./catalog-xlsx";
import { ItemPanel } from "./item-panel";

type Messages = (typeof CATALOG_MESSAGES)["vi"];
const EXPORT_PAGE = 200;
const col = createDataTableColumnHelper<CatalogItemListRow>();

function buildColumns(t: Messages, set: CodeSet | null, locale: UiLocale) {
  // Bộ đối tác có thể trùng tên (nhà cung cấp / khách hàng) → tiêu đề cột kèm loại bộ, như file Excel.
  const title = set ? setTitle(set, locale) : "";
  const muted = (s: string) => <span className="text-fg-subtle">{s}</span>;
  return col.columns([
    set
      ? col.accessor((r) => r.setCode ?? "", {
          id: "code", header: fill(t.colSetCode, { set: title }), size: 150, meta: { sticky: true, hideable: false },
          cell: (c) => (c.getValue() ? <span className="font-mono">{c.getValue()}</span> : muted(t.noCodeInSet)),
        })
      : col.accessor("displayCode", { id: "code", header: t.colCode, size: 150, meta: { sticky: true, hideable: false }, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
    col.accessor((r) => (set ? (r.setName ?? r.name) : r.name), {
      id: "name", header: set ? fill(t.colSetName, { set: title }) : t.colName, size: 360, minSize: 220, meta: { wrap: true, hideable: false },
      cell: (c) => <span className="line-clamp-2 text-fg">{c.getValue()}</span>,
    }),
    col.accessor("itemNo", { header: t.colItemNo, size: 120, cell: (c) => <span className="font-mono text-fg-muted">{c.getValue()}</span> }),
    col.accessor((r) => formatHs(r.hsCode ?? ""), { id: "hs", header: t.colHs, size: 120, cell: (c) => <span className="font-mono font-medium text-fg">{c.getValue()}</span> }),
    col.accessor((r) => (set ? (r.setUnit ?? r.baseUnit ?? "") : (r.baseUnit ?? "")), { id: "unit", header: set ? fill(t.colSetUnit, { set: title }) : t.colBaseUnit, size: 100 }),
    col.accessor((r) => t[`kind${r.kind}`], { id: "kind", header: t.colKind, size: 120 }),
    col.accessor("codeSetCount", { header: t.colSetCount, size: 110, meta: { align: "end" } }),
    col.accessor("status", { header: t.colStatus, size: 130, cell: (c) => <StatusBadge status={ITEM_STATUS[c.getValue()]} /> }),
  ]);
}

export function ItemsTab() {
  const t = useMessages(CATALOG_MESSAGES);
  const locale = useUiLocale();
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const [setId, setSetId] = useState("");
  const [kind, setKind] = useState<CatalogItemKind | "">("");
  const [missingCustoms, setMissingCustoms] = useState(false);
  const [missingFactor, setMissingFactor] = useState(false);
  /** Mặc định chỉ mặt hàng đang dùng; "Ngưng dùng" để tìm lại và dùng lại mặt hàng đã ngưng. */
  const [status, setStatus] = useState<"ACTIVE" | "ARCHIVED">("ACTIVE");
  const [page, setPage] = useState({ pageIndex: 0, pageSize: 50 });
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState<"items" | "crossRef" | null>(null);

  const codeSets = useQuery({ queryKey: catalogKeys.codeSets, queryFn: listCodeSets });
  const sets = useMemo(() => codeSets.data ?? [], [codeSets.data]);
  const access = useCatalogAccess(sets);
  const viewSet = sets.find((s) => s.id === setId) ?? null;

  const filters: ListCatalogItemsQueryInput = {
    ...(q ? { q } : {}), ...(viewSet ? { codeSetId: viewSet.id } : {}), ...(kind ? { kind } : {}),
    ...(missingCustoms ? { missingCustoms: true } : {}), ...(missingFactor ? { missingFactor: true } : {}),
    ...(status !== "ACTIVE" ? { status } : {}),
  };
  const query: ListCatalogItemsQueryInput = { ...filters, page: page.pageIndex + 1, pageSize: page.pageSize };
  const items = useQuery({ queryKey: catalogKeys.items(query), queryFn: () => listCatalogItems(query), placeholderData: keepPreviousData });
  // Theo ngôn ngữ, không theo `t` (useMessages trả object mới mỗi lần dựng → cột dựng lại → ô bị dựng lại mỗi lần tải xong dữ liệu).
  const columns = useMemo(() => buildColumns(pickMessages(CATALOG_MESSAGES, locale), viewSet, locale), [viewSet, locale]);
  const isFiltered = !!(q || kind || missingCustoms || missingFactor || status !== "ACTIVE");
  /** Đổi bộ lọc → về trang đầu. */
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage((p) => ({ ...p, pageIndex: 0 }));
  };

  const runExport = async (which: "items" | "crossRef") => {
    setExporting(which);
    try {
      if (which === "items") {
        const rows: CatalogItemListRow[] = [];
        for (let p = 1; ; p++) {
          const r = await listCatalogItems({ ...filters, page: p, pageSize: EXPORT_PAGE });
          rows.push(...r.rows);
          if (rows.length >= r.total || r.rows.length === 0) break;
        }
        saveBlob(await buildItemsXlsx(rows, viewSet, locale), `${t.fileItems}.xlsx`);
      } else {
        saveBlob(await buildCrossRefXlsx(await exportCrossReference(), locale), `${t.fileCrossRef}.xlsx`);
      }
      toast({ tone: "success", title: t.exported });
    } catch (e) {
      toast({ tone: "danger", title: t.exportFailed, description: errorText(e, locale, t.exportFailed) });
    } finally {
      setExporting(null);
    }
  };

  const kindOptions = [{ value: "", label: t.kindAll }, ...ITEM_KINDS.map((k) => ({ value: k, label: t[`kind${k}`] }))];
  const statusOptions = [
    { value: "ACTIVE", label: statusLabel(ITEM_STATUS.ACTIVE, locale) },
    { value: "ARCHIVED", label: statusLabel(ITEM_STATUS.ARCHIVED, locale) },
  ];
  const setOptions = [{ value: "", label: t.viewByDefault }, ...sets.map((s) => ({ value: s.id, label: setTitle(s, locale) }))];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t.searchLabel} className="min-w-60 flex-1">
          <Input type="search" value={search} onChange={(e) => reset(setSearch)(e.target.value)} placeholder={t.searchPlaceholder} />
        </Field>
        <Field label={t.viewBy} className="w-full cq-sm:w-64">
          <Select options={setOptions} value={setId} onChange={(e) => reset(setSetId)(e.target.value)} />
        </Field>
        <Field label={t.kindFilter} className="w-full cq-sm:w-48">
          <Select options={kindOptions} value={kind} onChange={(e) => reset(setKind)(e.target.value as CatalogItemKind | "")} />
        </Field>
        <Field label={t.statusFilter} className="w-full cq-sm:w-44">
          <Select options={statusOptions} value={status} onChange={(e) => reset(setStatus)(e.target.value as "ACTIVE" | "ARCHIVED")} />
        </Field>
        <div className="flex flex-wrap gap-4 pb-2">
          <Checkbox label={t.missingCustoms} checked={missingCustoms} onChange={(e) => reset(setMissingCustoms)(e.target.checked)} />
          <Checkbox label={t.missingFactor} checked={missingFactor} onChange={(e) => reset(setMissingFactor)(e.target.checked)} />
        </div>
      </div>

      {items.isError && <LoadError onRetry={() => void items.refetch()} title={t.loadError} />}
      {!items.isError && (
        <DataTable
          aria-label={t.tableLabel}
          columns={columns}
          data={items.data?.rows ?? []}
          getRowId={(r) => r.id}
          rowLabel={(r) => r.name}
          loading={items.isLoading}
          columnToggle
          pagination={{ mode: "controlled", ...page, rowCount: items.data?.total ?? 0, onChange: setPage, pageSizeOptions: [20, 50, 100, 200] }}
          onRowClick={(r) => setOpenId(r.id)}
          filtered={isFiltered}
          onClearFilters={() => {
            setSearch("");
            setKind("");
            setMissingCustoms(false);
            setMissingFactor(false);
            setStatus("ACTIVE");
            setPage((p) => ({ ...p, pageIndex: 0 }));
          }}
          emptyTitle={t.emptyTitle}
          emptyDescription={t.emptyDescription}
          {...(access.canContribute ? { emptyAction: <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>{t.add}</Button> } : {})}
          viewStorageKey="catalog-items"
          toolbarActions={
            <>
              <Button size="sm" variant="secondary" leftIcon={<Download className="h-4 w-4" />} loading={exporting === "items"} disabled={exporting !== null} onClick={() => void runExport("items")}>
                {t.exportExcel}
              </Button>
              <Button size="sm" variant="secondary" leftIcon={<TableProperties className="h-4 w-4" />} loading={exporting === "crossRef"} disabled={exporting !== null} onClick={() => void runExport("crossRef")}>
                {t.exportCrossRef}
              </Button>
              {access.canContribute && (
                <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>{t.add}</Button>
              )}
            </>
          }
          renderCard={(r, parts) => (
            <RecordCard
              title={<span className="font-mono">{viewSet ? (r.setCode ?? t.noCodeInSet) : r.displayCode}</span>}
              titleLines={1}
              subtitle={viewSet ? (r.setName ?? r.name) : r.name}
              status={<StatusBadge status={ITEM_STATUS[r.status]} />}
              select={parts.select}
              actions={parts.actions}
              fields={[
                { label: t.colItemNo, value: <span className="font-mono">{r.itemNo}</span> },
                { label: t.colHs, value: <span className="font-mono">{formatHs(r.hsCode ?? "") || "—"}</span> },
                { label: viewSet ? fill(t.colSetUnit, { set: setTitle(viewSet, locale) }) : t.colBaseUnit, value: (viewSet ? (r.setUnit ?? r.baseUnit) : r.baseUnit) ?? "—" },
                { label: t.colKind, value: t[`kind${r.kind}`] },
                { label: t.colSetCount, value: r.codeSetCount },
              ]}
            />
          )}
          rowActions={(r) => (
            <RowActions rowLabel={r.name} actions={[{ id: "open", label: t.openDetail, icon: <Eye />, primary: true, onSelect: () => setOpenId(r.id) }]} />
          )}
        />
      )}

      <ItemPanel itemId={openId} sets={sets} access={access} onOpenChange={(o) => !o && setOpenId(null)} />
      {adding && <AddItemDialog sets={sets} access={access} onClose={() => setAdding(false)} onCreated={(id) => setOpenId(id)} />}
    </div>
  );
}
