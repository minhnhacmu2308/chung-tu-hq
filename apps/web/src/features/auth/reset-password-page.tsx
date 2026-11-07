"use client";
// Đặt lại mật khẩu (liên kết /reset-password?token=… trong email quên mật khẩu, và email mời quản trị viên hệ thống).
// Thành công → mọi phiên cũ bị hủy ở server, người dùng đăng nhập lại bằng mật khẩu mới.
import { Alert, Button, Field, Input, Stack, useMessages, useUiLocale } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { resetPassword } from "@/api/session";
import { errorText } from "@/lib/reason-codes";
import { AuthFrame } from "./auth-frame";
import { AUTH_LINK_COMMON_MESSAGES, RESET_PASSWORD_MESSAGES } from "./auth-links.messages";
import { AuthResult } from "./auth-result";
import { isTokenWellFormed, isTokenInvalid, newPasswordErrors, type NewPasswordErrors } from "./password-rules";

const err = (e: string | undefined) => (e ? { error: e } : {});

export function ResetPasswordPage({ token }: { token: string }) {
  const t = useMessages(RESET_PASSWORD_MESSAGES);
  const c = useMessages(AUTH_LINK_COMMON_MESSAGES);
  const locale = useUiLocale();
  const [form, setForm] = useState({ password: "", confirm: "" });
  const [errors, setErrors] = useState<NewPasswordErrors>({});
  const [typing, setTyping] = useState(false);

  const reset = useMutation({ mutationFn: () => resetPassword({ token, password: form.password }) });

  const setField = (k: keyof typeof form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = newPasswordErrors(form.password, form.confirm, locale);
    setErrors(next);
    if (Object.keys(next).length === 0) reset.mutate();
  };

  if (!isTokenWellFormed(token) || isTokenInvalid(reset.error)) {
    return (
      <AuthFrame robot="error">
        <AuthResult tone="danger" title={t.invalidTitle} description={t.invalidDesc}>
          <Button asChild>
            <Link href="/forgot-password">{t.requestNew}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/login">{c.toLogin}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthFrame robot="happy">
        <AuthResult tone="success" title={t.successTitle} description={t.successDesc}>
          <Button asChild>
            <Link href="/login">{t.signIn}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  const robot = reset.isPending ? "thinking" : reset.isError ? "error" : typing ? "listening" : "idle";

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.subtitle}</p>
      </Stack>

      <form onSubmit={submit} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} noValidate>
        <Stack gap="md">
          {reset.isError && <Alert tone="danger" title={c.failed}>{errorText(reset.error, locale)}</Alert>}
          <Field label={t.password} required hint={c.passwordHint} {...err(errors.password)}>
            <Input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setField("password", e.target.value)} placeholder={c.passwordPlaceholder} />
          </Field>
          <Field label={c.confirm} required {...err(errors.confirm)}>
            <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setField("confirm", e.target.value)} placeholder={c.confirmPlaceholder} />
          </Field>
          <Button type="submit" fullWidth loading={reset.isPending}>{t.submit}</Button>
        </Stack>
      </form>

      <p className="text-center text-sm text-fg-muted">
        <Link href="/login" className="font-medium text-primary hover:underline">{c.toLogin}</Link>
      </p>
    </AuthFrame>
  );
}
