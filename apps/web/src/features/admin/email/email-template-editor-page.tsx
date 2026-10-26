"use client";
// Tạo / sửa một mẫu email: tên + ghi chú, trình kéo thả (tiêu đề, khối, xem trước), nhờ AI soạn.
import { SaveEmailTemplateInputSchema } from "@kb/contracts";
import { Alert, Breadcrumb, Button, Field, Grid, Input, PageHeader, PageLoading, Stack, useMessages } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Save, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { adminKeys, listEmailTemplates, saveEmailTemplate } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { AiDraftDialog } from "./ai-draft-dialog";
import { EmailBuilder, type EmailDraft } from "./email-builder";
import { applyDraft } from "./email-compose-page";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

export function EmailTemplateEditorPage({ id }: { id: string | null }) {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const router = useRouter();
  const { can } = useAdminSession();
  const q = useQuery({ queryKey: adminKeys.emailTemplates, queryFn: listEmailTemplates });
  const tpl = id ? q.data?.find((x) => x.id === id) : undefined;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<EmailDraft>({ subject: "", preheader: "", blocks: [] });
  const [aiOpen, setAiOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (loaded || !tpl) return;
    setName(tpl.name);
    setDescription(tpl.description ?? "");
    setDraft({ subject: tpl.subject, preheader: tpl.preheader ?? "", blocks: tpl.blocks });
    setLoaded(true);
  }, [tpl, loaded]);
  const save = useAdminMutation({
    mutationFn: () =>
      saveEmailTemplate(id, { name, subject: draft.subject, blocks: draft.blocks, ...(draft.preheader.trim() ? { preheader: draft.preheader } : {}), ...(description.trim() ? { description } : {}) }),
    success: () => t.saved,
    errorTitle: t.saveFailed,
    onSuccess: (x) => !id && router.replace(`/admin/email/templates/${x.id}`),
  });
  const submit = () => {
    const r = SaveEmailTemplateInputSchema.safeParse({ name, subject: draft.subject, blocks: draft.blocks });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? t.saveFailed);
    setProblem(null);
    save.mutate(undefined);
  };

  if (id && q.isError) return <LoadError onRetry={() => void q.refetch()} title={t.loadError} />;
  if (id && !tpl) return <PageLoading label={t.templatesTitle} />;
  const editable = can("SUPPORT");
  return (
    <Stack gap="lg">
      <Breadcrumb items={[{ label: t.templatesTitle, href: "/admin/email/templates" }, { label: tpl?.name ?? t.newTemplate }]} />
      <PageHeader
        title={tpl?.name ?? t.newTemplate}
        actions={
          id && editable ? (
            <Button variant="secondary" leftIcon={<Send className="h-4 w-4" />} onClick={() => router.push(`/admin/email/compose?template=${encodeURIComponent(id)}`)}>{t.useTemplate}</Button>
          ) : undefined
        }
      />
      <Grid cols={{ base: 1, md: 2 }}>
        <Field label={t.templateName} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} disabled={!editable} />
        </Field>
        <Field label={t.templateDescription}>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={!editable} />
        </Field>
      </Grid>
      <EmailBuilder value={draft} onChange={setDraft} {...(editable ? { onAskAi: () => setAiOpen(true) } : {})} />
      {problem && <Alert tone="danger">{problem}</Alert>}
      {editable && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={() => router.push("/admin/email/templates")}>{t.back}</Button>
          <Button leftIcon={<Save className="h-4 w-4" />} loading={save.isPending} onClick={submit}>{t.save}</Button>
        </div>
      )}
      <AiDraftDialog open={aiOpen} onOpenChange={setAiOpen} onDraft={(c, replace) => setDraft((prev) => applyDraft(prev, c, replace))} />
    </Stack>
  );
}
