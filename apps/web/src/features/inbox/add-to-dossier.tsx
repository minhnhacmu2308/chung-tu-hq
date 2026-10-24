"use client";
// Xếp file đính kèm của email vào hồ sơ: hook dùng chung (nút "Thêm vào hồ sơ này", popup, tạo hồ sơ mới từ email) + popup chọn hồ sơ.
import type { AddInboxToDossierInput, InboxMessage } from "@kb/contracts";
import {
  Button, Checkbox, Combobox, Dialog, DialogClose, DialogContent, DialogFooter, Field, FieldFrame, fill, formatBytes, Stack, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { dossierKeys, listDossiers } from "@/api/dossiers";
import { addInboxToDossier, inboxKeys } from "@/api/mailbox";
import { ocrKeys } from "@/api/ocr";
import { toastMutationError } from "@/lib/mutation-error";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { ADD_TO_DOSSIER_MESSAGES, INBOX_MESSAGES } from "./inbox.messages";

/** Hồ sơ còn nhận thêm chứng từ – cùng tập với gợi ý của backend. */
const OPEN = new Set(["DRAFT", "PROCESSING", "NEEDS_REVIEW"]);

export const pendingAttachments = (m: InboxMessage) => m.attachments.filter((a) => a.status === "PENDING");

/** Thêm file vào hồ sơ → toast có nút "Mở hồ sơ"; tải lại hộp thư + hồ sơ. `openAfter` = đi thẳng tới hồ sơ. */
export function useAddToDossier(opts: { openAfter?: boolean } = {}) {
  const t = useMessages(INBOX_MESSAGES);
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (v: AddInboxToDossierInput & { code: string; messageId: string }) => addInboxToDossier({ dossierId: v.dossierId, attachmentIds: v.attachmentIds }),
    onSuccess: (r, v) => {
      void qc.invalidateQueries({ queryKey: inboxKeys.all });
      void qc.invalidateQueries({ queryKey: dossierKeys.all });
      void qc.invalidateQueries({ queryKey: ocrKeys.documents(r.dossierId) });
      const href = `/dossiers/${r.dossierId}`;
      toast({ tone: "success", title: fill(t.added, { n: r.added, code: v.code }), description: t.addedHint, ...(opts.openAfter ? {} : { action: { label: t.openDossier, onClick: () => router.push(href) } }) });
      if (opts.openAfter) router.push(href);
    },
    onError: toastMutationError(t.addFailed),
  });
}

export function AddToDossierDialog({ message, onOpenChange }: { message: InboxMessage | null; onOpenChange: (open: boolean) => void }) {
  const t = useMessages(ADD_TO_DOSSIER_MESSAGES);
  const kinds = useMessages(DOC_KIND_LABELS);
  const locale = useUiLocale();
  const dossiers = useQuery({ queryKey: dossierKeys.list({}), queryFn: () => listDossiers(), enabled: !!message });
  const add = useAddToDossier();
  const pending = useMemo(() => (message ? pendingAttachments(message) : []), [message]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dossierId, setDossierId] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  // Mở popup cho email khác → chọn sẵn mọi file chờ + hồ sơ gợi ý.
  useEffect(() => {
    if (!message) return;
    setSelected(pendingAttachments(message).map((a) => a.id));
    setDossierId(message.suggestion?.dossierId ?? null);
    setShowErrors(false);
    add.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message?.id]);

  const options = useMemo(
    () =>
      (dossiers.data ?? [])
        .filter((d) => OPEN.has(d.status))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((d) => ({ value: d.id, label: `${d.code} · ${d.partner}`, ...(d.id === message?.suggestion?.dossierId ? { description: t.suggested } : {}) })),
    [dossiers.data, message?.suggestion?.dossierId, t.suggested],
  );

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!message || !selected.length || !dossierId) {
      setShowErrors(true);
      return;
    }
    const code = dossiers.data?.find((d) => d.id === dossierId)?.code ?? message.suggestion?.dossierCode ?? dossierId;
    add.mutate({ dossierId, attachmentIds: selected, code, messageId: message.id }, { onSuccess: () => onOpenChange(false) });
  };
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));

  return (
    <Dialog open={message !== null} onOpenChange={onOpenChange}>
      <DialogContent title={t.title} description={t.description} icon={<FolderInput className="h-4 w-4" />}>
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            <FieldFrame legend={t.filesLegend}>
              <Stack gap="sm">
                {pending.map((a) => (
                  <Checkbox
                    key={a.id}
                    checked={selected.includes(a.id)}
                    onChange={(e) => toggle(a.id, e.target.checked)}
                    className="min-w-0 items-start"
                    label={
                      <span className="flex min-w-0 flex-col">
                        <span className="break-all text-fg">{a.fileName}</span>
                        <span className="text-xs text-fg-muted">{`${kinds[a.kindGuess]} · ${formatBytes(a.size, locale)}`}</span>
                      </span>
                    }
                  />
                ))}
              </Stack>
              {showErrors && !selected.length && <p className="text-sm text-danger-subtle-fg" role="alert">{t.pickFile}</p>}
            </FieldFrame>
            <Field label={t.dossier} hint={t.dossierHint} required {...(showErrors && !dossierId ? { error: t.pickDossier } : {})}>
              <Combobox
                options={options}
                value={dossierId}
                onChange={setDossierId}
                placeholder={t.dossierPlaceholder}
                emptyText={t.noDossier}
                loading={dossiers.isLoading}
                labels={{ search: t.dossierSearch }}
              />
            </Field>
          </Stack>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">{t.cancel}</Button>
            </DialogClose>
            <Button type="submit" loading={add.isPending} leftIcon={<FolderInput className="h-4 w-4" />}>{fill(t.submit, { n: selected.length })}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
