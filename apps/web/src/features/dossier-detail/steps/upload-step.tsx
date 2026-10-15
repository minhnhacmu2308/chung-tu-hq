"use client";
// Bước 2 – upload bộ chứng từ, hai cách trên cùng một màn:
//  - thả cả bộ (nhiều file hoặc .zip): hệ thống tự nhận loại và xếp vào đúng ô;
//  - thả/chọn file trong ô của từng loại: file vào thẳng loại đó (bổ sung, chứng từ gửi lẻ).
// File nhận sai loại: đổi loại ngay trên dòng → file chuyển sang ô kia. Thiếu chứng từ "cần có" chỉ cảnh báo, không chặn
// (lô thật hay thiếu Packing List) – các trường liên quan được đánh dấu để bổ sung ở bước sau.
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, FileDropzone, Grid, Progress,
  Select, Skeleton, Spinner, Stack, toast, type Tone,
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

const STATUS: Record<DossierDocument["status"], { label: string; tone: Tone }> = {
  UPLOADING: { label: "Đang tải lên", tone: "info" },
  QUEUED: { label: "Chờ đọc", tone: "neutral" },
  READING: { label: "AI đang đọc", tone: "info" },
  DONE: { label: "Đã đọc", tone: "success" },
  ERROR: { label: "Lỗi", tone: "danger" },
};

const KIND_OPTIONS = (Object.keys(DOC_KIND_LABELS) as DocKind[]).map((k) => ({ value: k, label: DOC_KIND_LABELS[k] }));

const ACCEPT_BULK = ".pdf,.jpg,.jpeg,.png,.zip";
// Ô của một loại không nhận .zip: zip thường chứa nhiều loại, thả vào ô sẽ ép tất cả thành một loại.
const ACCEPT_SLOT = ".pdf,.jpg,.jpeg,.png";
const MAX_SIZE = 30 * 1024 * 1024;

const SLOT_BADGE: Record<DocSlot["need"], { label: string; tone: Tone } | null> = {
  required: { label: "Cần có", tone: "info" },
  optional: { label: "Tùy lô", tone: "neutral" },
  extra: null,
  other: null,
};

function DocumentRow({ doc, dossierId }: { doc: DossierDocument; dossierId: string }) {
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
      toast({ tone: "success", title: `Đã chuyển sang ${DOC_KIND_LABELS[d.kind]}`, description: doc.fileName });
    },
    onError: toastMutationError("Không đổi được loại chứng từ"),
  });
  const remove = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: () => {
      invalidate();
      toast({ tone: "info", title: "Đã xóa chứng từ", description: doc.fileName });
    },
    onError: toastMutationError("Không xóa được chứng từ"),
  });
  const s = STATUS[doc.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 cq-sm:flex-nowrap">
      <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg" title={doc.fileName}>{doc.fileName}</p>
        <p className="text-xs text-fg-subtle">
          {formatBytesVi(doc.sizeBytes)} · {doc.pages} trang
        </p>
      </div>
      <Select
        aria-label={`Loại chứng từ của ${doc.fileName}`}
        className="order-last h-8 w-full text-sm cq-sm:order-none cq-sm:w-48"
        options={KIND_OPTIONS}
        value={doc.kind}
        disabled={kind.isPending}
        onChange={(e) => kind.mutate(e.target.value as DocKind)}
      />
      <Badge tone={s.tone} className="shrink-0">
        {doc.status === "READING" ? <Spinner size="sm" label={null} /> : doc.status === "DONE" ? <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" /> : null}
        {s.label}
      </Badge>
      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label={`Xóa ${doc.fileName}`} loading={remove.isPending} onClick={() => remove.mutate()}>
        {!remove.isPending && <Trash2 className="h-4 w-4" />}
      </Button>
    </li>
  );
}

/** Ô của một loại chứng từ: tình trạng, file đã có, vùng thả/chọn file vào thẳng loại này. */
function DocKindSlot({ slot, dossierId, disabled, onFiles }: { slot: DocSlot; dossierId: string; disabled: boolean; onFiles: (files: File[], kind: DocKind) => void }) {
  const titleId = useId();
  const has = slot.docs.length > 0;
  const isOther = slot.need === "other";
  const label = isOther ? "Khác / chưa nhận ra loại" : DOC_KIND_LABELS[slot.kind];
  const badge = SLOT_BADGE[slot.need];
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
            <span className="sr-only">{has ? ` – ${slot.docs.length} file` : " – chưa có"}</span>
          </h4>
          <p className="text-sm text-fg-muted">
            {isOther ? "Chọn đúng loại cho từng file; để “Khác” nếu là chứng từ phụ." : (slot.reason ?? "Loại bạn thêm cho hồ sơ này.")}
          </p>
        </div>
        {badge && <Badge tone={badge.tone} className="shrink-0">{badge.label}</Badge>}
      </div>
      {has && (
        <ul aria-label={`File ${label}`} className="divide-y divide-border rounded-md border border-border">
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
        labels={{ title: has ? `Thêm file ${label}` : `Thả hoặc chọn file ${label}`, browse: "" }}
        onFiles={(files) => onFiles(files, slot.kind)}
        onReject={(rejected) => toast({ tone: "danger", title: `${rejected.length} file không hợp lệ`, description: "Ô này nhận PDF, JPG, PNG tối đa 30 MB. File .zip thả vào vùng upload cả bộ ở trên." })}
      />
    </section>
  );
}

export function UploadStep({ dossier, goTo }: StepProps) {
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
      if (kind) toast({ tone: "success", title: `Đã thêm ${created.length} file vào ${DOC_KIND_LABELS[kind]}`, description: "AI đang đọc." });
      else if (unknown > 0) toast({ tone: "warning", title: `Đã nhận ${created.length} chứng từ`, description: `${unknown} file chưa nhận ra loại – chọn loại ở ô “Khác / chưa nhận ra loại”.` });
      else toast({ tone: "success", title: `Đã nhận ${created.length} chứng từ`, description: "Đã tự xếp vào đúng loại. AI đang đọc." });
    },
    onError: toastMutationError("Không tải lên được chứng từ"),
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
    onError: toastMutationError("Không chuyển sang bước đọc được"),
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
    toast({ tone: "info", title: "Đang đọc chứng từ", description: "Tự chuyển sang bước OCR & kiểm tra khi đọc xong." });
  };

  const [addedKinds, setAddedKinds] = useState<DocKind[]>([]);
  const slots = buildSlots(suggestedKinds(dossier), docs, addedKinds);
  const missing = missingRequired(slots);
  const addable = addableKinds(slots);
  const required = slots.filter((s) => s.need === "required");
  const isWaiting = waiting && pending.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 cq-lg:grid-cols-3">
      <Stack gap="md" className="cq-lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload cả bộ chứng từ</CardTitle>
            <CardDescription>
              Kéo thả nhiều PDF/ảnh hoặc một file .zip. Hệ thống tự tách trang, bỏ bản trùng (Original/Copy), nhận diện loại và xếp vào đúng ô bên dưới.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FileDropzone
              accept={ACCEPT_BULK}
              maxSize={MAX_SIZE}
              maxFiles={20}
              disabled={upload.isPending}
              onFiles={(files) => upload.mutate({ files })}
              onReject={(rejected) => toast({ tone: "danger", title: `${rejected.length} file không hợp lệ`, description: "Chỉ nhận PDF, JPG, PNG, ZIP tối đa 30 MB." })}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h3">Chứng từ theo loại</CardTitle>
            <CardDescription>
              {docs.length === 0
                ? `Theo ${dossier.direction === "NK" ? "hồ sơ nhập khẩu" : "hồ sơ xuất khẩu"} ${dossier.typeCode} · ${dossier.incoterm}. Có thể thả file thẳng vào từng ô.`
                : `${docs.length} chứng từ · ${docs.reduce((n, d) => n + d.pages, 0)} trang · đã đọc ${done}/${docs.length}. Nhận sai loại thì đổi loại ngay trên dòng.`}
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
              <Alert tone="danger" title="Không tải được danh sách chứng từ" action={<Button size="sm" variant="secondary" onClick={() => void docsQuery.refetch()}>Thử lại</Button>} />
            ) : (
              <Stack gap="md">
                <Grid cols={{ base: 1, md: 2 }} className="items-start">
                  {slots.map((slot) => (
                    <DocKindSlot key={slot.kind} slot={slot} dossierId={dossier.id} disabled={upload.isPending} onFiles={(files, kind) => upload.mutate({ files, kind })} />
                  ))}
                </Grid>
                {addable.length > 0 && (
                  <Select
                    aria-label="Thêm ô cho loại chứng từ khác"
                    className="cq-sm:max-w-xs"
                    placeholder="+ Thêm loại chứng từ khác…"
                    options={addable.map((k) => ({ value: k, label: k === "OTHER" ? "Khác" : DOC_KIND_LABELS[k] }))}
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
            <CardTitle as="h3">Tình trạng bộ chứng từ</CardTitle>
            <CardDescription>
              Đã có {required.length - missing.length}/{required.length} chứng từ cần có
              {uploading.length > 0 ? ` · đang tải lên ${uploading.length} file` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              {docs.length > 0 && missing.length > 0 && (
                <Alert tone="warning" title={`Còn thiếu ${missing.length} chứng từ`}>
                  {missing.map((m) => DOC_KIND_LABELS[m.kind]).join(", ")}. Bạn vẫn có thể đọc tiếp – các trường liên quan sẽ được đánh dấu để bổ sung.
                </Alert>
              )}
              {pending.length > 0 && (
                <>
                  <p className="flex items-center gap-2 text-sm text-fg-muted">
                    <Spinner size="sm" label={null} /> AI đang đọc {done}/{docs.length} chứng từ…
                  </p>
                  <Progress value={docs.length ? Math.round((done / docs.length) * 100) : 0} aria-label="Tiến độ đọc chứng từ" />
                </>
              )}
              <Button
                fullWidth
                rightIcon={<ArrowRight className="h-4 w-4" />}
                disabled={docs.length === 0 || uploading.length > 0}
                loading={finish.isPending || isWaiting}
                onClick={start}
              >
                {pastUpload ? "Xem kết quả đọc" : pending.length > 0 ? "Bắt đầu đọc chứng từ" : "Xem kết quả đọc"}
              </Button>
              {docs.length === 0 && <p className="text-center text-xs text-fg-subtle">Upload ít nhất 1 chứng từ để tiếp tục.</p>}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </div>
  );
}
