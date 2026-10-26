"use client";
// Màn bắt đổi mật khẩu tạm: tài khoản do quản trị KhaiBáo AI tạo hộ (doanh nghiệp ký hợp đồng trực tiếp, quản trị viên đầu tiên).
// Dùng chung cho ứng dụng khách và khu Quản trị: thay toàn bộ khung cho tới khi đổi xong – API khác trả PASSWORD_CHANGE_REQUIRED.
import { Alert, BrandMark, Button, Card, CardContent, CardDescription, CardHeader, Field, Input, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { changePassword, logout } from "@/api/session";
import { errorText } from "@/lib/reason-codes";
import { CHANGE_PASSWORD_MESSAGES } from "./change-password.messages";

type Errors = Partial<Record<"current" | "next" | "confirm", string>>;

export function ChangePasswordScreen() {
  const t = useMessages(CHANGE_PASSWORD_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const change = useMutation({
    mutationFn: () => changePassword({ currentPassword: form.current, newPassword: form.next }),
    onSuccess: async () => {
      toast({ tone: "success", title: t.done });
      // Phiên mới (cookie đã đổi) → tải lại mọi thứ, khung hiện bình thường (khu quản trị chuyển sang bước 2FA).
      await qc.invalidateQueries();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Errors = {};
    if (!form.current) found.current = t.currentRequired;
    if (form.next.length < 8) found.next = t.tooShort;
    else if (form.next === form.current) found.next = t.sameAsCurrent;
    if (form.confirm !== form.next) found.confirm = t.mismatch;
    setErrors(found);
    if (Object.keys(found).length === 0) change.mutate();
  };
  const signOut = () => {
    void logout().finally(() => {
      qc.clear();
      router.push("/login");
    });
  };

  return (
    <main className="@container flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <BrandMark decorative className="h-7 w-7" />
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold text-fg">{t.title}</h1>
          <CardDescription>{t.subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate>
            <Stack gap="md">
              {change.isError && <Alert tone="danger" title={t.failed}>{errorText(change.error, locale)}</Alert>}
              <Field label={t.current} required {...(errors.current ? { error: errors.current } : {})}>
                <Input type="password" autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} autoFocus />
              </Field>
              <Field label={t.next} hint={t.nextHint} required {...(errors.next ? { error: errors.next } : {})}>
                <Input type="password" autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
              </Field>
              <Field label={t.confirm} required {...(errors.confirm ? { error: errors.confirm } : {})}>
                <Input type="password" autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
              </Field>
              <Button type="submit" fullWidth loading={change.isPending}>{t.submit}</Button>
              <Button type="button" variant="ghost" fullWidth onClick={signOut}>{t.signOut}</Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
