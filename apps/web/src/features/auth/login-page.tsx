"use client";
import { Alert, Button, Checkbox, Field, Input, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { adminKeys, getAdminSession } from "@/api/admin";
import { login } from "@/api/session";
import { AuthFrame } from "./auth-frame";
import { LOGIN_MESSAGES } from "./auth.messages";
import { loginErrorMessage } from "./login-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Tài khoản mẫu của đội vận hành – mỗi vai trò nội bộ một người, để thử phân quyền khu Quản trị hệ thống. */
const OPERATOR_DEMO_ACCOUNTS = [
  { email: "bao.hoang@khaibao-demo.vn", label: "opSuperAdmin" },
  { email: "trang.mai@khaibao-demo.vn", label: "opSupport" },
  { email: "viet.dinh@khaibao-demo.vn", label: "opViewer" },
] as const;

export function LoginPage() {
  const t = useMessages(LOGIN_MESSAGES);
  const locale = useUiLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState("chau.le@anphat-demo.vn");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [typing, setTyping] = useState(false);

  const mutation = useMutation({
    mutationFn: () => login(email, password),
    onSuccess: async () => {
      await qc.invalidateQueries();
      // Một trang đăng nhập cho mọi tài khoản: tài khoản đội vận hành vào thẳng khu Quản trị hệ thống.
      const admin = await qc.fetchQuery({ queryKey: adminKeys.session, queryFn: getAdminSession, staleTime: 0 }).catch(() => null);
      router.push(admin ? "/admin" : "/");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = t.invalidEmail;
    if (password.length < 6) next.password = t.passwordMin;
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  };

  // Linh vật phản ứng theo form: đang gửi → suy nghĩ, sai → báo lỗi, đang gõ → lắng nghe.
  const robot = mutation.isPending ? "thinking" : mutation.isSuccess ? "happy" : mutation.isError ? "error" : typing ? "listening" : "idle";

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.subtitle}</p>
      </Stack>

      <form onSubmit={submit} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} noValidate>
        <Stack gap="md">
          {mutation.isError && <Alert tone="danger" title={t.failed}>{loginErrorMessage(mutation.error, locale)}</Alert>}
          <Field label={t.email} required {...(errors.email ? { error: errors.email } : {})}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t.emailExample} />
          </Field>
          <Field label={t.password} required {...(errors.password ? { error: errors.password } : {})}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox label={t.remember} defaultChecked />
            <Button
              type="button"
              variant="link"
              onClick={() => toast({ tone: "info", title: t.resetSent, description: t.resetSentDesc })}
            >
              {t.forgot}
            </Button>
          </div>
          <Button type="submit" fullWidth loading={mutation.isPending}>{t.submit}</Button>
        </Stack>
      </form>

      <Alert tone="info" title={t.demo}>
        <p>{t.demoPassword}</p>
        <p className="mt-2">{t.demoOperators}</p>
        <ul className="flex flex-col">
          {OPERATOR_DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <Button type="button" variant="link" size="sm" onClick={() => setEmail(a.email)}>{t[a.label]} – {a.email}</Button>
            </li>
          ))}
        </ul>
      </Alert>

      <p className="text-center text-sm text-fg-muted">
        {t.noAccount}{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">{t.register}</Link>
      </p>
    </AuthFrame>
  );
}
