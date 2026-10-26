"use client";
// Chữ ký email: chữ ký chung của công ty (quyền Nền tảng) + chữ ký riêng của từng quản trị viên. Soạn bằng cùng trình kéo thả.
import { renderEmail, SaveEmailSignatureInputSchema, type EmailSignature } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, ConfirmDialog, Dialog, DialogContent, DialogFooter, EmptyState, Field, fill, Grid, HtmlPreview,
  Input, PageHeader, Stack, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys, deleteEmailSignature, listEmailSignatures, saveEmailSignature } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { EmailBuilder, newBlockId, type EmailDraft } from "./email-builder";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

type Editing = { id: string | null; personal: boolean; name: string; isDefault: boolean; draft: EmailDraft };

function SignatureEditor({ editing, onClose }: { editing: Editing | null; onClose: () => void }) {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const [state, setState] = useState<Editing | null>(editing);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    setState(editing);
    setProblem(null);
  }, [editing]);
  const save = useAdminMutation({
    mutationFn: (s: Editing) => saveEmailSignature(s.id, { name: s.name, personal: s.personal, isDefault: s.isDefault, blocks: s.draft.blocks }),
    success: () => t.signatureSaved,
    errorTitle: t.saveFailed,
    onSuccess: onClose,
  });
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent title={editing?.id ? t.editSignature : editing?.personal ? t.newSignature : t.newCompanySignature} icon={<PenLine className="h-4 w-4" />} size="xl">
        {state && (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const r = SaveEmailSignatureInputSchema.safeParse({ name: state.name, personal: state.personal, isDefault: state.isDefault, blocks: state.draft.blocks });
              if (!r.success) return setProblem(r.error.issues[0]?.message ?? t.saveFailed);
              save.mutate(state);
            }}
          >
            <Stack gap="md">
              <Grid cols={{ base: 1, md: 2 }}>
                <Field label={t.signatureName} required>
                  <Input value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} maxLength={80} autoFocus />
                </Field>
                <div className="flex items-end pb-2">
                  <Checkbox label={t.defaultSignature} checked={state.isDefault} onChange={(e) => setState({ ...state, isDefault: e.target.checked })} />
                </div>
              </Grid>
              <EmailBuilder mode="signature" value={state.draft} onChange={(draft) => setState({ ...state, draft })} />
              {problem && <Alert tone="danger">{problem}</Alert>}
            </Stack>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={save.isPending}>{t.back}</Button>
              <Button type="submit" loading={save.isPending}>{t.save}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SignatureCard({ s, canEdit, onEdit, onDelete }: { s: EmailSignature; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  // Xem trước chỉ phần chữ ký (một khối trống phía trên để thấy đường kẻ ngăn cách như trong email thật).
  const html = renderEmail({ subject: s.name, blocks: [{ id: "x", type: "spacer", size: "sm" }] }, { signature: s.blocks }).html;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CardTitle as="h3">{s.name}</CardTitle>
          {s.isDefault && <Badge tone="primary" size="sm">{t.isDefault}</Badge>}
        </div>
        {canEdit && (
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`${t.editSignature} – ${s.name}`} title={t.editSignature} onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-danger-subtle-fg" aria-label={`${t.deleteSignature} – ${s.name}`} title={t.deleteSignature} onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <HtmlPreview title={s.name} html={html} className="h-48" />
      </CardContent>
    </Card>
  );
}

const fresh = (personal: boolean, name: string): Editing => ({
  id: null, personal, name, isDefault: false,
  draft: { subject: "", preheader: "", blocks: [{ id: newBlockId(), type: "text", text: "", align: "left" }] },
});

export function EmailSignaturesPage() {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const { staff, can } = useAdminSession();
  const q = useQuery({ queryKey: adminKeys.emailSignatures, queryFn: listEmailSignatures });
  const [editing, setEditing] = useState<Editing | null>(null);
  const [toDelete, setToDelete] = useState<EmailSignature | null>(null);
  const remove = useAdminMutation({ mutationFn: (id: string) => deleteEmailSignature(id), success: () => t.signatureDeleted, errorTitle: t.saveFailed, onSuccess: () => setToDelete(null) });
  const edit = (s: EmailSignature) => setEditing({ id: s.id, personal: s.personal, name: s.name, isDefault: s.isDefault, draft: { subject: "", preheader: "", blocks: s.blocks } });
  const company = (q.data ?? []).filter((s) => !s.personal);
  const mine = (q.data ?? []).filter((s) => s.personal);
  const section = (title: string, list: EmailSignature[], canEdit: boolean, action: React.ReactNode) => (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {list.length === 0 ? (
        <Card><EmptyState title={t.noSignatures} /></Card>
      ) : (
        <Grid cols={{ base: 1, lg: 2 }}>
          {list.map((s) => <SignatureCard key={s.id} s={s} canEdit={canEdit} onEdit={() => edit(s)} onDelete={() => setToDelete(s)} />)}
        </Grid>
      )}
    </section>
  );
  if (q.isError) return <LoadError onRetry={() => void q.refetch()} title={t.loadError} />;
  return (
    <Stack gap="lg">
      <PageHeader title={t.signaturesTitle} description={t.signaturesDesc} />
      {section(t.mySignatures, mine, can("SUPPORT"), can("SUPPORT") && <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing(fresh(true, staff?.name ?? ""))}>{t.newSignature}</Button>)}
      {section(t.companySignatures, company, can("PLATFORM"), can("PLATFORM") && <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing(fresh(false, ""))}>{t.newCompanySignature}</Button>)}
      <SignatureEditor editing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.deleteSignatureTitle}
        icon={<Trash2 className="h-4 w-4" />}
        confirmLabel={t.deleteSignature}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        {fill(t.deleteSignatureBody, { name: toDelete?.name ?? "" })}
      </ConfirmDialog>
    </Stack>
  );
}
