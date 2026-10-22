"use client";
import type { ProductCatalogItem, ProductSource } from "@kb/contracts";
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, type DataTableColumnVisibility, Dialog, DialogClose, DialogContent, DialogFooter, fill, Grid, PageHeader, RowActions,
  SkeletonStats, Stack, StatCard, toast, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Hash, Package, Pencil, Plus, Stamp, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteProducts, listProducts, productKeys } from "@/api/products";
import { getSession, sessionKeys } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatMoney } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { formatHs } from "./format";
import { ImportDialog } from "./import-dialog";
import { ProductDialog } from "./product-dialog";
import { PRODUCT_CATALOG_MESSAGES } from "./product-catalog.messages";

type Messages = Record<keyof (typeof PRODUCT_CATALOG_MESSAGES)["vi"], string>;
type Row = ProductCatalogItem & { sourceLabel: string; lastSort: string };

const SOURCE_TONE: Record<ProductSource, "info" | "neutral" | "success"> = { IMPORT: "info", MANUAL: "neutral", DECLARATION: "success" };
const EDITORS = new Set(["OWNER", "ADMIN", "DECLARANT"]);
type RateKey = "importDutyRate" | "vatRate" | "envTaxRate" | "exciseRate" | "safeguardRate" | "antiDiscriminationRate";
const col = createDataTableColumnHelper<Row>();
// Cột chỉ có ở một số file/mặt hàng: ẩn sẵn khi cả danh mục không có dữ liệu (vẫn bật lại được ở nút "Cột").
const SPARSE = ["unit2", "unitPrice", "partner", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"] as const satisfies readonly (keyof ProductCatalogItem)[];

function buildColumns(t: Messages) {
  const dash = <span className="text-fg-subtle">—</span>;
  const pct = (v: string | null) => (v == null ? dash : fill(t.percent, { n: v }));
  const rateCol = (id: RateKey, header: string, size = 100) =>
    col.accessor((r) => Number(r[id] ?? -1), { id, header, size, meta: { align: "end" }, cell: (c) => pct(c.row.original[id]) });
  return col.columns([
    col.accessor((r) => r.code ?? "", { id: "code", header: t.colCode, size: 120, meta: { filter: "text" }, cell: (c) => (c.getValue() ? <span className="font-mono">{c.getValue()}</span> : <span className="text-fg-subtle">—</span>) }),
    col.accessor((r) => (r.description ? `${r.name} ${r.description}` : r.name), {
      id: "name",
      header: t.colName,
      size: 380,
      minSize: 220,
      meta: { filter: "text", wrap: true, hideable: false },
      cell: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="line-clamp-2 text-fg">{c.row.original.name}</span>
          {c.row.original.description && <span className="line-clamp-1 text-xs text-fg-muted" title={c.row.original.description}>{c.row.original.description}</span>}
        </div>
      ),
    }),
    col.accessor((r) => formatHs(r.hsCode), { id: "hsCode", header: t.colHs, size: 120, meta: { filter: "text" }, cell: (c) => <span className="font-mono font-medium text-fg">{c.getValue()}</span> }),
    col.accessor((r) => r.unit ?? "", { id: "unit", header: t.colUnit, size: 80, meta: { filter: "select" } }),
    col.accessor((r) => r.unit2 ?? "", { id: "unit2", header: t.colUnit2, size: 80, meta: { filter: "select" } }),
    col.accessor((r) => r.origin ?? "", { id: "origin", header: t.colOrigin, size: 90, meta: { filter: "select" } }),
    col.accessor((r) => r.tariffSchedule ?? "", { id: "tariffSchedule", header: t.colSchedule, size: 100 }),
    rateCol("importDutyRate", t.colImportDuty),
    rateCol("vatRate", t.colVat, 80),
    rateCol("envTaxRate", t.colEnvTax),
    rateCol("exciseRate", t.colExcise),
    rateCol("safeguardRate", t.colSafeguard),
    rateCol("antiDiscriminationRate", t.colAntiDiscrimination, 110),
    col.accessor((r) => Number(r.unitPrice ?? -1), {
      id: "unitPrice",
      header: t.colUnitPrice,
      size: 140,
      meta: { align: "end" },
      cell: (c) => (c.row.original.unitPrice == null ? dash : <span className="tabular-nums">{formatMoney(c.row.original.unitPrice, c.row.original.currency ?? undefined)}</span>),
    }),
    col.accessor((r) => r.partner ?? "", { id: "partner", header: t.colPartner, size: 200, meta: { filter: "select", wrap: true }, cell: (c) => (c.getValue() ? <span className="line-clamp-2">{c.getValue()}</span> : dash) }),
    col.accessor("timesDeclared", { header: t.colTimes, size: 110, meta: { align: "end" } }),
    col.accessor("lastSort", {
      header: t.colLast,
      size: 170,
      cell: (c) => {
        const r = c.row.original;
        if (!r.lastDeclarationDate && !r.lastDeclarationNo) return <span className="text-fg-subtle">—</span>;
        return (
          <div className="flex flex-col">
            {r.lastDeclarationNo && <span className="font-mono text-fg">{r.lastDeclarationNo}</span>}
            <span className="text-xs text-fg-muted">{[r.lastTypeCode, r.lastDeclarationDate ? formatDate(r.lastDeclarationDate) : null].filter(Boolean).join(" · ")}</span>
          </div>
        );
      },
    }),
    col.accessor("sourceLabel", { header: t.colSource, size: 130, meta: { filter: "select" }, cell: (c) => <Badge tone={SOURCE_TONE[c.row.original.source]}>{c.getValue()}</Badge> }),
  ]);
}

export function ProductCatalogPage() {
  const t = useMessages(PRODUCT_CATALOG_MESSAGES);
  const qc = useQueryClient();
  const products = useQuery({ queryKey: productKeys.all, queryFn: listProducts });
  const { data: session } = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const canEdit = !!session && EDITORS.has(session.user.role);
  const [editing, setEditing] = useState<{ product: ProductCatalogItem | null } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<ProductCatalogItem[] | null>(null);

  const columns = useMemo(() => buildColumns(t), [t]);
  const [visibility, setVisibility] = useState<DataTableColumnVisibility | null>(null);
  const autoVisibility = useMemo(() => {
    const list = products.data ?? [];
    return { tariffSchedule: false, ...Object.fromEntries(SPARSE.map((k) => [k, list.some((p) => p[k] != null)])) };
  }, [products.data]);
  const rows = useMemo<Row[]>(
    () => (products.data ?? []).map((p) => ({ ...p, sourceLabel: t[`source${p.source}`], lastSort: p.lastDeclarationDate ?? "" })),
    [products.data, t],
  );
  const stats = useMemo(() => {
    const list = products.data ?? [];
    return { total: list.length, withCode: list.filter((p) => p.code).length, hs: new Set(list.map((p) => p.hsCode)).size, fromDecl: list.filter((p) => p.source === "DECLARATION").length };
  }, [products.data]);

  const remove = useMutation({
    mutationFn: (ids: string[]) => deleteProducts(ids),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: productKeys.all });
      toast({ tone: "success", title: fill(t.deleted, { n: r.deleted }) });
      setToDelete(null);
      setSelected([]);
    },
    onError: toastMutationError(t.failed),
  });

  const byId = new Map((products.data ?? []).map((p) => [p.id, p]));
  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          canEdit && (
            <>
              <Button variant="secondary" leftIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setImportOpen(true)}>{t.importButton}</Button>
              <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ product: null })}>{t.addButton}</Button>
            </>
          )
        }
      />
      {products.isError && <LoadError onRetry={() => void products.refetch()} title={t.loadError} />}
      {session && !canEdit && <Alert tone="info">{t.readOnly}</Alert>}

      {products.isLoading ? (
        <SkeletonStats count={3} />
      ) : (
        <Grid cols={{ base: 1, md: 3 }} gap="md">
          <StatCard icon={<Package />} label={t.statTotal} value={stats.total} hint={fill(t.statTotalHint, { n: stats.withCode })} />
          <StatCard icon={<Hash />} tone="info" label={t.statHs} value={stats.hs} hint={t.statHsHint} />
          <StatCard icon={<Stamp />} tone="success" label={t.statFromDeclaration} value={stats.fromDecl} hint={t.statFromDeclarationHint} />
        </Grid>
      )}

      <DataTable
        aria-label={t.tableLabel}
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.name}
        loading={products.isLoading}
        searchable
        columnToggle
        resizable
        selectable={canEdit}
        onSelectionChange={setSelected}
        initialSorting={[{ id: "lastSort", desc: true }]}
        columnVisibility={visibility ?? autoVisibility}
        onColumnVisibilityChange={setVisibility}
        pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50, 100] }}
        {...(canEdit ? { onRowClick: (r: Row) => setEditing({ product: byId.get(r.id) ?? r }) } : {})}
        toolbarActions={
          canEdit && selected.length > 0 && (
            <Button size="sm" variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setToDelete(selected.map((id) => byId.get(id)).filter((p): p is ProductCatalogItem => !!p))}>
              {fill(t.deleteSelected, { n: selected.length })}
            </Button>
          )
        }
        emptyTitle={t.emptyTitle}
        emptyDescription={t.emptyDescription}
        {...(canEdit ? { emptyAction: <Button size="sm" leftIcon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => setImportOpen(true)}>{t.importButton}</Button> } : {})}
        {...(canEdit
          ? {
              rowActions: (r: Row) => (
                <RowActions
                  rowLabel={r.name}
                  actions={[
                    { id: "edit", label: t.edit, icon: <Pencil />, onSelect: () => setEditing({ product: byId.get(r.id) ?? r }) },
                    { id: "delete", label: t.delete, icon: <Trash2 />, tone: "danger", onSelect: () => setToDelete([byId.get(r.id) ?? r]) },
                  ]}
                />
              ),
            }
          : {})}
      />

      <ProductDialog open={editing !== null} product={editing?.product ?? null} onOpenChange={(o) => !o && setEditing(null)} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <Dialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent title={t.deleteTitle} size="sm" icon={<Trash2 className="h-4 w-4" />}>
          <p className="text-sm text-fg-muted">
            {toDelete?.length === 1 ? fill(t.deleteOne, { name: toDelete[0]!.name }) : fill(t.deleteBody, { n: toDelete?.length ?? 0 })}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.keep}</Button>
            </DialogClose>
            <Button variant="danger" loading={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.map((p) => p.id))}>{t.delete}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}
