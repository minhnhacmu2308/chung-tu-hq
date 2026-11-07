"use client";
// Nhận lời mời (liên kết /accept-invite?token=… trong email mời thành viên): đặt họ tên + mật khẩu → server cấp phiên → vào ứng dụng.
import { Alert, Button, Field, Input, Stack, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { acceptInvite } from "@/api/session";
import { errorText } from "@/lib/reason-codes";
import { AuthFrame } from "./auth-frame";
import { ACCEPT_INVITE_MESSAGES, AUTH_LINK_COMMON_MESSAGES } from "./auth-links.messages";
import { AuthResult } from "./auth-result";
import { isTokenWellFormed, isTokenInvalid, newPasswordErrors } from "./password-rules";

const err = (e: string | undefined) => (e ? { error: e } : {});

export function AcceptInvitePage({ token }: { token: string }) {
  const t = useMessages(ACCEPT_INVITE_MESSAGES);
  const c = useMessages(AUTH_LINK_COMMON_MESSAGES);
  const locale = useUiLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [typing, setTyping] = useState(false);

  const accept = useMutation({
    mutationFn: () => acceptInvite({ token, name: form.name.trim(), password: form.password }),
    onSuccess: async () => {
      // Server đã đặt cookie phiên → tải lại dữ liệu theo người vừa vào rồi đưa vào ứng dụng.
      await qc.invalidateQueries();
      router.push("/");
    },
  });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = { ...newPasswordErrors(form.password, form.confirm, locale) };
    if (form.name.trim().length < 2) next.name = t.nameRequired;
    setErrors(next);
    if (Object.keys(next).length === 0) accept.mutate();
  };

  const invalid = !isTokenWellFormed(token) || isTokenInvalid(accept.error);
  const robot = invalid ? "error" : accept.isPending ? "thinking" : accept.isSuccess ? "happy" : accept.isError ? "error" : typing ? "listening" : "idle";

  if (invalid) {
    return (
      <AuthFrame robot={robot}>
        <AuthResult tone="danger" title={t.invalidTitle} description={t.invalidDesc}>
          <Button asChild>
            <Link href="/login">{c.toLogin}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.subtitle}</p>
      </Stack>

      <form onSubmit={submit} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} noValidate>
        <Stack gap="md">
          {accept.isError && <Alert tone="danger" title={c.failed}>{errorText(accept.error, locale)}</Alert>}
          <Field label={t.fullName} required {...err(errors.name)}>
            <Input autoComplete="name" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder={t.fullNamePlaceholder} />
          </Field>
          <div className="grid grid-cols-1 gap-4 cq-sm:grid-cols-2">
            <Field label={t.password} required hint={c.passwordHint} {...err(errors.password)}>
              <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setField("password", e.target.value)} placeholder={c.passwordPlaceholder} />
            </Field>
            <Field label={c.confirm} required {...err(errors.confirm)}>
              <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setField("confirm", e.target.value)} placeholder={c.confirmPlaceholder} />
            </Field>
          </div>
          <Button type="submit" fullWidth loading={accept.isPending || accept.isSuccess}>{t.submit}</Button>
        </Stack>
      </form>

      <p className="text-center text-sm text-fg-muted">
        <Link href="/login" className="font-medium text-primary hover:underline">{c.toLogin}</Link>
      </p>
    </AuthFrame>
  );
}
