"use client";
// Dạy khai báo: tờ khai đã thông quan → so với tờ khai nháp → bài học (duyệt / sửa / tắt) → bật dùng bài học; tải bộ quy tắc .md.
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  createDataTableColumnHelper,
  DataTable,
  Dialog,
  DialogContent,
  DialogFooter,
  EmptyState,
  Field,
  FileDropzone,
  Grid,
  Input,
  PageHeader,
  Progress,
  RowActions,
  SegmentedControl,
  SkeletonStats,
  Stack,
  StatCard,
  StatusBadge,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  fill,
  pickMessages,
  toast,
  useMessages,
  useUiLocale,
  type Status,
} from "@kb/ui";
import {
  LESSON_AUTO_FILL_AFTER,
  type DocKind,
  type Lesson,
  type LessonContext,
  type TeachFieldDiff,
  type TeachLineDiff,
  type TeachSample,
} from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpenCheck,
  Check,
  Download,
  Eye,
  FileCheck2,
  GraduationCap,
  Pencil,
  Power,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { getSession, sessionKeys } from "@/api/session";
import {
  approveLessons,
  deleteTeachSample,
  downloadTeachRules,
  getTeachComparison,
  getTeachOverview,
  retryTeachSample,
  setTeachEnabled,
  teachKeys,
  updateLesson,
  uploadTeachSamples,
} from "@/api/teach";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { CONTEXT_LABELS, TEACH_MESSAGES } from "./teach.messages";

type T = (typeof TEACH_MESSAGES)["vi"];
type Tab = "samples" | "lessons" | "accuracy";
const TABS: Tab[] = ["samples", "lessons", "accuracy"];
type Filter = "PENDING" | "ACTIVE" | "OFF";

const SAMPLE_STATUS: Record<TeachSample["status"], Status> = {
  UPLOADED: "DOC_QUEUED",
  READING: "DOC_READING",
  READ: "DOC_DONE",
  FAILED: "DOC_ERROR",
};
const LESSON_STATUS: Record<Lesson["status"], Status> = {
  PENDING: "LESSON_PENDING",
  ACTIVE: "LESSON_ACTIVE",
  OFF: "LESSON_OFF",
};
const pct = (matched: number, total: number) =>
  `${formatNumber((matched / total) * 100, 1)}%`;

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function useRole() {
  const s = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = s.data?.user.role;
  return {
    isAdmin: role === "OWNER" || role === "ADMIN",
    canTeach: !!role && role !== "VIEWER",
  };
}

/** "Chi cục 02DS · Phương thức AIR · Hãng vận chuyển FEDEX" – mã hàng hiện ở cột giá trị. */
function contextText(
  c: LessonContext,
  labels: Record<keyof LessonContext, string>,
  always: string,
) {
  const parts = (Object.entries(c) as [keyof LessonContext, string][])
    .filter(([k]) => k !== "partNo")
    .map(([k, v]) => `${labels[k]} ${v}`);
  return parts.length ? parts.join(" · ") : always;
}

// ---------------------------------------------------------------- so sánh

function ComparisonDialog({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const t = useMessages(TEACH_MESSAGES);
  const docs = useMessages(DOC_KIND_LABELS);
  const q = useQuery({
    queryKey: teachKeys.comparison(id ?? ""),
    queryFn: () => getTeachComparison(id!),
    enabled: !!id,
  });
  const { fieldColumns, lineColumns } = useMemo(() => {
    const fieldCol = createDataTableColumnHelper<TeachFieldDiff>();
    const lineCol = createDataTableColumnHelper<TeachLineDiff>();
    const cell = (v: string) =>
      v ? (
        <span className="break-words">{v}</span>
      ) : (
        <span className="text-fg-subtle">{t.empty}</span>
      );
    const fieldColumns = fieldCol.columns([
      fieldCol.accessor("label", {
        header: t.colField,
        meta: { wrap: true },
        cell: (c) => <span className="font-medium">{c.getValue()}</span>,
      }),
      fieldCol.accessor("draft", {
        header: t.colDraft,
        meta: { wrap: true },
        cell: (c) => cell(c.getValue()),
      }),
      fieldCol.accessor("real", {
        header: t.colReal,
        meta: { wrap: true },
        cell: (c) => cell(c.getValue()),
      }),
      fieldCol.accessor("kind", {
        header: t.colResult,
        cell: (c) => {
          const f = c.row.original;
          if (f.kind === "MATCH")
            return <StatusBadge status="PASS" label={t.match} />;
          if (f.kind === "DOCUMENT")
            return (
              <StatusBadge
                status="TEACH_DOCUMENT"
                label={fill(t.foundIn, {
                  docs: f.foundIn
                    .map((k) => docs[k as DocKind] ?? k)
                    .join(", "),
                })}
              />
            );
          return <StatusBadge status="TEACH_KNOWLEDGE" />;
        },
      }),
    ]);
    const lineColumns = lineCol.columns([
      lineCol.accessor("lineNo", { header: t.colLine, meta: { align: "end" } }),
      lineCol.accessor((l) => `${l.draftHs} → ${l.realHs}`, {
        id: "hs",
        header: "HS",
        cell: (c) => (
          <Pair a={c.row.original.draftHs} b={c.row.original.realHs} />
        ),
      }),
      lineCol.accessor("realDescription", {
        header: t.colReal,
        meta: { wrap: true },
        cell: (c) => cell(c.getValue()),
      }),
      lineCol.accessor((l) => l.realImportRate, {
        id: "imp",
        header: fill(t.importRate, { rate: "" }).replace(/\s*%$/, ""),
        cell: (c) => (
          <Pair
            a={c.row.original.draftImportRate}
            b={c.row.original.realImportRate}
          />
        ),
      }),
      lineCol.accessor((l) => l.realVatRate, {
        id: "vat",
        header: fill(t.vatRate, { rate: "" }).replace(/\s*%$/, ""),
        cell: (c) => (
          <Pair
            a={c.row.original.draftVatRate}
            b={c.row.original.realVatRate}
          />
        ),
      }),
    ]);
    return { fieldColumns, lineColumns };
  }, [t, docs]);
  const s = q.data?.sample;
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        size="xl"
        title={t.cmpTitle}
        icon={<FileCheck2 />}
        {...(s
          ? {
              description: fill(t.cmpSubtitle, {
                no: s.declarationNo ?? "—",
                dossier: s.dossierCode ?? "—",
              }),
            }
          : {})}
      >
        {q.isError ? (
          <LoadError onRetry={() => q.refetch()} />
        ) : !q.data ? (
          <SkeletonStats />
        ) : !q.data.fields.length && !q.data.lines.length ? (
          <Alert tone="info" title={t.cmpNoDossier} />
        ) : (
          <Stack gap="md">
            <h3 className="text-sm font-semibold text-fg">{t.cmpFields}</h3>
            <DataTable
              aria-label={t.cmpFieldsAria}
              columns={fieldColumns}
              data={q.data.fields}
              getRowId={(f) => f.code}
              pagination={false}
              rowTone={(f) => (f.kind === "MATCH" ? undefined : "warning")}
            />
            {q.data.lines.length > 0 && (
              <>
                <h3 className="text-sm font-semibold text-fg">{t.cmpLines}</h3>
                <DataTable
                  aria-label={t.cmpLinesAria}
                  columns={lineColumns}
                  data={q.data.lines}
                  getRowId={(l) => String(l.lineNo)}
                  pagination={false}
                />
              </>
            )}
          </Stack>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Giá trị app ↔ tờ khai thật: khớp → một giá trị; lệch → gạch giá trị app. */
function Pair({ a, b }: { a: string; b: string }) {
  if (a === b) return <span>{b || "—"}</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-fg-subtle line-through">{a || "—"}</span>{" "}
      <span className="font-medium text-warning">{b || "—"}</span>
    </span>
  );
}

// ---------------------------------------------------------------- tờ khai mẫu

function SamplesTab({
  samples,
  canTeach,
}: {
  samples: TeachSample[];
  canTeach: boolean;
}) {
  const t = useMessages(TEACH_MESSAGES);
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: teachKeys.all });
  const [viewing, setViewing] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<TeachSample | null>(null);
  const upload = useMutation({
    mutationFn: (files: File[]) => uploadTeachSamples(files),
    onSuccess: (rows) => {
      void invalidate();
      toast({
        tone: "success",
        title: fill(t.uploaded, { n: rows.length }),
        description: t.uploadedDesc,
      });
    },
    onError: toastMutationError(t.uploadError),
  });
  const retry = useMutation({
    mutationFn: retryTeachSample,
    onSuccess: () => {
      void invalidate();
      toast({ tone: "success", title: t.recompareToast });
    },
    onError: toastMutationError(t.recompareError),
  });
  const remove = useMutation({
    mutationFn: deleteTeachSample,
    onSuccess: () => {
      void invalidate();
      setToDelete(null);
      toast({ tone: "success", title: t.deleted });
    },
    onError: toastMutationError(t.deleteError),
  });
  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<TeachSample>();
    return col.columns([
      col.accessor((s) => s.declarationNo ?? s.fileName, {
        id: "file",
        header: t.colFile,
        meta: { sticky: true, wrap: true },
        cell: (c) => (
          <div className="min-w-40">
            <p className="font-mono text-sm font-medium text-fg">
              {c.row.original.declarationNo ?? "—"}
            </p>
            <p className="truncate text-xs text-fg-subtle">
              {c.row.original.fileName}
            </p>
          </div>
        ),
      }),
      col.accessor((s) => s.dossierCode ?? "", {
        id: "dossier",
        header: t.colDossier,
        meta: { wrap: true },
        cell: (c) =>
          c.row.original.dossierId ? (
            <Link
              href={`/dossiers/${c.row.original.dossierId}`}
              className="font-mono text-sm text-primary hover:underline"
            >
              {c.row.original.dossierCode}
            </Link>
          ) : c.row.original.status === "READ" ? (
            <span className="text-sm text-fg-muted">{t.noDossier}</span>
          ) : (
            "—"
          ),
      }),
      col.accessor((s) => (s.total ? s.matched! / s.total : -1), {
        id: "match",
        header: t.colMatch,
        meta: { align: "end" },
        cell: (c) =>
          c.row.original.total
            ? `${pct(c.row.original.matched ?? 0, c.row.original.total)} (${c.row.original.matched}/${c.row.original.total})`
            : "—",
      }),
      col.accessor("lessons", {
        header: t.colLessons,
        meta: { align: "end" },
        cell: (c) => formatNumber(c.getValue()),
      }),
      col.accessor("status", {
        header: t.colStatus,
        cell: (c) => (
          <div className="min-w-28">
            <StatusBadge status={SAMPLE_STATUS[c.getValue()]} />
            {c.row.original.error && (
              <p className="mt-1 text-xs text-danger">{c.row.original.error}</p>
            )}
          </div>
        ),
      }),
      col.accessor("createdAt", {
        header: t.colUploaded,
        cell: (c) => (
          <span className="text-fg-muted">{formatRelative(c.getValue())}</span>
        ),
      }),
    ]);
  }, [t]);
  return (
    <Stack gap="md" className="pt-4">
      {canTeach && (
        <Stack gap="xs">
          <FileDropzone
            accept=".pdf,.jpg,.jpeg,.png"
            multiple
            maxFiles={50}
            maxSize={20 * 1024 * 1024}
            disabled={upload.isPending}
            onFiles={(files) => upload.mutate(files)}
            onReject={(r) =>
              toast({
                tone: "warning",
                title: fill(t.rejected, { n: r.length }),
                description: t.rejectedDesc,
              })
            }
          />
          <p className="text-sm text-fg-muted">{t.dropHint}</p>
        </Stack>
      )}
      <DataTable
        aria-label={t.samplesAria}
        columns={columns}
        data={samples}
        getRowId={(s) => s.id}
        onRowClick={(s) => s.status === "READ" && setViewing(s.id)}
        emptyTitle={t.samplesEmpty}
        emptyDescription={t.samplesEmptyDesc}
        rowActions={(s) => (
          <RowActions
            rowLabel={s.declarationNo ?? s.fileName}
            actions={[
              ...(s.status === "READ"
                ? [
                    {
                      id: "view",
                      label: t.viewComparison,
                      icon: <Eye />,
                      onSelect: () => setViewing(s.id),
                    },
                  ]
                : []),
              ...(canTeach
                ? [
                    {
                      id: "retry",
                      label: t.recompare,
                      icon: <RefreshCw />,
                      onSelect: () => retry.mutate(s.id),
                    },
                    {
                      id: "delete",
                      label: t.deleteSample,
                      icon: <Trash2 />,
                      tone: "danger" as const,
                      onSelect: () => setToDelete(s),
                    },
                  ]
                : []),
            ]}
          />
        )}
      />
      <ComparisonDialog id={viewing} onClose={() => setViewing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.deleteTitle}
        icon={<Trash2 />}
        subject={toDelete?.declarationNo ?? toDelete?.fileName}
        confirmLabel={t.deleteConfirm}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        {t.deleteBody}
      </ConfirmDialog>
    </Stack>
  );
}

// ---------------------------------------------------------------- bài học

function EditLessonDialog({
  lesson,
  onClose,
}: {
  lesson: Lesson | null;
  onClose: () => void;
}) {
  const t = useMessages(TEACH_MESSAGES);
  const qc = useQueryClient();
  const [value, setValue] = useState("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (lesson && shownFor !== lesson.id) {
    setShownFor(lesson.id);
    setValue(lesson.value);
  }
  const save = useMutation({
    mutationFn: () => updateLesson(lesson!.id, { value: value.trim() }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: teachKeys.all });
      toast({ tone: "success", title: t.updated });
      onClose();
    },
    onError: toastMutationError(t.updateError),
  });
  return (
    <Dialog open={!!lesson} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={t.editTitle}
        icon={<Pencil />}
        {...(lesson ? { description: lesson.label } : {})}
      >
        <Field
          label={t.editLabel}
          hint={lesson?.kind === "LINE" ? t.editHelpLine : t.editHelpField}
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={500}
          />
        </Field>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t.cancel}
          </Button>
          <Button
            loading={save.isPending}
            disabled={!value.trim()}
            onClick={() => save.mutate()}
          >
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonValue({ l, t }: { l: Lesson; t: T }) {
  if (l.kind === "LINE" && l.line) {
    return (
      <div className="min-w-64 max-w-xl">
        <p className="font-mono text-sm font-medium text-fg">
          {fill(t.hsLabel, { hs: l.value })} ·{" "}
          {l.context.partNo?.replace(/^[PD]:/, "")}
        </p>
        {l.line.description && (
          <p className="text-sm text-fg-muted">{l.line.description}</p>
        )}
        <p className="text-xs text-fg-subtle">
          {[
            l.line.importRate !== null
              ? fill(t.importRate, { rate: l.line.importRate })
              : null,
            l.line.importTaxSchedule,
            l.line.vatRate !== null
              ? fill(t.vatRate, { rate: l.line.vatRate })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    );
  }
  return <p className="min-w-48 max-w-xl text-sm text-fg">{l.value}</p>;
}

function LessonsTab({
  lessons,
  canTeach,
}: {
  lessons: Lesson[];
  canTeach: boolean;
}) {
  const t = useMessages(TEACH_MESSAGES);
  const ctxLabels = useMessages(CONTEXT_LABELS);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("status");
  const filter: Filter = raw === "ACTIVE" || raw === "OFF" ? raw : "PENDING";
  const setFilter = (f: Filter) =>
    router.replace(`${pathname}?tab=lessons&status=${f}`, { scroll: false });
  const [editing, setEditing] = useState<Lesson | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: teachKeys.all });
  const approve = useMutation({
    mutationFn: approveLessons,
    onSuccess: (n) => {
      void invalidate();
      toast({ tone: "success", title: fill(t.approved, { n }) });
    },
    onError: toastMutationError(t.approveError),
  });
  const setStatus = useMutation({
    mutationFn: (x: { id: string; status: Lesson["status"] }) =>
      updateLesson(x.id, { status: x.status }),
    onSuccess: () => {
      void invalidate();
      toast({ tone: "success", title: t.updated });
    },
    onError: toastMutationError(t.updateError),
  });
  const columns = useMemo(() => {
    const kindLabel = (l: Lesson) =>
      l.kind === "LINE"
        ? t.kindLine
        : l.kind === "CLAUSE"
          ? t.kindClause
          : t.kindField;
    const col = createDataTableColumnHelper<Lesson>();
    return col.columns([
      col.accessor("label", {
        header: t.colLesson,
        meta: { wrap: true },
        cell: (c) => (
          <div className="min-w-40">
            <p className="text-sm font-medium text-fg">{c.getValue()}</p>
            <p className="text-xs text-fg-subtle">
              {kindLabel(c.row.original)}
            </p>
          </div>
        ),
      }),
      col.accessor((l) => contextText(l.context, ctxLabels, t.always), {
        id: "when",
        header: t.colWhen,
        meta: { wrap: true },
        cell: (c) => (
          <span className="text-sm text-fg-muted">{c.getValue()}</span>
        ),
      }),
      col.accessor("value", {
        header: t.colValue,
        meta: { wrap: true },
        cell: (c) => <LessonValue l={c.row.original} t={t} />,
      }),
      col.accessor("hits", {
        header: t.colHits,
        cell: (c) => {
          const l = c.row.original;
          return (
            <div className="min-w-32">
              {l.autoFill ? (
                <Badge tone="success" icon={<Check />}>
                  {t.autoFill}
                </Badge>
              ) : (
                <span className="text-sm">
                  {fill(t.needCheck, {
                    n: l.hits,
                    min: LESSON_AUTO_FILL_AFTER,
                  })}
                </span>
              )}
              {l.conflicts.length > 0 && (
                <p className="mt-1 text-xs text-warning">
                  {fill(t.conflicts, {
                    values: l.conflicts
                      .map((x) => `${x.value} ×${x.hits}`)
                      .join("; "),
                  })}
                </p>
              )}
              {l.lastDeclarationNo && (
                <p className="text-xs text-fg-subtle">
                  {fill(t.fromDecl, { no: l.lastDeclarationNo })}
                </p>
              )}
            </div>
          );
        },
      }),
      col.accessor("status", {
        header: t.colStatus,
        cell: (c) => <StatusBadge status={LESSON_STATUS[c.getValue()]} />,
      }),
    ]);
  }, [t, ctxLabels]);
  const shown = useMemo(
    () => lessons.filter((l) => l.status === filter),
    [lessons, filter],
  );
  const count = (s: Filter) => lessons.filter((l) => l.status === s).length;
  return (
    <Stack gap="md" className="pt-4">
      <p className="text-sm text-fg-muted">
        {fill(t.lessonsHint, { min: LESSON_AUTO_FILL_AFTER })}
      </p>
      <SegmentedControl
        label={t.filterAria}
        hideLabel
        value={filter}
        onChange={setFilter}
        options={[
          {
            value: "PENDING",
            label: `${t.filterPending} (${count("PENDING")})`,
          },
          { value: "ACTIVE", label: `${t.filterActive} (${count("ACTIVE")})` },
          { value: "OFF", label: `${t.filterOff} (${count("OFF")})` },
        ]}
        className="justify-start"
      />
      <DataTable
        aria-label={t.lessonsAria}
        columns={columns}
        data={shown}
        getRowId={(l) => l.id}
        rowLabel={(l) => `${l.label} ${l.value}`}
        searchable
        selectable={canTeach && filter === "PENDING"}
        selectionActions={(rows, clear) => (
          <Button
            size="sm"
            leftIcon={<Check className="h-4 w-4" />}
            loading={approve.isPending}
            onClick={() =>
              approve.mutate(
                rows.map((r) => r.id),
                { onSuccess: clear },
              )
            }
          >
            {fill(t.approveSelected, { n: rows.length })}
          </Button>
        )}
        emptyTitle={t.lessonsEmpty}
        emptyDescription={t.lessonsEmptyDesc}
        {...(canTeach
          ? {
              rowActions: (l: Lesson) => (
                <RowActions
                  rowLabel={`${l.label} ${l.value}`}
                  actions={[
                    ...(l.status !== "ACTIVE"
                      ? [
                          {
                            id: "approve",
                            label: l.status === "OFF" ? t.turnOn : t.approve,
                            icon: <Check />,
                            onSelect: () =>
                              setStatus.mutate({ id: l.id, status: "ACTIVE" }),
                          },
                        ]
                      : []),
                    {
                      id: "edit",
                      label: t.editValue,
                      icon: <Pencil />,
                      onSelect: () => setEditing(l),
                    },
                    ...(l.status !== "OFF"
                      ? [
                          {
                            id: "off",
                            label: t.turnOff,
                            icon: <Power />,
                            tone: "danger" as const,
                            onSelect: () =>
                              setStatus.mutate({ id: l.id, status: "OFF" }),
                          },
                        ]
                      : []),
                  ]}
                />
              ),
            }
          : {})}
      />
      <EditLessonDialog lesson={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}

// ---------------------------------------------------------------- độ chính xác

function AccuracyTab({
  points,
}: {
  points: { month: string; matched: number; total: number; samples: number }[];
}) {
  const t = useMessages(TEACH_MESSAGES);
  const columns = useMemo(() => {
    const col = createDataTableColumnHelper<(typeof points)[number]>();
    return col.columns([
      col.accessor("month", {
        header: t.colMonth,
        cell: (c) => <span className="font-mono">{c.getValue()}</span>,
      }),
      col.accessor("samples", {
        header: t.colSamplesCount,
        meta: { align: "end" },
      }),
      col.accessor((p) => `${p.matched}/${p.total}`, {
        id: "cells",
        header: t.colCells,
        meta: { align: "end" },
      }),
      col.accessor((p) => p.matched / p.total, {
        id: "pct",
        header: t.colPercent,
        cell: (c) => (
          <Progress
            className="min-w-40"
            value={Math.round(c.getValue() * 1000) / 10}
            showValue
            aria-label={pct(c.row.original.matched, c.row.original.total)}
          />
        ),
      }),
    ]);
  }, [t]);
  if (!points.length)
    return (
      <EmptyState
        icon={<Target className="h-6 w-6" />}
        title={t.accuracyEmpty}
        description={t.accuracyEmptyDesc}
      />
    );
  return (
    <div className="pt-4">
      <DataTable
        aria-label={t.accuracyAria}
        columns={columns}
        data={points}
        getRowId={(p) => p.month}
        pagination={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------- trang

function TeachInner() {
  const t = useMessages(TEACH_MESSAGES);
  const locale = useUiLocale();
  const { isAdmin, canTeach } = useRole();
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab)
    ? (params.get("tab") as Tab)
    : "samples";
  const q = useQuery({
    queryKey: teachKeys.overview,
    queryFn: getTeachOverview,
    // Còn tờ khai đang đọc → hỏi lại mỗi 3 giây đến khi xong.
    refetchInterval: (query) =>
      query.state.data?.samples.some(
        (s) => s.status === "UPLOADED" || s.status === "READING",
      )
        ? 3000
        : false,
  });
  const toggle = useMutation({
    mutationFn: setTeachEnabled,
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: teachKeys.all });
      toast({
        tone: "success",
        title: s.enabled ? t.enabledToast : t.disabledToast,
      });
    },
    onError: toastMutationError(t.toggleError),
  });
  const download = useMutation({
    mutationFn: downloadTeachRules,
    onSuccess: ({ blob, fileName }) => saveBlob(blob, fileName),
    onError: toastMutationError(t.exportError),
  });
  const d = q.data;
  const kpis = useMemo(() => {
    if (!d) return null;
    const active = d.lessons.filter((l) => l.status === "ACTIVE");
    const last = d.accuracy.at(-1);
    return {
      samples: d.samples.length,
      matched: d.samples.filter((s) => s.dossierId).length,
      pending: d.lessons.filter((l) => l.status === "PENDING").length,
      active: active.length,
      auto: active.filter((l) => l.autoFill).length,
      last,
    };
  }, [d]);
  const tm = pickMessages(TEACH_MESSAGES, locale);

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {d && (
              <label
                className="flex items-center gap-2 text-sm text-fg"
                title={isAdmin ? undefined : t.useLessonsHint}
              >
                <Switch
                  checked={
                    toggle.isPending ? !!toggle.variables : d.settings.enabled
                  }
                  onCheckedChange={(v) => toggle.mutate(v)}
                  disabled={!isAdmin || toggle.isPending}
                  aria-label={t.useLessons}
                />
                {t.useLessons}
              </label>
            )}
            <Button
              variant="secondary"
              leftIcon={<Download className="h-4 w-4" />}
              loading={download.isPending}
              onClick={() => download.mutate()}
            >
              {t.exportRules}
            </Button>
          </div>
        }
      />
      {q.isError ? (
        <LoadError onRetry={() => q.refetch()} />
      ) : !kpis || !d ? (
        <SkeletonStats />
      ) : (
        <>
          <Grid cols={{ base: 2, xl: 4 }} stagger>
            <StatCard
              icon={<FileCheck2 />}
              label={t.kpiSamples}
              value={kpis.samples}
              hint={fill(t.kpiSamplesHint, { n: kpis.matched })}
            />
            <StatCard
              icon={<GraduationCap />}
              tone={kpis.pending ? "warning" : "neutral"}
              label={t.kpiPending}
              value={kpis.pending}
              hint={t.kpiPendingHint}
            />
            <StatCard
              icon={<BookOpenCheck />}
              tone="success"
              label={t.kpiActive}
              value={kpis.active}
              hint={fill(t.kpiActiveHint, {
                n: kpis.auto,
                min: LESSON_AUTO_FILL_AFTER,
              })}
            />
            <StatCard
              icon={<Target />}
              tone="info"
              label={t.kpiAccuracy}
              value={kpis.last ? pct(kpis.last.matched, kpis.last.total) : "—"}
              hint={tm.kpiAccuracyHint}
            />
          </Grid>
          <Tabs
            value={tab}
            onValueChange={(v) =>
              router.replace(`${pathname}?tab=${v}`, { scroll: false })
            }
          >
            <TabsList aria-label={t.tabsAria}>
              <TabsTrigger value="samples">
                {t.tabSamples} <Badge tone="neutral">{d.samples.length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="lessons">
                {t.tabLessons}{" "}
                {kpis.pending > 0 && (
                  <Badge tone="warning">{kpis.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="accuracy">{t.tabAccuracy}</TabsTrigger>
            </TabsList>
            <TabsContent value="samples">
              <SamplesTab samples={d.samples} canTeach={canTeach} />
            </TabsContent>
            <TabsContent value="lessons">
              <LessonsTab lessons={d.lessons} canTeach={canTeach} />
            </TabsContent>
            <TabsContent value="accuracy">
              <AccuracyTab points={d.accuracy} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </Stack>
  );
}

export function TeachPage() {
  return (
    <Suspense>
      <TeachInner />
    </Suspense>
  );
}
