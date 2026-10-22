"use client";
import {
  Alert, Badge, Button, createDataTableColumnHelper, DataTable, Dialog, DialogClose, DialogContent, DialogFooter, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, fill, IconTile, PageHeader, RecordCard, SegmentedControl, Stack, toast, type DataTableColumnVisibility, RowActions, pickMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Container, Download, FolderOpen, Package, Plane, Plus, Ship, TrainFront, Truck, XCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { cancelDossier, dossierKeys, listDossiers } from "@/api/dossiers";
import { listMembers, memberKeys } from "@/api/session";
import { formatMoney } from "@/lib/format";
import { STEP_LABELS, STEP_ORDER, type Direction, type Dossier, type DossierStatus } from "@/mocks/types";
import { DossierStatusBadge, DueBadge } from "./dossier-badges";
import { DIRECTION_LABELS, dossierStatusDisplay } from "./dossier-display";
import { DOSSIER_LIST_MESSAGES } from "./dossiers.messages";

/** Hình đầu thẻ theo phương thức vận chuyển (chỉ trang trí – nghĩa nằm ở chữ trên thẻ). */
const TRANSPORT_ICON: Record<Dossier["transportMode"], LucideIcon> = {
  AIR: Plane, SEA_CONTAINER: Container, SEA_BULK: Ship, ROAD: Truck, RAIL: TrainFront, RIVER: Ship, OTHER: Package,
};

/** Dòng hiển thị: thêm nhãn chữ để ô tìm kiếm/lọc khớp với điều người dùng nhìn thấy. */
type Row = Dossier & { stepLabel: string; statusLabel: string; ownerName: string };

type Scope = "ALL" | Direction;

type ListMessages = Record<keyof (typeof DOSSIER_LIST_MESSAGES)["vi"], string>;

const col = createDataTableColumnHelper<Row>();
const buildColumns = (t: ListMessages, stepLabels: Record<Dossier["step"], string>, statusDisplay: ReturnType<typeof dossierStatusDisplay>) => col.columns([
  col.accessor("code", {
    header: t.colCode,
    size: 160,
    minSize: 140,
    meta: { filter: "text", hideable: false, sticky: true },
    cell: (c) => <span className="font-mono text-xs text-fg">{c.getValue()}</span>,
  }),
  col.accessor("typeCode", {
    header: t.colType,
    size: 125,
    minSize: 115,
    meta: { filter: "select" },
    cell: (c) => (
      <span className="inline-flex items-center gap-2">
        <Badge tone={c.row.original.direction === "NK" ? "info" : "primary"} variant="outline">{c.row.original.direction}</Badge>
        {c.getValue()}
      </span>
    ),
  }),
  col.accessor("partner", { header: t.colPartner, size: 210, minSize: 160, meta: { filter: "text", wrap: true } }),
  col.accessor("invoiceValue", {
    header: t.colValue,
    size: 140,
    meta: { align: "end" },
    sortFn: (a, b) => Number(a.original.invoiceValue) - Number(b.original.invoiceValue),
    cell: (c) => <span className="tabular-nums">{formatMoney(c.getValue(), c.row.original.currency)}</span>,
  }),
  col.accessor("dueDate", { header: t.colDue, size: 135, minSize: 120, cell: (c) => <DueBadge dossier={c.row.original} /> }),
  col.accessor("stepLabel", {
    header: t.colStep,
    size: 150,
    minSize: 140,
    sortFn: (a, b) => STEP_ORDER.indexOf(a.original.step) - STEP_ORDER.indexOf(b.original.step),
    meta: { filter: "select", filterOptions: STEP_ORDER.map((s) => ({ value: stepLabels[s], label: stepLabels[s] })) },
  }),
  col.accessor("statusLabel", {
    header: t.colStatus,
    size: 170,
    minSize: 150,
    meta: {
      filter: "select",
      filterOptions: (Object.keys(statusDisplay) as DossierStatus[]).map((s) => ({ value: statusDisplay[s].label, label: statusDisplay[s].label })),
    },
    cell: (c) => <DossierStatusBadge status={c.row.original.status} />,
  }),
  col.accessor("ownerName", { header: t.colOwner, size: 160, minSize: 120, meta: { filter: "select" } }),
]);

function ListInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("direction");
  const scope: Scope = raw === "NK" || raw === "XK" ? raw : "ALL";
  // pickMessages trả đúng một object cho mỗi ngôn ngữ → dùng làm deps của useMemo được.
  const locale = useUiLocale();
  const t = pickMessages(DOSSIER_LIST_MESSAGES, locale);
  const stepLabels = pickMessages(STEP_LABELS, locale);
  const directionLabels = pickMessages(DIRECTION_LABELS, locale);
  const statusDisplay = useMemo(() => dossierStatusDisplay(locale), [locale]);
  const columns = useMemo(() => buildColumns(t, stepLabels, statusDisplay), [t, stepLabels, statusDisplay]);

  const qc = useQueryClient();
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  const [toCancel, setToCancel] = useState<Dossier | null>(null);
  // Mặc định ẩn "Phụ trách" cho bảng gọn; bật lại qua nút "Cột".
  const [columnVisibility, setColumnVisibility] = useState<DataTableColumnVisibility>({ ownerName: false });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelDossier(id),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: t.canceled, description: d.code });
      setToCancel(null);
    },
    onError: () => toast({ tone: "danger", title: t.cancelFailed, description: t.tryLater }),
  });

  const rows = useMemo<Row[]>(() => {
    const names = new Map(members.data?.map((m) => [m.id, m.name]));
    return (dossiers.data ?? [])
      .filter((d) => scope === "ALL" || d.direction === scope)
      .map((d) => ({
        ...d,
        stepLabel: stepLabels[d.step],
        statusLabel: statusDisplay[d.status].label,
        ownerName: names.get(d.ownerId) ?? "—",
      }));
    }, [dossiers.data, members.data, scope, stepLabels, statusDisplay]);

  const setScope = (s: Scope) => {
    const next = new URLSearchParams(params);
    if (s === "ALL") next.delete("direction");
    else next.set("direction", s);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const title = scope === "ALL" ? t.titleAll : scope === "NK" ? t.titleNK : t.titleXK;

  return (
    <Stack gap="lg">
      <PageHeader
        title={title}
        description={t.description}
        actions={
          <>
            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={() => toast({ tone: "info", title: t.exporting, description: t.exportMock })}>
              {t.exportExcel}
            </Button>
            <Button asChild>
              <Link href="/dossiers/new"><Plus className="h-4 w-4" aria-hidden="true" />{t.create}</Link>
            </Button>
          </>
        }
      />

      {dossiers.isError && (
        <Alert tone="danger" title={t.loadError} action={<Button size="sm" variant="secondary" onClick={() => dossiers.refetch()}>{t.retry}</Button>}>
          {t.loadErrorHint}
        </Alert>
      )}

      <Stack gap="md">
            <SegmentedControl<Scope>
              label={t.scope}
              hideLabel
              className="justify-start"
              value={scope}
              onChange={setScope}
              options={[
                { value: "ALL", label: t.all },
                { value: "NK", label: directionLabels.NK },
                { value: "XK", label: directionLabels.XK },
              ]}
            />
            <DataTable
              aria-label={title}
              columns={columns}
              data={rows}
              getRowId={(r) => r.id}
              rowLabel={(r) => r.code}
              loading={dossiers.isLoading}
              selectable
              searchable
              columnToggle
              resizable
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
              pagination={{ initialPageSize: 10, pageSizeOptions: [10, 20, 50] }}
              onRowClick={(r) => router.push(`/dossiers/${r.id}`)}
              emptyTitle={t.emptyTitle}
              emptyDescription={t.emptyDescription}
              filtered={scope !== "ALL"}
              onClearFilters={() => setScope("ALL")}
              emptyAction={<Button asChild size="sm"><Link href="/dossiers/new">{t.create}</Link></Button>}
              viewStorageKey="dossiers"
              selectionActions={(picked) => (
                <Button size="sm" variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={() => toast({ tone: "info", title: t.exporting, description: t.exportMock })}>
                  {fill(t.exportSelected, { n: picked.length })}
                </Button>
              )}
              renderCard={(r, parts) => {
                const Transport = TRANSPORT_ICON[r.transportMode];
                return (
                <RecordCard
                  title={<span className="font-mono">{r.code}</span>}
                  subtitle={r.partner}
                  tone={r.direction === "NK" ? "info" : "primary"}
                  pattern={r.direction === "NK" ? "dots" : "diagonal"}
                  leading={<IconTile icon={<Transport />} tone={r.direction === "NK" ? "info" : "primary"} size="md" className="bg-surface" />}
                  art={<Transport />}
                  status={<DossierStatusBadge status={r.status} />}
                  select={parts.select}
                  actions={parts.actions}
                  fields={[
                    {
                      label: t.colType,
                      value: (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge tone={r.direction === "NK" ? "info" : "primary"} variant="outline">{r.direction}</Badge>
                          {r.typeCode}
                        </span>
                      ),
                    },
                    { label: t.colValue, value: <span className="tabular-nums">{formatMoney(r.invoiceValue, r.currency)}</span> },
                    { label: t.colStep, value: r.stepLabel },
                    { label: t.colDue, value: <DueBadge dossier={r} /> },
                  ]}
                  footer={`${t.colOwner}: ${r.ownerName}`}
                />
                );
              }}
              rowActions={(r) => (
                <RowActions
                  rowLabel={r.code}
                  actions={[
                    { id: "open", label: t.open, icon: <FolderOpen />, onSelect: () => router.push(`/dossiers/${r.id}`) },
                    {
                      id: "cancel",
                      label: t.cancel,
                      icon: <XCircle />,
                      tone: "danger",
                      disabled: r.status === "CANCELLED" || r.status === "CLEARED" || r.status === "SUBMITTED",
                      onSelect: () => setToCancel(r),
                    },
                  ]}
                />
              )}
            />
      </Stack>

      <Dialog open={toCancel !== null} onOpenChange={(o) => !o && setToCancel(null)}>
        <DialogContent title={t.cancelTitle} size="sm" icon={<XCircle className="h-4 w-4" />}>
          <p className="text-sm text-fg-muted">
            {t.cancelBodyPrefix} <span className="font-mono text-fg">{toCancel?.code}</span> – {toCancel?.partner} {t.cancelBodySuffix}
            {" "}{t.cancelBodyKeep}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.keep}</Button>
            </DialogClose>
            <Button variant="danger" loading={cancel.isPending} onClick={() => toCancel && cancel.mutate(toCancel.id)}>
              {t.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

export function DossierListPage() {
  return (
    <Suspense>
      <ListInner />
    </Suspense>
  );
}
