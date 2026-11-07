"use client";
// Xác thực email (liên kết /verify-email?token=… trong email sau đăng ký): mở trang là gửi token lên server ngay.
// Chưa có API gửi lại email xác thực cho người dùng (chỉ khu Quản trị gửi lại được) → liên kết hỏng chỉ đưa về đăng nhập.
import { Alert, Button, LoadingState, useMessages, useUiLocale } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { verifyEmail } from "@/api/session";
import { errorText } from "@/lib/reason-codes";
import { AuthFrame } from "./auth-frame";
import { AUTH_LINK_COMMON_MESSAGES, VERIFY_EMAIL_MESSAGES } from "./auth-links.messages";
import { AuthResult } from "./auth-result";
import { isTokenWellFormed, isTokenInvalid } from "./password-rules";

export function VerifyEmailPage({ token }: { token: string }) {
  const t = useMessages(VERIFY_EMAIL_MESSAGES);
  const c = useMessages(AUTH_LINK_COMMON_MESSAGES);
  const locale = useUiLocale();
  const verify = useMutation({ mutationFn: () => verifyEmail(token) });
  const { mutate } = verify;

  // Token chỉ dùng được một lần: chỉ gửi một lần dù React (StrictMode) chạy effect hai lần.
  const sent = useRef(false);
  useEffect(() => {
    if (!isTokenWellFormed(token) || sent.current) return;
    sent.current = true;
    mutate();
  }, [token, mutate]);

  if (!isTokenWellFormed(token) || isTokenInvalid(verify.error)) {
    return (
      <AuthFrame robot="error">
        <AuthResult tone="danger" title={t.invalidTitle} description={t.invalidDesc}>
          <Button asChild>
            <Link href="/login">{c.toLogin}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  if (verify.isSuccess) {
    return (
      <AuthFrame robot="happy">
        <AuthResult tone="success" title={t.successTitle} description={t.successDesc}>
          <Button asChild>
            <Link href="/">{t.toApp}</Link>
          </Button>
        </AuthResult>
      </AuthFrame>
    );
  }

  if (verify.isError) {
    return (
      <AuthFrame robot="error">
        <h1 className="text-2xl font-semibold text-fg">{t.errorTitle}</h1>
        <Alert tone="danger" title={c.failed}>{errorText(verify.error, locale)}</Alert>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => mutate()}>{c.retry}</Button>
          <Button asChild variant="ghost">
            <Link href="/login">{c.toLogin}</Link>
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame robot="thinking">
      <h1 className="sr-only">{t.verifying}</h1>
      <LoadingState title={t.verifying} description={t.verifyingDesc} />
    </AuthFrame>
  );
}
