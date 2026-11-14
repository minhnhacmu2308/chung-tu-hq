"use client";
// Tab Bộ mã (spec §6.2): dòng đầu hiện chế độ + tiền tố mã nối + "Đổi chế độ" (Quản trị/Chủ, popup theo quy tắc chuyển §3);
// danh sách bộ mã (tên, loại StatusBadge, số mã, người phụ trách, ★ mã hiển thị chính); Thêm/Sửa bộ mã (Quản trị/Chủ).
// Chưa thiết lập → EmptyState + "Thiết lập danh mục" (trình hướng dẫn; chế độ dùng chung xong đi thẳng tới tab Nhập dữ liệu).
// Bộ nguồn gốc (spec 2026-11-14): nhãn "Nguồn gốc" cạnh tên; "Đặt làm nguồn gốc" (bộ nội bộ khác) / "Áp dụng lại nguồn gốc" (bộ đang là nguồn gốc)
// cho Quản trị/Chủ hoặc người phụ trách bộ đó → popup xem trước + thực hiện.
import type { CatalogMode, CodeSet } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, createDataTableColumnHelper, DataTable, Dialog, DialogContent, DialogFooter, EmptyState, fill, RadioGroup, RowActions, SkeletonCard,
  pickMessages, Stack, StatusBadge, toast, useMessages, useUiLocale, type RowAction,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Crown, Layers, Pencil, Plus, RefreshCw, Settings2, Star, StarOff } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { catalogKeys, changeCatalogMode, getCatalogSettings, listCodeSets, setPrimaryDisplay } from "@/api/catalog";
import { listMembers, memberKeys } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { getFormatLocale } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { errorText } from "@/lib/reason-codes";
import { useCatalogAccess } from "./catalog-access";
import { CATALOG_SETS_MESSAGES } from "./catalog.messages";
import { CodeSetDialog } from "./code-set-dialog";
import { codeSetStatus } from "./code-set-label";
import { SetSourceDialog } from "./set-source-dialog";
import { SetupWizard } from "./setup-wizard";
import { CATALOG_SOURCE_MESSAGES } from "./source-set.messages";

type Messages = (typeof CATALOG_SETS_MESSAGES)["vi"] & { sourceBadge: string };
const INTERNAL = ["SHARED", "ACCOUNTING", "WAREHOUSE", "CUSTOMS"] as const;
const isInternal = (s: CodeSet) => (INTERNAL as readonly string[]).includes(s.kind);
/** Dòng bảng: bộ mã + tên người phụ trách (đã tra từ danh sách thành viên). */
type SetRow = CodeSet & { ownerNames: string };
const col = createDataTableColumnHelper<SetRow>();

function buildColumns(t: Messages) {
  return col.columns([
    col.accessor("name", {
      header: t.colName, size: 260, meta: { sticky: true, hideable: false, wrap: true },
      cell: (c) => (
        <span className="flex flex-col items-start gap-1">
          <span className="break-words font-medium text-fg">{c.getValue()}</span>
          {c.row.original.isSource && <Badge tone="primary" size="sm" icon={<Crown />}>{t.sourceBadge}</Badge>}
          {c.row.original.isDefault && <span className="text-sm text-fg-muted">{t.defaultCustoms}</span>}
        </span>
      ),
    }),
    col.accessor("kind", { header: t.colKind, size: 140, cell: (c) => <StatusBadge status={codeSetStatus(c.getValue())} /> }),
    col.accessor("codeCount", { header: t.colCodes, size: 90, meta: { align: "end" } }),
    col.accessor("ownerNames", {
      id: "owners", header: t.colOwners, size: 240, meta: { wrap: true },
      cell: (c) => (c.getValue() ? <span className="text-fg">{c.getValue()}</span> : <span className="text-fg-subtle">{t.noOwners}</span>),
    }),
    col.accessor("isPrimaryDisplay", {
      header: t.colPrimary, size: 180,
      cell: (c) =>
        c.getValue() ? (
          <span className="inline-flex items-center gap-1 text-fg">
            <Star aria-hidden="true" className="h-4 w-4 text-primary" />
            {t.primaryYes}
          </span>
        ) : null,
    }),
  ]);
}

export function CodeSetsTab() {
  const t = useMessages(CATALOG_SETS_MESSAGES);
  const ts = useMessages(CATALOG_SOURCE_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const settings = useQuery({ queryKey: catalogKeys.settings, queryFn: getCatalogSettings });
  const codeSets = useQuery({ queryKey: catalogKeys.codeSets, queryFn: listCodeSets });
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  const sets = useMemo(() => codeSets.data ?? [], [codeSets.data]);
  const access = useCatalogAccess(sets);
  const [editing, setEditing] = useState<CodeSet | "new" | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [sourceFor, setSourceFor] = useState<CodeSet | null>(null);

  const rows = useMemo<SetRow[]>(() => {
    const byId = new Map((members.data ?? []).map((m) => [m.id, m.name]));
    return sets.map((s) => ({ ...s, ownerNames: s.ownerIds.map((id) => byId.get(id) ?? id).join(", ") }));
  }, [sets, members.data]);
  const columns = useMemo(() => buildColumns({ ...pickMessages(CATALOG_SETS_MESSAGES, locale), sourceBadge: pickMessages(CATALOG_SOURCE_MESSAGES, locale).badge }), [locale]);

  const primary = useMutation({
    mutationFn: (s: CodeSet | null) => setPrimaryDisplay(s?.id ?? null),
    onSuccess: (_, s) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: s ? fill(t.primarySet, { name: s.name }) : t.primaryCleared });
    },
    onError: toastMutationError(t.actionFailed),
  });

  if (settings.isError || codeSets.isError)
    return <LoadError title={t.loadError} onRetry={() => void Promise.all([settings.refetch(), codeSets.refetch()])} />;
  if (!settings.data || !codeSets.data) return <SkeletonCard />;

  const mode: CatalogMode = settings.data.effectiveMode;
  const isSetUp = settings.data.setupAt !== null;
  const setup = setupOpen && (
    <SetupWizard
      prefix={settings.data.itemNoPrefix}
      onClose={() => setSetupOpen(false)}
      onSharedDone={() => router.replace(`${pathname}?tab=import`, { scroll: false })}
    />
  );

  if (!isSetUp && sets.length === 0)
    return (
      <>
        <EmptyState
          icon={<Layers />}
          title={t.emptyTitle}
          description={access.isAdmin ? t.emptyDescription : t.emptyDescriptionViewer}
          {...(access.isAdmin ? { action: <Button leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setSetupOpen(true)}>{t.setup}</Button> } : {})}
        />
        {setup}
      </>
    );

  // Bộ nguồn gốc: chỉ bộ nội bộ; Quản trị/Chủ hoặc người phụ trách bộ đó.
  const sourceAction = (s: CodeSet): RowAction[] =>
    isInternal(s) && access.managesSet(s.id)
      ? [s.isSource
          ? { id: "reapply-source", label: ts.reapply, icon: <RefreshCw />, quick: false, onSelect: () => setSourceFor(s) }
          : { id: "make-source", label: ts.makeSource, icon: <Crown />, quick: false, onSelect: () => setSourceFor(s) }]
      : [];
  const actionsFor = (s: CodeSet): RowAction[] => [
    ...(access.isAdmin
      ? [
          { id: "edit", label: t.edit, icon: <Pencil />, onSelect: () => setEditing(s) },
          s.isPrimaryDisplay
            ? { id: "unprimary", label: t.clearPrimary, icon: <StarOff />, quick: false, disabled: primary.isPending, onSelect: () => primary.mutate(null) }
            : { id: "primary", label: t.makePrimary, icon: <Star />, quick: false, disabled: primary.isPending, onSelect: () => primary.mutate(s) },
        ]
      : []),
    ...sourceAction(s),
  ];
  const hasRowActions = access.isAdmin || sets.some((s) => sourceAction(s).length > 0);

  return (
    <Stack gap="md">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm text-fg-muted">{t.modeLabel}</span>
            <span className="font-medium text-fg">{mode === "SHARED" ? t.modeSHARED : t.modePER_DEPARTMENT}</span>
            <span className="text-sm text-fg-muted">{mode === "SHARED" ? t.modeSHAREDHint : t.modePER_DEPARTMENTHint}</span>
            <span className="text-sm text-fg-muted">{fill(t.prefixInfo, { prefix: settings.data.itemNoPrefix })}</span>
          </div>
          {access.isAdmin && (
            isSetUp ? (
              <Button variant="secondary" leftIcon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => setChanging(true)}>{t.changeMode}</Button>
            ) : (
              <Button leftIcon={<Settings2 className="h-4 w-4" />} onClick={() => setSetupOpen(true)}>{t.setup}</Button>
            )
          )}
        </CardContent>
      </Card>

      <DataTable
        aria-label={t.tableLabel}
        columns={columns}
        data={rows}
        getRowId={(s) => s.id}
        rowLabel={(s) => s.name}
        pagination={false}
        emptyTitle={t.emptyTitle}
        {...(access.isAdmin ? { toolbarActions: <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>{t.add}</Button> } : {})}
        {...(hasRowActions
          ? {
              rowActions: (s: SetRow) => {
                const actions = actionsFor(s);
                return actions.length ? <RowActions rowLabel={s.name} actions={actions} /> : null;
              },
            }
          : {})}
      />

      {editing && <CodeSetDialog set={editing === "new" ? null : editing} mode={mode} onClose={() => setEditing(null)} />}
      {sourceFor && <SetSourceDialog set={sourceFor} sets={sets} access={access} onClose={() => setSourceFor(null)} />}
      {changing && <ChangeModeDialog mode={mode} sets={sets} onClose={() => setChanging(false)} />}
      {setup}
    </Stack>
  );
}

/** Đổi chế độ (spec §3): sang PER_DEPARTMENT chọn bộ "Mã chung" thành bộ nào; về SHARED chỉ khi còn đúng một bộ nội bộ. */
function ChangeModeDialog({ mode, sets, onClose }: { mode: CatalogMode; sets: readonly CodeSet[]; onClose: () => void }) {
  const t = useMessages(CATALOG_SETS_MESSAGES);
  const qc = useQueryClient();
  const [becomes, setBecomes] = useState<"ACCOUNTING" | "WAREHOUSE" | "CUSTOMS">("CUSTOMS");
  const internal = sets.filter(isInternal);
  const shared = sets.find((s) => s.kind === "SHARED");
  const toShared = mode === "PER_DEPARTMENT";
  const blocked = toShared ? internal.length !== 1 : !shared;
  const change = useMutation({
    mutationFn: () => changeCatalogMode(toShared ? { to: "SHARED" } : { to: "PER_DEPARTMENT", sharedBecomes: becomes }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: t.changed });
      onClose();
    },
  });
  const options = (["ACCOUNTING", "WAREHOUSE", "CUSTOMS"] as const).map((k) => ({ value: k, label: t[`becomes${k}`] }));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.changeTitle} description={toShared ? t.changeToShared : t.changeToPer} icon={<ArrowLeftRight className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocked) change.mutate();
          }}
        >
          <Stack gap="md">
            {change.isError && <Alert tone="danger">{errorText(change.error, getFormatLocale(), t.actionFailed)}</Alert>}
            {toShared ? (
              blocked ? (
                <Alert tone="warning">{fill(t.toSharedBlocked, { n: internal.length })}</Alert>
              ) : (
                <p className="text-sm text-fg">{fill(t.toSharedNote, { name: internal[0]!.name })}</p>
              )
            ) : (
              <>
                <RadioGroup label={fill(t.sharedBecomes, { name: shared?.name ?? t.defaultNameSHARED })} options={options} value={becomes} onChange={setBecomes} />
                {becomes !== "CUSTOMS" && <p className="text-sm text-fg-muted">{t.newCustomsNote}</p>}
                <p className="text-sm text-fg-muted">{t.keepAliasesNote}</p>
              </>
            )}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={change.isPending} disabled={blocked}>{t.changeConfirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
