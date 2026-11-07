"use client";
// Quên mật khẩu (từ "Quên mật khẩu?" ở trang đăng nhập): nhập email → server gửi liên kết /reset-password?token=….
// Server luôn trả "đã gửi" để không lộ email có tồn tại hay không; chỉ báo lỗi khi yêu cầu quá nhiều lần (RATE_LIMITED).
import { Alert, Button, Field, Input, Stack, fill, useMessages, useUiLocale } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { requestPasswordReset } from "@/api/session";
import { errorText } from "@/lib/reason-codes";
import { AuthFrame } from "./auth-frame";
import { AUTH_LINK_COMMON_MESSAGES, FORGOT_PASSWORD_MESSAGES } from "./auth-links.messages";
import { AuthResult } from "./auth-result";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordPage({ initialEmail = "" }: { initialEmail?: string }) {
  const t = useMessages(FORGOT_PASSWORD_MESSAGES);
  const c = useMessages(AUTH_LINK_COMMON_MESSAGES);
  const locale = useUiLocale();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string>();
  const [typing, setTyping] = useState(false);

  const request = useMutation({ mutationFn: (to: string) => requestPasswordReset(to) });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const to = email.trim();
    if (!EMAIL_RE.test(to)) {
      setError(t.invalidEmail);
      return;
    }
    setError(undefined);
    request.mutate(to);
  };

  if (request.isSuccess) {
    return (
      <AuthFrame robot="happy">
        <AuthResult tone="success" title={t.sentTitle} description={fill(t.sentDesc, { email: request.variables })}>
          <Button asChild>
            <Link href="/login">{c.toLogin}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  const robot = request.isPending ? "thinking" : request.isError ? "error" : typing ? "listening" : "idle";

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.subtitle}</p>
      </Stack>

      <form onSubmit={submit} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} noValidate>
        <Stack gap="md">
          {request.isError && <Alert tone="danger" title={c.failed}>{errorText(request.error, locale)}</Alert>}
          <Field label={t.email} required {...(error ? { error } : {})}>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(undefined);
              }}
              placeholder={t.emailExample}
            />
          </Field>
          <Button type="submit" fullWidth loading={request.isPending}>{t.submit}</Button>
        </Stack>
      </form>

      <p className="text-center text-sm text-fg-muted">
        {t.remembered}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">{t.signIn}</Link>
      </p>
    </AuthFrame>
  );
}
