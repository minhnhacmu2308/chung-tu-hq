"use client";
// Bước 2 – upload bộ chứng từ: kéo thả nhiều file/zip, hệ thống phân loại + đọc từng chứng từ (mô phỏng theo thời gian).
// Danh sách "chứng từ gợi ý" chỉ cảnh báo, không chặn (lô thật hay thiếu Packing List).
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, FileDropzone, FileUploadList, Progress,
  Select, Skeleton, Spinner, Stack, toast, type Tone, type UploadItem,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleDashed, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { dossierKeys } from "@/api/dossiers";
import { changeDocumentKind, deleteDocument, finishReading, listDossierDocuments, ocrKeys, uploadDocuments } from "@/api/ocr";
import { formatBytesVi } from "@/lib/format";
import { DOC_KIND_LABELS, STEP_ORDER, type DocKind, type Dossier, type DossierDocument } from "@/mocks/types";
import type { StepProps } from "./types";

const STATUS: Record<DossierDocument["status"], { label: string; tone: Tone }> = {
  UPLOADING: { label: "Đang tải lên", tone: "info" },
  QUEUED: { label: "Chờ đọc", tone: "neutral" },
  READING: { label: "AI đang đọc", tone: "info" },
  DONE: { label: "Đã đọc", tone: "success" },
  ERROR: { label: "Lỗi", tone: "danger" },
};

const KIND_OPTIONS = (Object.keys(DOC_KIND_LABELS) as DocKind[]).map((k) => ({ value: k, label: DOC_KIND_LABELS[k] }));

/** Chứng từ nên có theo hồ sơ. `reason` hiện khi thiếu. */
function suggestedKinds(d: Dossier): { kind: DocKind; reason: string; optional?: boolean }[] {
  const list: { kind: DocKind; reason: string; optional?: boolean }[] = [
    { kind: "INVOICE", reason: "Trị giá, người bán/mua, dòng hàng" },
    { kind: "PACKING_LIST", reason: "Số kiện, trọng lượng – lô nhỏ có thể không có", optional: true },
    d.transportMode === "AIR"
      ? { kind: "AIR_WAYBILL", reason: "Số vận đơn, nơi xếp/dỡ" }
      : { kind: "BILL_OF_LADING", reason: "Số vận đơn, tàu, cảng xếp/dỡ" },
  ];
  if (["EXW", "FCA", "FAS", "FOB"].includes(d.incoterm)) {
    list.push({ kind: "FREIGHT_INVOICE", reason: `Điều kiện ${d.incoterm}: cần cước vận chuyển để cộng vào trị giá tính thuế` });
  }
  if (d.direction === "NK") list.push({ kind: "CERT_OF_ORIGIN", reason: "Chỉ cần khi hưởng thuế ưu đãi đặc biệt (FTA)", optional: true });
  return list;
}

function DocumentRow({ doc, dossierId }: { doc: DossierDocument; dossierId: string }) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ocrKeys.documents(dossierId) });
    void qc.invalidateQueries({ queryKey: ocrKeys.fields(dossierId) });
    void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
  };
  const kind = useMutation({ mutationFn: (k: DocKind) => changeDocumentKind(doc.id, k), onSuccess: invalidate });
  const remove = useMutation({
    mutationFn: () => deleteDocument(doc.id),
    onSuccess: () => {
      invalidate();
      toast({ tone: "info", title: "Đã xóa chứng từ", description: doc.fileName });
    },
  });
  const s = STATUS[doc.status];
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-3 sm:flex-nowrap">
      <FileText aria-hidden="true" className="h-5 w-5 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{doc.fileName}</p>
        <p className="text-xs text-fg-subtle">
          {formatBytesVi(doc.sizeBytes)} · {doc.pages} trang
        </p>
      </div>
      <Select
        aria-label={`Loại chứng từ của ${doc.fileName}`}
        className="h-8 w-full text-sm sm:w-48"
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

export function UploadStep({ dossier, goTo }: StepProps) {
  const qc = useQueryClient();
  const docsQuery = useQuery({
    queryKey: ocrKeys.documents(dossier.id),
    queryFn: () => listDossierDocuments(dossier.id),
    // Còn chứng từ đang xử lý → hỏi lại mỗi giây để thấy tiến độ.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status !== "DONE" && d.status !== "ERROR") ? 1000 : false),
  });
  const docs = docsQuery.data ?? [];

  const upload = useMutation({
    mutationFn: (files: File[]) => uploadDocuments(dossier.id, files.map((f) => ({ name: f.name, size: f.size }))),
    onSuccess: (created) => {
      void qc.invalidateQueries({ queryKey: ocrKeys.documents(dossier.id) });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      toast({ tone: "success", title: `Đã nhận ${created.length} chứng từ`, description: "Hệ thống đang phân loại và đọc." });
    },
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
  });

  const uploading = docs.filter((d) => d.status === "UPLOADING");
  const received = docs.filter((d) => d.status !== "UPLOADING");
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

  const present = new Set(docs.map((d) => d.kind));
  const suggestions = suggestedKinds(dossier);
  const missing = suggestions.filter((s) => !present.has(s.kind) && !(s.kind === "BILL_OF_LADING" && present.has("AIR_WAYBILL")));
  const missingRequired = missing.filter((m) => !m.optional);

  const uploadItems: UploadItem[] = uploading.map((d) => ({ id: d.id, name: d.fileName, size: d.sizeBytes, status: "uploading" }));
  const isWaiting = waiting && pending.length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Stack gap="md" className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload chứng từ</CardTitle>
            <CardDescription>Kéo thả nhiều PDF/ảnh hoặc một file .zip. Hệ thống tự tách trang, bỏ bản trùng (Original/Copy) và nhận diện loại chứng từ.</CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap="md">
              <FileDropzone
                accept=".pdf,.jpg,.jpeg,.png,.zip"
                maxSize={30 * 1024 * 1024}
                maxFiles={20}
                disabled={upload.isPending}
                onFiles={(files) => upload.mutate(files)}
                onReject={(rejected) => toast({ tone: "danger", title: `${rejected.length} file không hợp lệ`, description: "Chỉ nhận PDF, JPG, PNG, ZIP tối đa 30 MB." })}
              />
              <FileUploadList items={uploadItems} />
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h3">Chứng từ đã nhận</CardTitle>
            <CardDescription>
              {docs.length === 0 ? "Chưa có chứng từ." : `${received.length} chứng từ · ${docs.reduce((n, d) => n + d.pages, 0)} trang · đã đọc ${done}/${docs.length}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {docsQuery.isLoading ? (
              <Stack gap="sm">
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
                <Skeleton className="h-12" />
              </Stack>
            ) : docsQuery.isError ? (
              <Alert tone="danger" title="Không tải được danh sách chứng từ" action={<Button size="sm" variant="secondary" onClick={() => void docsQuery.refetch()}>Thử lại</Button>} />
            ) : received.length === 0 ? (
              <EmptyState title="Chưa có chứng từ" description="Upload Invoice, Packing List, vận đơn… để AI bắt đầu đọc." />
            ) : (
              <ul aria-label="Chứng từ của hồ sơ" className="divide-y divide-border rounded-lg border border-border">
                {received.map((d) => (
                  <DocumentRow key={d.id} doc={d} dossierId={dossier.id} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </Stack>

      <Stack gap="md">
        <Card>
          <CardHeader>
            <CardTitle as="h3">Chứng từ gợi ý</CardTitle>
            <CardDescription>
              Theo {dossier.direction === "NK" ? "hồ sơ nhập khẩu" : "hồ sơ xuất khẩu"} {dossier.typeCode} · {dossier.incoterm}. Chỉ là gợi ý – không bắt buộc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {suggestions.map((s) => {
                const ok = present.has(s.kind) || (s.kind === "BILL_OF_LADING" && present.has("AIR_WAYBILL"));
                return (
                  <li key={s.kind} className="flex gap-2">
                    {ok ? (
                      <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success-subtle-fg" />
                    ) : (
                      <CircleDashed aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg">
                        {DOC_KIND_LABELS[s.kind]}
                        <span className="sr-only">{ok ? " – đã có" : " – chưa có"}</span>
                        {s.optional && <span className="ml-1 text-xs font-normal text-fg-subtle">(tùy lô)</span>}
                      </p>
                      <p className="text-sm text-fg-muted">{s.reason}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
        {docs.length > 0 && missingRequired.length > 0 && (
          <Alert tone="warning" title={`Còn thiếu ${missingRequired.length} chứng từ`}>
            {missingRequired.map((m) => DOC_KIND_LABELS[m.kind]).join(", ")}. Bạn vẫn có thể đọc tiếp – các trường liên quan sẽ được đánh dấu để bổ sung.
          </Alert>
        )}
        <Card>
          <CardContent className="pt-6">
            <Stack gap="md">
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
