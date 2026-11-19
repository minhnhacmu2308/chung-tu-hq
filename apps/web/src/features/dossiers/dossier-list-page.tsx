"use client";
import {
  Alert, Badge, Button, ConfirmDialog, createDataTableColumnHelper, DataTable, type DataTableColumnVisibility, DataTableFilterSelect, fill, IconTile, PageHeader, pickMessages, RecordCard, RowActions, SegmentedControl, Stack, StepProgress, Tabs, TabsContent, TabsList, TabsTrigger, toast, type UiLocale, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Container, Download, FolderOpen, Package, Plane, Plus, Printer, Ship, TrainFront, Trash2, Truck, XCircle, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { cancelDossier, deleteDossier, dossierKeys, listDossiers } from "@/api/dossiers";
import { getSession, listMembers, memberKeys, sessionKeys } from "@/api/session";
import { toastMutationError } from "@/lib/mutation-error";
import { formatMoney } from "@/lib/format";
import { STEP_LABELS, STEP_ORDER, type Direction, type Dossier } from "@/mocks/types";
import { DueBadge } from "./dossier-badges";
import { DIRECTION_LABELS } from "./dossier-display";
import { channelLabel, DossierProgressBadge, progressLabel, progressOfDossier, stepState } from "./dossier-progress-badge";
import { DOSSIER_PROGRESS_MESSAGES } from "./dossier-progress.messages";
import { channelOfDossier, inViec, parseChannel, parseViec, type ChannelFilter, PROGRESS_FILTER_ORDER, VIEC_TABS, type Viec } from "./dossier-progress-tabs";
import { declarationPrintHref } from "../declaration-print/declaration-print-page";
import { DOSSIER_LIST_MESSAGES } from "./dossiers.messages";

/** Hình đầu thẻ theo phương thức vận chuyển (chỉ trang trí – nghĩa nằm ở chữ trên thẻ). */
const TRANSPORT_ICON: Record<Dossier["transportMode"], LucideIcon> = {
  AIR: Plane, SEA_CONTAINER: Container, SEA_BULK: Ship, ROAD: Truck, RAIL: TrainFront, RIVER: Ship, OTHER: Package,
};

/** Dòng hiển thị: thêm nhãn chữ để ô tìm kiếm/lọc khớp với điều người dùng nhìn thấy. */
type Row = Dossier & { stepLabel: string; statusLabel: string; ownerName: string };

type ProgressMessages = Record<keyof (typeof DOSSIER_PROGRESS_MESSAGES)["vi"], string>;

const TAB_LABEL = { all: "tabAll", todo: "tabTodo", "await-official": "tabAwaitOfficial", channelled: "tabChannelled", cleared: "tabCleared", attention: "tabAttention" } as const satisfies Record<Viec, keyof ProgressMessages>;

type Scope = "ALL" | Direction;

/** Hồ sơ đã truyền Hải quan (có số tờ khai / trạng thái Hải quan) giữ để đối chiếu – chỉ hủy, không xóa (backend kiểm lại). */
/** Đã dựng tờ khai (bước Review trở đi hoặc đã truyền) → in được; chưa có số tờ khai thì bản in là bản nháp. */
const hasDeclaration = (d: Dossier) => d.step === "review" || d.step === "submit" || sentToCustoms(d);
const sentToCustoms = (d: Dossier) => d.status === "SUBMITTED" || d.status === "CLEARED" || !!d.declarationNo || !!d.customs;

function DossierStep({ dossier, stepLabels }: { dossier: Dossier; stepLabels: Record<Dossier["step"], string> }) {
  const steps = STEP_ORDER.map((id) => ({ id, label: stepLabels[id] }));
  return <StepProgress steps={steps} currentId={dossier.step} state={stepState(dossier)} />;
}

type ListMessages = Record<keyof (typeof DOSSIER_LIST_MESSAGES)["vi"], string>;

const col = createDataTableColumnHelper<Row>();
const buildColumns = (t: ListMessages, stepLabels: Record<Dossier["step"], string>, locale: UiLocale) => col.columns([
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
    size: 190,
    minSize: 160,
    sortFn: (a, b) => STEP_ORDER.indexOf(a.original.step) - STEP_ORDER.indexOf(b.original.step),
    meta: { filter: "select", filterOptions: STEP_ORDER.map((s) => ({ value: stepLabels[s], label: stepLabels[s] })) },
    cell: (c) => <DossierStep dossier={c.row.original} stepLabels={stepLabels} />,
  }),
  col.accessor("statusLabel", {
    header: t.colStatus,
    size: 230,
    minSize: 170,
    meta: {
      wrap: true,
      filter: "select",
      filterOptions: [...new Set(PROGRESS_FILTER_ORDER.map((p) => progressLabel(p, locale)))].map((label) => ({ value: label, label })),
    },
    cell: (c) => <DossierProgressBadge dossier={c.row.original} />,
  }),
  col.accessor("ownerName", { header: t.colOwner, size: 160, minSize: 120, meta: { filter: "select" } }),
]);

const VIEC_EMPTY = {
  todo: ["emptyTodo", "emptyTodoDesc"], "await-official": ["emptyAwaitOfficial", "emptyAwaitOfficialDesc"], channelled: ["emptyChannelled", "emptyChannelledDesc"],
  cleared: ["emptyCleared", "emptyClearedDesc"], attention: ["emptyAttention", "emptyAttentionDesc"],
} as const;

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
  const pm = pickMessages(DOSSIER_PROGRESS_MESSAGES, locale);
  const columns = useMemo(() => buildColumns(t, stepLabels, locale), [t, stepLabels, locale]);
  const viec = parseViec(params.get("viec"));
  const channel = viec === "channelled" ? parseChannel(params.get("luong")) : "ALL";
  // Tab việc cần làm không còn hồ sơ: nói đúng tab (không dùng câu "thử từ khóa khác" của ô tìm kiếm).
  const tabEmpty = viec === "all" ? null : { title: pm[VIEC_EMPTY[viec][0]], description: pm[VIEC_EMPTY[viec][1]] };

  const qc = useQueryClient();
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers() });
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  const [toCancel, setToCancel] = useState<Dossier | null>(null);
  const [toDelete, setToDelete] = useState<Dossier | null>(null);
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  // Xóa hẳn: người duyệt / quản trị (backend kiểm lại quyền).
  const canDelete = role === "OWNER" || role === "ADMIN" || role === "APPROVER";
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

  const remove = useMutation({
    mutationFn: (id: string) => deleteDossier(id),
    onSuccess: async (d) => {
      await qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: t.deleted, description: d.code });
      setToDelete(null);
    },
    onError: toastMutationError(t.deleteFailed),
  });

  const inScope = useMemo(() => (dossiers.data ?? []).filter((d) => scope === "ALL" || d.direction === scope), [dossiers.data, scope]);
  const counts = useMemo(() => Object.fromEntries(VIEC_TABS.map((v) => [v, inScope.filter((d) => inViec(d, v)).length])) as Record<Viec, number>, [inScope]);
  const rows = useMemo<Row[]>(() => {
    const names = new Map(members.data?.map((m) => [m.id, m.name]));
    return inScope
      .filter((d) => inViec(d, viec) && (viec !== "channelled" || channel === "ALL" || channelOfDossier(d) === channel))
      .map((d) => ({
        ...d,
        stepLabel: stepLabels[d.step],
        statusLabel: progressLabel(progressOfDossier(d).progress, locale),
        ownerName: names.get(d.ownerId) ?? "—",
      }));
  }, [inScope, members.data, viec, channel, stepLabels, locale]);

  const setViec = (v: Viec) => {
    const next = new URLSearchParams(params);
    if (v === "all") next.delete("viec");
    else next.set("viec", v);
    next.delete("luong");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const setChannel = (c: ChannelFilter) => {
    const next = new URLSearchParams(params);
    if (c === "ALL") next.delete("luong");
    else next.set("luong", c);
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

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
            <Tabs value={viec} onValueChange={(v) => setViec(parseViec(v))} className="flex flex-col gap-4">
              <TabsList aria-label={pm.tabsLabel}>
                {VIEC_TABS.map((v) => <TabsTrigger key={v} value={v}>{pm[TAB_LABEL[v]]}<Badge size="sm" tone="neutral">{counts[v]}</Badge></TabsTrigger>)}
              </TabsList>
              <TabsContent value={viec} className="flex flex-col gap-4 pt-0">
                {/* Tải lỗi: chỉ báo lỗi (Alert ở trên), không hiện bảng trống "Chưa có hồ sơ" – sai nghĩa. */}
                {!dossiers.isError && (
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
                    pagination={{ initialPageSize: 50, pageSizeOptions: [20, 50, 100] }}
                    onRowClick={(r) => router.push(`/dossiers/${r.id}`)}
                    emptyTitle={t.emptyTitle}
                    emptyDescription={t.emptyDescription}
                    filtered={scope !== "ALL" || viec !== "all" || channel !== "ALL"}
                activeFilters={channel !== "ALL" ? 1 : 0}
                {...(viec === "channelled" ? { filters: (
                  <DataTableFilterSelect
                    label={pm.channelFilter}
                    options={[
                      { value: "ALL", label: pm.channelAll },
                      { value: "GREEN", label: channelLabel("GREEN", locale) },
                      { value: "YELLOW", label: channelLabel("YELLOW", locale) },
                      { value: "RED", label: channelLabel("RED", locale) },
                    ]}
                    value={channel}
                    onChange={(v) => setChannel(parseChannel(v))}
                  />
                ) } : {})}
                    {...(tabEmpty ? { labels: { noResultsTitle: tabEmpty.title, noResultsDescription: tabEmpty.description } } : {})}
                    onClearFilters={() => router.replace(pathname, { scroll: false })}
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
                        titleLines={1}
                        subtitle={r.partner}
                        tone={r.direction === "NK" ? "info" : "primary"}
                        pattern={r.direction === "NK" ? "dots" : "diagonal"}
                        leading={<IconTile icon={<Transport />} tone={r.direction === "NK" ? "info" : "primary"} size="md" className="bg-surface" />}
                        art={<Transport />}
                        status={<DossierProgressBadge dossier={r} />}
                        select={parts.select}
                        actions={parts.actions}
                        fields={[
                          { label: t.colStep, value: <DossierStep dossier={r} stepLabels={stepLabels} />, wide: true },
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
                          { label: t.colDue, value: <DueBadge dossier={r} /> },
                          { label: t.colOwner, value: r.ownerName },
                        ]}
                      />
                      );
                    }}
                    rowActions={(r) => (
                      <RowActions
                        rowLabel={r.code}
                        actions={[
                          { id: "open", label: t.open, icon: <FolderOpen />, primary: true, onSelect: () => router.push(`/dossiers/${r.id}`) },
                          ...(hasDeclaration(r) ? [{ id: "print", label: t.print, icon: <Printer />, quick: false, onSelect: () => router.push(declarationPrintHref(r.id)) }] : []),
                          {
                            id: "cancel",
                            label: t.cancel,
                            icon: <XCircle />,
                            tone: "danger",
                            disabled: r.status === "CANCELLED" || r.status === "CLEARED" || r.status === "SUBMITTED",
                            onSelect: () => setToCancel(r),
                          },
                          ...(canDelete && !sentToCustoms(r)
                            ? [{
                                id: "delete",
                                label: t.delete,
                                icon: <Trash2 />,
                                tone: "danger" as const,
                                quick: false,
                                onSelect: () => setToDelete(r),
                              }]
                            : []),
                        ]}
                      />
                    )}
                  />
                )}
              </TabsContent>
            </Tabs>
      </Stack>

      <ConfirmDialog
        open={toCancel !== null}
        onOpenChange={(o) => !o && setToCancel(null)}
        title={t.cancelTitle}
        icon={<XCircle className="h-4 w-4" />}
        confirmLabel={t.cancel}
        loading={cancel.isPending}
        onConfirm={() => toCancel && cancel.mutate(toCancel.id)}
        labels={{ keep: t.keep }}
      >
        {t.cancelBodyPrefix} <span className="font-mono">{toCancel?.code}</span> – {toCancel?.partner} {t.cancelBodySuffix}
        {" "}{t.cancelBodyKeep}
      </ConfirmDialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.deleteTitle}
        icon={<Trash2 className="h-4 w-4" />}
        irreversible
        confirmLabel={t.deleteConfirm}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        {fill(t.deleteBody, { code: toDelete?.code ?? "" })}
      </ConfirmDialog>
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
