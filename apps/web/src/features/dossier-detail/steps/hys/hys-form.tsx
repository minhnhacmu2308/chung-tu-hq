"use client";
// Form một bộ HYS (spec §3.2): panel bên phải – thông tin chung, chọn chứng từ hồ sơ + tải file riêng, dung lượng x / 2 MB,
// danh sách vấn đề (checkHysSubmission – cùng luật backend), Lưu nháp · Gửi HYS (xác nhận + chứng thư số như IDA) · Xóa.
import {
  Alert, Button, Checkbox, Combobox, Dialog, DialogContent, DialogFooter, Field, FileDropzone, FileUploadList, fill, FormSection, formatBytes, Input,
  Progress, Select, Stack, Textarea, toast, toastPromise, useMessages, useUiLocale,
} from "@kb/ui";
import {
  checkHysSubmission, HYS_ALLOWED_EXTENSIONS, HYS_MAX_TOTAL_BYTES, HYS_PROCEDURE_CODES,
  type DossierDocument, type HysIssue, type HysProcedureCode, type HysSubmissionView, type UpdateHysInput,
} from "@kb/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Paperclip, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { customsKeys, listCertificates } from "@/api/customs";
import { declarationKeys } from "@/api/declaration";
import { deleteHys, hysKeys, removeHysFile, sendHys, updateHys, uploadHysFiles, type HysOverview } from "@/api/hys";
import { formatDate } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { CodeInput } from "../../../declaration-form/code-input";
import { errorMessage } from "../declaration-parts";
import { SUBMIT_MESSAGES } from "../submit-step.messages";
import { HYS_MESSAGES, HYS_PROCEDURE_MESSAGES } from "./hys.messages";

const EDITABLE: readonly HysSubmissionView["status"][] = ["DRAFT", "REJECTED", "SEND_FAILED"];
export const hysEditable = (s: Pick<HysSubmissionView, "status">) => EDITABLE.includes(s.status);

const ACCEPT = HYS_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");
const CODES = Object.keys(HYS_PROCEDURE_CODES) as HysProcedureCode[];

export type HysFormProps = {
  dossierId: string;
  kind: "IDA" | "EDA";
  submission: HysSubmissionView;
  /** Chứng từ của hồ sơ (đã đọc xong) để tick gửi kèm. */
  documents: readonly DossierDocument[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Thay một bộ trong bản cache tổng quan HYS bằng bản server vừa trả. */
export function putHysSubmission(qc: ReturnType<typeof useQueryClient>, dossierId: string, view: HysSubmissionView) {
  qc.setQueryData<HysOverview>(hysKeys.overview(dossierId), (o) => {
    if (!o) return o;
    const has = o.submissions.some((x) => x.id === view.id);
    return { ...o, submissions: has ? o.submissions.map((x) => (x.id === view.id ? view : x)) : [...o.submissions, view] };
  });
}

/** Câu mô tả một vấn đề của bộ HYS theo mã (dịch theo ngôn ngữ). */
export function useIssueText() {
  const t = useMessages(HYS_MESSAGES);
  const locale = useUiLocale();
  return (i: HysIssue) =>
    fill(t[`issue${i.code}`], {
      file: i.file ?? "",
      field: i.field ?? "",
      size: formatBytes(i.bytes ?? 0, locale),
      max: formatBytes(HYS_MAX_TOTAL_BYTES, locale),
    });
}

export function HysForm({ dossierId, kind, submission, documents, open, onOpenChange }: HysFormProps) {
  const t = useMessages(HYS_MESSAGES);
  const st = useMessages(SUBMIT_MESSAGES);
  const names = useMessages(HYS_PROCEDURE_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const issueText = useIssueText();
  const editable = hysEditable(submission);

  const [procedureCode, setProcedureCode] = useState(submission.procedureCode ?? "");
  const [customsOffice, setCustomsOffice] = useState(submission.customsOffice ?? "");
  const [processingUnit, setProcessingUnit] = useState(submission.processingUnit ?? "");
  const [phone, setPhone] = useState(submission.phone);
  const [internalRef, setInternalRef] = useState(submission.internalRef);
  const [note, setNote] = useState(submission.note ?? "");
  const [docIds, setDocIds] = useState<ReadonlySet<string>>(
    () => new Set(submission.files.flatMap((f) => (f.source === "DOSSIER" && f.documentId ? [f.documentId] : []))),
  );
  const [sendOpen, setSendOpen] = useState(false);
  const [certId, setCertId] = useState("");

  const uploads = submission.files.filter((f) => f.source === "UPLOAD");
  // Chứng từ đã gửi kèm trước đây mà nay không còn trong danh sách (vd chưa đọc xong) vẫn tính dung lượng theo bản đã lưu.
  const pickedDocs = [...docIds].map((id) => {
    const d = documents.find((x) => x.id === id);
    const saved = submission.files.find((f) => f.documentId === id);
    return { fileName: d?.fileName ?? saved?.fileName ?? id, sizeBytes: d?.sizeBytes ?? saved?.sizeBytes ?? 0 };
  });
  const files = [...pickedDocs, ...uploads.map((f) => ({ fileName: f.fileName, sizeBytes: f.sizeBytes }))];
  const total = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const issues = checkHysSubmission({ procedureCode, customsOffice, processingUnit, phone, internalRef, note: note || null, files });

  // procedureCode rỗng: không gửi khóa – schema đòi đúng 3 ký tự.
  const body = (): UpdateHysInput => ({
    ...(procedureCode ? { procedureCode } : {}),
    customsOffice,
    processingUnit,
    phone,
    internalRef,
    note: note.trim() ? note : null,
    documentIds: [...docIds],
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: hysKeys.overview(dossierId) });
    void qc.invalidateQueries({ queryKey: customsKeys.all });
    void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
  };

  const save = useMutation({
    mutationFn: () => updateHys(dossierId, submission.id, body()),
    onSuccess: (v) => {
      putHysSubmission(qc, dossierId, v);
      toast({ tone: "success", title: t.saved });
    },
    onError: toastMutationError(t.saveFailed),
  });
  const upload = useMutation({
    mutationFn: (list: File[]) => uploadHysFiles(dossierId, submission.id, list),
    onSuccess: (v) => putHysSubmission(qc, dossierId, v),
    onError: toastMutationError(t.uploadFailed),
  });
  const removeFile = useMutation({
    mutationFn: (fileId: string) => removeHysFile(dossierId, submission.id, fileId),
    onSuccess: (v) => putHysSubmission(qc, dossierId, v),
    onError: toastMutationError(t.removeFileFailed),
  });
  const remove = useMutation({
    mutationFn: () => deleteHys(dossierId, submission.id),
    onSuccess: () => {
      toast({ tone: "success", title: t.deleted });
      onOpenChange(false);
      void qc.invalidateQueries({ queryKey: hysKeys.overview(dossierId) });
    },
    onError: toastMutationError(t.deleteFailed),
  });

  const certQ = useQuery({ queryKey: customsKeys.certificates, queryFn: listCertificates, enabled: sendOpen });
  const certs = certQ.data ?? [];
  const selectedId = certId || certs.find((c) => c.isDefault)?.id || certs[0]?.id || "";
  const selected = certs.find((c) => c.id === selectedId);
  const certExpired = selected ? selected.validTo < new Date().toISOString().slice(0, 10) : false;
  const send = useMutation({
    // Lưu nội dung đang sửa rồi gửi – một toast đi suốt "đang ký số…" → kết quả.
    mutationFn: () =>
      toastPromise(
        updateHys(dossierId, submission.id, body()).then(() => sendHys(dossierId, submission.id, { certificateId: selectedId })),
        { loading: { title: t.sendLoading }, success: { title: t.sentOk }, error: (e) => ({ title: errorMessage(e, locale) }) },
      ),
    onSuccess: (v) => {
      putHysSubmission(qc, dossierId, v);
      setSendOpen(false);
      onOpenChange(false);
      invalidate();
    },
    // Lỗi đã hiện trong toast của toastPromise.
    onError: () => undefined,
  });

  const busy = save.isPending || send.isPending || remove.isPending || upload.isPending || removeFile.isPending;
  const office = customsOffice;
  const values = { TK_CH: office };
  const code = (procedureCode || null) as HysProcedureCode | null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} defaultPresentation="panel">
      <DialogContent title={fill(t.setTitle, { seq: submission.seq })} icon={<Paperclip className="h-4 w-4" />} description={t.formDesc} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editable) save.mutate();
          }}
        >
          <Stack gap="md">
            {!editable && <Alert tone="info">{t.readOnly}</Alert>}
            <FormSection title={t.sectionGeneral}>
              <Field label={t.procedure} required {...(code && code in names ? { hint: names[code] } : {})}>
                <Combobox
                  options={CODES.map((c) => ({ value: c, label: c, description: names[c] }))}
                  value={procedureCode || null}
                  onChange={(v) => setProcedureCode(v ?? "")}
                  placeholder={t.pickProcedure}
                  labels={{ search: t.searchProcedure }}
                  disabled={!editable}
                  className="cq-md:max-w-xs"
                />
              </Field>
              <Field label={t.office} required>
                {editable ? (
                  <CodeInput table="A038" fieldKey="TK_CH" kind={kind} values={values} value={customsOffice} onChange={setCustomsOffice} label={t.office} ariaLabel={t.office} />
                ) : (
                  <Input value={customsOffice} disabled />
                )}
              </Field>
              <Field label={t.unit} required>
                {editable ? (
                  <CodeInput table="A014" fieldKey="TK_CHB" kind={kind} values={values} value={processingUnit} onChange={setProcessingUnit} label={t.unit} ariaLabel={t.unit} />
                ) : (
                  <Input value={processingUnit} disabled />
                )}
              </Field>
              <Field label={t.phone}>
                <Input className="cq-md:max-w-xs" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} disabled={!editable} inputMode="tel" />
              </Field>
              <Field label={t.internalRef}>
                <Input className="cq-md:max-w-xs" value={internalRef} onChange={(e) => setInternalRef(e.currentTarget.value)} disabled={!editable} />
              </Field>
              <Field label={t.note}>
                <Textarea value={note} onChange={(e) => setNote(e.currentTarget.value)} disabled={!editable} />
              </Field>
            </FormSection>

            <FormSection title={t.sectionFiles} description={fill(t.acceptedExt, { ext: HYS_ALLOWED_EXTENSIONS.join(", ") })}>
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-fg">{t.dossierDocs}</legend>
                {documents.length === 0 ? (
                  <p className="text-sm text-fg-subtle">{t.noDocs}</p>
                ) : (
                  documents.map((d) => (
                    <Checkbox
                      key={d.id}
                      label={`${d.fileName} · ${formatBytes(d.sizeBytes, locale)}`}
                      checked={docIds.has(d.id)}
                      disabled={!editable}
                      onChange={() =>
                        setDocIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(d.id)) next.delete(d.id);
                          else next.add(d.id);
                          return next;
                        })
                      }
                    />
                  ))
                )}
              </fieldset>
              {uploads.length > 0 && (
                <Stack gap="xs">
                  <p className="text-sm font-medium text-fg">{t.uploaded}</p>
                  <FileUploadList
                    items={uploads.map((f) => ({ id: f.id, name: f.fileName, size: f.sizeBytes, status: "done" as const }))}
                    {...(editable && !busy ? { onRemove: (id: string) => removeFile.mutate(id) } : {})}
                  />
                </Stack>
              )}
              {editable && (
                <FileDropzone
                  size="sm"
                  multiple
                  accept={ACCEPT}
                  maxSize={HYS_MAX_TOTAL_BYTES}
                  disabled={busy}
                  onFiles={(list) => upload.mutate(list)}
                  onReject={(rejected) =>
                    toast({ tone: "warning", title: fill(t.rejectedFiles, { n: rejected.length }), description: rejected.map((r) => `${r.file.name}: ${r.message}`).join("; ") })
                  }
                />
              )}
              <Progress
                value={total}
                max={HYS_MAX_TOTAL_BYTES}
                tone={total > HYS_MAX_TOTAL_BYTES ? "danger" : "primary"}
                label={fill(t.sizeLabel, { used: formatBytes(total, locale), max: formatBytes(HYS_MAX_TOTAL_BYTES, locale) })}
              />
            </FormSection>

            {editable && issues.length > 0 && (
              <Alert tone="warning" title={t.issuesTitle}>
                <ul className="list-disc pl-5">
                  {issues.map((i, n) => (
                    <li key={`${i.code}-${n}`}>{issueText(i)}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </Stack>
          <DialogFooter>
            {editable ? (
              <>
                <Button variant="ghost" type="button" className="cq-sm:mr-auto" leftIcon={<Trash2 className="h-4 w-4" />} disabled={busy} loading={remove.isPending} onClick={() => remove.mutate()}>
                  {t.remove}
                </Button>
                <Button variant="secondary" type="submit" leftIcon={<Save className="h-4 w-4" />} disabled={busy} loading={save.isPending}>
                  {t.save}
                </Button>
                <Button type="button" leftIcon={<Send className="h-4 w-4" />} disabled={busy || issues.length > 0} onClick={() => setSendOpen(true)}>
                  {t.send}
                </Button>
              </>
            ) : (
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                {t.close}
              </Button>
            )}
          </DialogFooter>
        </form>

        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent title={t.sendTitle} icon={<KeyRound className="h-4 w-4" />} size="sm">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <Stack gap="sm">
                <p className="text-sm text-fg-muted">{fill(t.sendBody, { seq: submission.seq, code: procedureCode, n: files.length })}</p>
                <Field label={st.certLabel}>
                  <Select
                    value={selectedId}
                    onChange={(e) => setCertId(e.currentTarget.value)}
                    disabled={certQ.isLoading}
                    options={certs.map((c) => ({ value: c.id, label: fill(st.certOption, { subject: c.subject, issuer: c.issuer, date: formatDate(c.validTo) }) }))}
                  />
                </Field>
                {certExpired && <Alert tone="warning">{st.certExpired}</Alert>}
              </Stack>
              <DialogFooter>
                <Button variant="ghost" type="button" onClick={() => setSendOpen(false)}>
                  {t.cancel}
                </Button>
                <Button type="submit" loading={send.isPending} disabled={!selectedId || certExpired} leftIcon={<KeyRound className="h-4 w-4" />}>
                  {t.sendConfirm}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
