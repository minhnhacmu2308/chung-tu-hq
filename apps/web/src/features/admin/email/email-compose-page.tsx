"use client";
// Soạn email gửi khách: bắt đầu từ mẫu (hoặc trống) → sửa bằng trình kéo thả / nhờ AI → chọn chữ ký + người nhận → gửi thử → gửi.
import { SendEmailInputSchema, type EmailAudience, type EmailContent } from "@kb/contracts";
import { Alert, Breadcrumb, Button, ConfirmDialog, Field, fill, PageHeader, Select, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Save, Send } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { adminKeys, listEmailSignatures, listEmailTemplates, saveEmailTemplate, sendEmail, sendTestEmail } from "@/api/admin";
import { errorText } from "@/lib/reason-codes";
import { useAdminMutation } from "../common/use-admin-mutation";
import { AiDraftDialog } from "./ai-draft-dialog";
import { AudiencePicker, EMPTY_AUDIENCE } from "./audience-picker";
import { cloneBlocks, EmailBuilder, type EmailDraft } from "./email-builder";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

const EMPTY: EmailDraft = { subject: "", preheader: "", blocks: [] };

/** Nội dung AI soạn → bản nháp (thay hẳn hoặc thêm vào cuối). */
export function applyDraft(prev: EmailDraft, content: EmailContent, replace: boolean): EmailDraft {
  return replace
    ? { subject: content.subject, preheader: content.preheader ?? "", blocks: cloneBlocks(content.blocks) }
    : { subject: prev.subject || content.subject, preheader: prev.preheader || (content.preheader ?? ""), blocks: [...prev.blocks, ...cloneBlocks(content.blocks)] };
}

function ComposeInner() {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const locale = useUiLocale();
  const router = useRouter();
  const params = useSearchParams();
  const templates = useQuery({ queryKey: adminKeys.emailTemplates, queryFn: listEmailTemplates });
  const signatures = useQuery({ queryKey: adminKeys.emailSignatures, queryFn: listEmailSignatures });
  const [templateId, setTemplateId] = useState<string>(params.get("template") ?? "");
  const [draft, setDraft] = useState<EmailDraft>(EMPTY);
  const [signatureId, setSignatureId] = useState<string | null>(null);
  const [audience, setAudience] = useState<EmailAudience>(EMPTY_AUDIENCE);
  const [count, setCount] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // Mở từ "Dùng để gửi" của một mẫu → nạp mẫu đó một lần khi danh sách mẫu tải xong.
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  useEffect(() => {
    if (!templateId || templateId === loadedFrom || !templates.data) return;
    const tpl = templates.data.find((x) => x.id === templateId);
    if (tpl) setDraft({ subject: tpl.subject, preheader: tpl.preheader ?? "", blocks: cloneBlocks(tpl.blocks) });
    setLoadedFrom(templateId);
  }, [templateId, loadedFrom, templates.data]);
  // Chữ ký mặc định: của riêng mình trước, không có thì chữ ký chung.
  useEffect(() => {
    if (signatureId !== null || !signatures.data) return;
    const mine = signatures.data.find((s) => s.personal && s.isDefault) ?? signatures.data.find((s) => !s.personal && s.isDefault);
    setSignatureId(mine?.id ?? "");
  }, [signatures.data, signatureId]);
  const signature = useMemo(() => signatures.data?.find((s) => s.id === signatureId)?.blocks ?? [], [signatures.data, signatureId]);

  const content = { subject: draft.subject, ...(draft.preheader.trim() ? { preheader: draft.preheader } : {}), blocks: draft.blocks };
  const sigPart = signatureId ? { signatureId } : {};
  const test = useMutation({
    mutationFn: () => sendTestEmail({ ...content, ...sigPart }),
    onSuccess: (r) => toast({ tone: "success", title: fill(t.testSent, { email: r.to }) }),
    onError: (e) => toast({ tone: "danger", title: t.testFailed, description: errorText(e, locale) }),
  });
  const send = useAdminMutation({
    mutationFn: () => sendEmail({ ...content, ...sigPart, audience, ...(templateId ? { templateId } : {}) }),
    success: (c) => fill(t.sent, { n: c.total }),
    errorTitle: t.sendFailed,
    onSuccess: () => router.push("/admin/email"),
  });
  const saveTpl = useAdminMutation({
    mutationFn: () => saveEmailTemplate(null, { ...content, name: draft.subject || t.blank }),
    success: () => t.saved,
    errorTitle: t.saveFailed,
  });
  /** Kiểm trước khi hỏi xác nhận: lỗi hiện ngay trên trang, không mở hộp gửi. */
  const check = () => {
    const r = SendEmailInputSchema.safeParse({ ...content, ...sigPart, audience });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? t.sendFailed);
    if (count === 0) return setProblem(null);
    setProblem(null);
    setConfirm(true);
  };

  return (
    <Stack gap="lg">
      <Breadcrumb items={[{ label: t.campaignsTitle, href: "/admin/email" }, { label: t.composeTitle }]} />
      <PageHeader title={t.composeTitle} description={t.composeDesc} />
      <Field label={t.fromTemplate}>
        <Select
          className="cq-md:max-w-md"
          value={templateId}
          onChange={(e) => {
            setTemplateId(e.target.value);
            if (!e.target.value) setDraft(EMPTY);
          }}
          options={[{ value: "", label: t.blank }, ...(templates.data ?? []).map((x) => ({ value: x.id, label: x.name }))]}
        />
      </Field>
      <EmailBuilder
        value={draft}
        onChange={setDraft}
        signature={signature}
        onAskAi={() => setAiOpen(true)}
        aside={
          <Stack gap="md">
            <Field label={t.signature}>
              <Select
                value={signatureId ?? ""}
                onChange={(e) => setSignatureId(e.target.value)}
                options={[{ value: "", label: t.noSignature }, ...(signatures.data ?? []).map((s) => ({ value: s.id, label: s.personal ? s.name : `${s.name} (${t.companySignatures})` }))]}
              />
            </Field>
            <AudiencePicker value={audience} onChange={setAudience} onCount={setCount} />
          </Stack>
        }
      />
      {problem && <Alert tone="danger">{problem}</Alert>}
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" leftIcon={<Save className="h-4 w-4" />} loading={saveTpl.isPending} disabled={draft.blocks.length === 0} onClick={() => saveTpl.mutate(undefined)}>{t.saveAsTemplate}</Button>
        <Button variant="secondary" leftIcon={<FlaskConical className="h-4 w-4" />} loading={test.isPending} disabled={draft.blocks.length === 0 || !draft.subject.trim()} onClick={() => test.mutate()}>{t.sendTest}</Button>
        <Button leftIcon={<Send className="h-4 w-4" />} disabled={count === 0} onClick={check}>{count ? fill(t.sendN, { n: count }) : t.send}</Button>
      </div>
      <AiDraftDialog open={aiOpen} onOpenChange={setAiOpen} onDraft={(c, replace) => setDraft((prev) => applyDraft(prev, c, replace))} />
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="warning"
        icon={<Send className="h-4 w-4" />}
        title={fill(t.confirmTitle, { n: count })}
        subject={draft.subject}
        confirmLabel={t.confirmSend}
        loading={send.isPending}
        onConfirm={() => send.mutate(undefined)}
      >
        {t.confirmBody}
      </ConfirmDialog>
    </Stack>
  );
}

export function EmailComposePage() {
  return (
    <Suspense>
      <ComposeInner />
    </Suspense>
  );
}
