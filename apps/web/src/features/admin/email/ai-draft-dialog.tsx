"use client";
// Nhờ AI soạn email theo mô tả (ADR 0008): AI trả tiêu đề + khối, người soạn xem lại và sửa trước khi lưu / gửi.
import type { DraftEmailInput, EmailContent } from "@kb/contracts";
import { Alert, Button, Checkbox, Dialog, DialogContent, DialogFooter, Field, SegmentedControl, Select, Stack, Textarea, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { draftEmailWithAi } from "@/api/admin";
import { errorText } from "@/lib/reason-codes";
import { LOCALE_NAMES } from "@/features/appearance/language.messages";
import { EMAIL_AI_MESSAGES } from "./email.messages";

export function AiDraftDialog({ open, onOpenChange, onDraft }: { open: boolean; onOpenChange: (o: boolean) => void; onDraft: (content: EmailContent, replace: boolean) => void }) {
  const t = useMessages(EMAIL_AI_MESSAGES);
  const locale = useUiLocale();
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<DraftEmailInput["tone"]>("FRIENDLY");
  const [language, setLanguage] = useState<DraftEmailInput["language"]>("vi");
  const [replace, setReplace] = useState(true);
  useEffect(() => {
    if (open) setDescription("");
  }, [open]);
  const draft = useMutation({
    mutationFn: () => draftEmailWithAi({ description, tone, language }),
    onSuccess: (content) => {
      onDraft(content, replace);
      toast({ tone: "success", title: t.done });
      onOpenChange(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !draft.isPending && onOpenChange(o)}>
      <DialogContent title={t.title} description={t.description} size="md" icon={<Sparkles className="h-4 w-4" />}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (description.trim().length >= 10) draft.mutate();
          }}
        >
          <Stack gap="md">
            {draft.isError && <Alert tone="danger" title={t.failed}>{errorText(draft.error, locale)}</Alert>}
            <Field label={t.prompt} required>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={2000} placeholder={t.promptPlaceholder} autoFocus />
            </Field>
            <SegmentedControl label={t.tone} value={tone} onChange={setTone} options={[{ value: "FRIENDLY", label: t.friendly }, { value: "FORMAL", label: t.formal }, { value: "SHORT", label: t.short }]} />
            <Field label={t.language}>
              <Select value={language} onChange={(e) => setLanguage(e.target.value as DraftEmailInput["language"])} options={(["vi", "en", "zh"] as const).map((l) => ({ value: l, label: LOCALE_NAMES[l] }))} />
            </Field>
            <Checkbox label={t.replace} checked={replace} onChange={(e) => setReplace(e.target.checked)} />
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={draft.isPending}>{t.cancel}</Button>
            <Button type="submit" leftIcon={<Sparkles className="h-4 w-4" />} loading={draft.isPending} disabled={description.trim().length < 10}>{t.generate}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
