"use client";
// Bước 2 – upload bộ chứng từ, hai cách trên cùng một màn:
//  - thả cả bộ (nhiều file hoặc .zip): hệ thống tự nhận loại và xếp vào đúng ô;
//  - thả/chọn file trong ô của từng loại: file vào thẳng loại đó (bổ sung, chứng từ gửi lẻ).
// File nhận sai loại: đổi loại ngay trên dòng → file chuyển sang ô kia. Thiếu chứng từ "cần có" chỉ cảnh báo, không chặn
// (lô thật hay thiếu Packing List) – các trường liên quan được đánh dấu để bổ sung ở bước sau.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FileDropzone, Grid, Progress,
  Select, Skeleton, Spinner, Stack, fill, toast, useMessages, useUiLocale, type Tone,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleAlert, CircleDashed, FileText, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { dossierKeys } from "@/api/dossiers";
import { changeDocumentKind, deleteDocument, finishReading, listDossierDocuments, ocrKeys, uploadDocuments } from "@/api/ocr";
import { formatBytesVi } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { DOC_KIND_LABELS, STEP_ORDER, type DocKind, type DossierDocument } from "@/mocks/types";
import type { StepProps } from "./types";
import { addableKinds, buildSlots, missingRequired, suggestedKinds, type DocSlot } from "./upload-slots";
import { UPLOAD_STEP_MESSAGES } from "./upload-step.messages";

type Tm = Record<keyof (typeof UPLOAD_STEP_MESSAGES)["vi"], string>;

const status = (t: Tm): Record<DossierDocument["status"], { label: string; tone: Tone }> => ({
  UPLOADING: { label: t.statusUploading, tone: "info" },
  QUEUED: { label: t.statusQueued, tone: "neutral" },
  READING: { label: t.statusReading, tone: "info" },
  DONE: { label: t.statusDone, tone: "success" },
  ERROR: { label: t.statusError, tone: "danger" },
});

const KINDS = Object.keys(DOC_KIND_LABELS.vi) as DocKind[];

const ACCEPT_BULK = ".pdf,.jpg,.jpeg,.png,.zip";
// Ô của một loại không nhận .zip: zip thường chứa nhiều loại, thả vào ô sẽ ép tất cả thành một loại.
const ACCEPT_SLOT = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE = 30 * 1024 * 1024;

const slotBadge = (t: Tm): Record<DocSlot["need"], { label: string; tone: Tone } | null> => ({
  required: { label: t.needRequired, tone: "info" },
  optional: { label: t.needOptional, tone: "neutral" },
  extra: null,
  other: null,
});

function DocumentRow({ doc, dossierId }: { doc: DossierDocument; dossierId: string }) {
  const t = useMessages(UPLOAD_STEP_MESSAGES);
  const kindLabels = useMessages(DOC_KIND_LABELS);
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ocrKeys.documents(dossierId) });
    void qc.invalidateQueries({ queryKey: ocrKeys.fields(dossierId) });
    void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
  };
  const kind = useMutation({
    mutationFn: (k: DocKind) => changeDocumentKind(doc.id, k),
    onSuccess: (d) => {
      invalidate();
      toast({ tone: "success", title: fill(t.movedTo, { kind: kindLabels[d.kind] }), description: doc.fileName });
    },
    onError: toastMutationError(t.changeKindFailed),
  });
  const remove = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: () => {
      invalidate();
      toast({ tone: "info", title: t.deleted, description: doc.fileName });
    },
    onError: toastMutationError(t.deleteFailed),
  });
  const s = status(t)[doc.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 cq-sm:flex-nowrap">
      <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg" title={doc.fileName}>{doc.fileName}</p>
        <p className="text-xs text-fg-subtle">
          {fill(t.pages, { size: formatBytesVi(doc.sizeBytes), n: doc.pages })}
        </p>
      </div>
      <Select
        aria-label={fill(t.kindAria, { file: doc.fileName })}
        className="order-last h-8 w-full text-sm cq-sm:order-none cq-sm:w-48"
        options={KINDS.map((k) => ({ value: k, label: kindLabels[k] }))}
        value={doc.kind}
        disabled={kind.isPending}
        onChange={(e) => kind.mutate(e.target.value as DocKind)}
      />
      <Badge tone={s.tone} className="shrink-0">
        {doc.status === "READING" ? <Spinner size="sm" label={null} /> : doc.status === "DONE" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : null}
        {s.label}
      </Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={fill(t.deleteAria, { file: doc.fileName })} loading={remove.isPending} onClick={() => remove.mutate()}>
        {!remove.isPending && <Trash2 className="h-4 w-4" />}
      </Button>
    </li>
  );
}

/** Ô của một loại chứng từ: tình trạng, file đã có, vùng thả/chọn file vào thẳng loại này. */
function DocKindSlot({ slot, dossierId, disabled, onFiles }: { slot: DocSlot; dossierId: string; disabled: boolean; onFiles: (files: File[], kind: DocKind) => void }) {
  const t = useMessages(UPLOAD_STEP_MESSAGES);
  const kindLabels = useMessages(DOC_KIND_LABELS);
  const titleId = useId();
  const has = slot.docs.length > 0;
  const isOther = slot.need === "other";
  const label = isOther ? t.otherSlot : kindLabels[slot.kind];
  const badge = slotBadge(t)[slot.need];
  return (
    // @container: dòng file co theo bề rộng của ô, không theo cả trang.
    <section aria-labelledby={titleId} data-kind={slot.kind} className="@container flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-start gap-2">
        {isOther && has ? (
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning-subtle-fg" />
        ) : has ? (
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-subtle-fg" />
        ) : (
          <CircleDashed aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
        )}
        <div className="min-w-0 flex-1">
          <h4 id={titleId} className="text-sm font-semibold text-fg">
            {label}
            <span className="sr-only">{has ? fill(t.hasFiles, { n: slot.docs.length }) : t.noFiles}</span>
          </h4>
          <p className="text-sm text-fg-muted">
            {isOther ? t.otherHelp : (slot.reason ?? t.addedKindHelp)}
          </p>
        </div>
        {badge && <Badge tone={badge.tone} className="shrink-0">{badge.label}</Badge>}
      </div>
      {has && (
        <ul aria-label={fill(t.filesAria, { label })} className="divide-y divide-border rounded-md border border-border">
          {slot.docs.map((d) => (
            <DocumentRow key={d.id} doc={d} dossierId={dossierId} />
          ))}
        </ul>
      )}
      <FileDropzone
        size="sm"
        accept={ACCEPT_SLOT}
        maxSize={MAX_SIZE}
        maxFiles={10}
        disabled={disabled}
        labels={{ title: fill(has ? t.addFiles : t.dropFiles, { label }), browse: "" }}
        onFiles={(files) => onFiles(files, slot.kind)}
        onReject={(rejected) => toast({ tone: "danger", title: fill(t.invalidFiles, { n: rejected.length }), description: t.slotRejectDesc })}
      />
    </section>
  );
}

export function UploadStep({ dossier, goTo }: StepProps) {
  const t = useMessages(UPLOAD_STEP_MESSAGES);
  const kindLabels = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const docsQuery = useQuery({
    queryKey: ocrKeys.documents(dossier.id),
    queryFn: () => listDossierDocuments(dossier.id),
    // Còn chứng từ đang xử lý → hỏi lại mỗi giây để thấy tiến độ.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status !== "DONE" && d.status !== "ERROR") ? 1000 : false),
  });
  const docs = docsQuery.data ?? [];

  // kind: file thả vào ô của một loại → upload rồi gán đúng loại đó (cùng API đổi loại như khi người dùng tự chọn).
  const upload = useMutation({
    mutationFn: async ({ files, kind }: { files: File[]; kind?: DocKind }) => {
      const created = await uploadDocuments(dossier.id, files);
      if (!kind) return created;
      return Promise.all(created.map((d) => (d.kind === kind ? d : changeDocumentKind(d.id, kind))));
    },
    onSuccess: (created, { kind }) => {
      void qc.invalidateQueries({ queryKey: ocrKeys.documents(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      const unknown = created.filter((d) => d.kind === "OTHER").length;
      if (kind) toast({ tone: "success", title: fill(t.addedToKind, { n: created.length, kind: kindLabels[kind] }), description: t.aiReading });
      else if (unknown > 0) toast({ tone: "warning", title: fill(t.received, { n: created.length }), description: fill(t.unknownDesc, { n: unknown }) });
      else toast({ tone: "success", title: fill(t.received, { n: created.length }), description: t.sortedDesc });
    },
    onError: toastMutationError(t.uploadFailed),
  });

  const finish = useMutation({
    mutationFn: () => finishReading(dossier.id),
    onSuccess: (d) => {
      qc.setQueryData(dossierKeys.detail(d.id), d);
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      void qc.invalidateQueries({ queryKey: ocrKeys.fields(dossier.id) });
      void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossier.id) });
      goTo("ocr");
    },
    onError: toastMutationError(t.finishFailed),
  });

  const uploading = docs.filter((d) => d.status === "UPLOADING");
  const pending = docs.filter((d) => d.status !== "DONE" && d.status !== "ERROR");
  const done = docs.filter((d) => d.status === "DONE").length;
  const pastUpload = STEP_ORDER.indexOf(dossier.step) > STEP_ORDER.indexOf("upload");

  // Người dùng bấm "Bắt đầu đọc" khi còn file đang đọc → chờ đọc xong rồi tự sang bước 3.
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (waiting && docs.length > 0 && pending.length === 0 && !finish.isPending) {
      setWaiting(false);
      finish.mutate();
    }
  }, [waiting, docs.length, pending.length, finish]);

  const start = () => {
    if (pastUpload) return goTo("ocr");
    if (pending.length === 0) return finish.mutate();
    setWaiting(true);
    toast({ tone: "info", title: t.readingTitle, description: t.readingDesc });
  };

  const [addedKinds, setAddedKinds] = useState<DocKind[]>([]);
  const slots = buildSlots(suggestedKinds(dossier, locale), docs, addedKinds);
  const missing = missingRequired(slots);
  const addable = addableKinds(slots);
  const required = slots.filter((s) => s.need === "required");
  const isWaiting = waiting && pending.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 cq-lg:grid-cols-3">
      <Stack gap="md" className="cq-lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.bulkTitle}</CardTitle>
            <CardDescription>{t.bulkDesc}</CardDescription>
          </CardHeader>
          <CardContent>
            <FileDropzone
              accept={ACCEPT_BULK}
              maxSize={MAX_SIZE}
              maxFiles={20}
              disabled={upload.isPending}
              onFiles={(files) => upload.mutate({ files })}
              onReject={(rejected) => toast({ tone: "danger", title: fill(t.invalidFiles, { n: rejected.length }), description: t.bulkRejectDesc })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h3">{t.byKindTitle}</CardTitle>
            <CardDescription>
              {docs.length === 0
                ? fill(t.byKindEmpty, {
                    dossier: dossier.direction === "NK" ? t.importDossier : t.exportDossier,
                    type: dossier.typeCode,
                    incoterm: dossier.incoterm ? ` · ${dossier.incoterm}` : "",
                  })
                : fill(t.byKindSummary, { n: docs.length, pages: docs.reduce((n, d) => n + d.pages, 0), done })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {docsQuery.isLoading ? (
              <Grid cols={{ base: 1, md: 2 }}>
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-32" />
              </Grid>
            ) : docsQuery.isError ? (
              <Alert tone="danger" title={t.listFailed} action={<Button size="sm" variant="secondary" onClick={() => void docsQuery.refetch()}>{t.retry}</Button>} />
            ) : (
              <Stack gap="md">
                <Grid cols={{ base: 1, md: 2 }} className="items-start">
                  {slots.map((slot) => (
                    <DocKindSlot key={slot.kind} slot={slot} dossierId={dossier.id} disabled={upload.isPending} onFiles={(files, kind) => upload.mutate({ files, kind })} />
                  ))}
                </Grid>
                {addable.length > 0 && (
                  <Select
                    aria-label={t.addKindAria}
                    className="cq-sm:max-w-xs"
                    placeholder={t.addKindPlaceholder}
                    options={addable.map((k) => ({ value: k, label: kindLabels[k] }))}
                    value=""
                    onChange={(e) => {
                      const k = e.target.value as DocKind;
                      if (k) setAddedKinds((list) => [...list, k]);
                    }}
                  />
                )}
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Stack gap="md">
        <Card>
          <CardHeader>
            <CardTitle as="h3">{t.statusTitle}</CardTitle>
            <CardDescription>
              {fill(t.requiredCount, { have: required.length - missing.length, total: required.length })}
              {uploading.length > 0 ? fill(t.uploadingCount, { n: uploading.length }) : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              {docs.length > 0 && missing.length > 0 && (
                <Alert tone="warning" title={fill(t.missingTitle, { n: missing.length })}>
                  {fill(t.missingBody, { list: missing.map((m) => kindLabels[m.kind]).join(", ") })}
                </Alert>
              )}
              {pending.length > 0 && (
                <>
                  <p className="flex items-center gap-2 text-sm text-fg-muted">
                    <Spinner size="sm" label={null} /> {fill(t.readingProgress, { done, n: docs.length })}
                  </p>
                  <Progress value={docs.length ? Math.round((done / docs.length) * 100) : 0} aria-label={t.progressAria} />
                </>
              )}
              <Button
                fullWidth
                rightIcon={<ArrowRight className="h-4 w-4" />}
                disabled={docs.length === 0 || uploading.length > 0}
                loading={finish.isPending || isWaiting}
                onClick={start}
              >
                {pastUpload ? t.viewResults : pending.length > 0 ? t.startReading : t.viewResults}
              </Button>
              {docs.length === 0 && <p className="text-center text-xs text-fg-subtle">{t.needOne}</p>}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </div>
  );
}
