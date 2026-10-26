"use client";
// Cấu hình máy chủ gửi mail (SMTP) cho cả hệ thống: điền nhanh Gmail / Outlook, lưu (mật khẩu mã hóa) và kiểm tra đăng nhập ngay,
// gửi email thử tới chính mình. Quyền Nền tảng.
import { UpdateMailSettingsInputSchema, type MailSettings } from "@kb/contracts";
import {
  Alert, Button, Card, CardContent, CardFooter, Field, fill, Grid, Input, PageHeader, PageLoading, SegmentedControl, Stack, StatusBadge, useMessages,
} from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { KeyRound, MailCheck, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys, getMailSettings, testMailSettings, updateMailSettings } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatRelative } from "@/lib/format";
import { useAdminMutation } from "../common/use-admin-mutation";
import { EMAIL_PAGES_MESSAGES } from "./email.messages";

type Form = { host: string; port: string; secure: boolean; username: string; password: string; fromName: string; fromEmail: string; replyTo: string };
const toForm = (s: MailSettings): Form => ({ host: s.host, port: String(s.port), secure: s.secure, username: s.username, password: "", fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo ?? "" });

export function MailSettingsPage() {
  const t = useMessages(EMAIL_PAGES_MESSAGES);
  const q = useQuery({ queryKey: adminKeys.mailSettings, queryFn: getMailSettings });
  const [form, setForm] = useState<Form | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (q.data && !form) setForm(toForm(q.data));
  }, [q.data, form]);
  const save = useAdminMutation({
    mutationFn: (f: Form) =>
      updateMailSettings({
        host: f.host, port: Number(f.port), secure: f.secure, username: f.username, fromName: f.fromName, fromEmail: f.fromEmail,
        ...(f.password ? { password: f.password } : {}), ...(f.replyTo.trim() ? { replyTo: f.replyTo } : { replyTo: "" }),
      }),
    success: () => t.settingsSaved,
    errorTitle: t.saveFailed,
    onSuccess: (s) => setForm(toForm(s)),
  });
  const test = useAdminMutation({ mutationFn: () => testMailSettings(), success: (s) => s.lastTest?.detail ?? t.testOk, errorTitle: t.testFailed });

  if (q.isError) return <LoadError onRetry={() => void q.refetch()} title={t.loadError} />;
  if (!q.data || !form) return <PageLoading label={t.settingsTitle} />;
  const s = q.data;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  const preset = (p: "gmail" | "outlook") =>
    setForm({ ...form, ...(p === "gmail" ? { host: "smtp.gmail.com", port: "465", secure: true } : { host: "smtp.office365.com", port: "587", secure: false }) });
  const submit = () => {
    const r = UpdateMailSettingsInputSchema.safeParse({ ...form, port: Number(form.port), password: form.password || undefined });
    if (!r.success) return setProblem(r.error.issues[0]?.message ?? t.saveFailed);
    setProblem(null);
    save.mutate(form);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t.settingsTitle} description={t.settingsDesc} />
      {s.lastTest && (
        <Alert tone={s.lastTest.ok ? "success" : "danger"} title={`${s.lastTest.ok ? t.testOk : t.testFail} · ${fill(t.lastTest, { when: formatRelative(s.lastTest.at) })}`}>
          {s.lastTest.detail}
        </Alert>
      )}
      <Card className="max-w-4xl">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <CardContent className="pt-6">
            <Stack gap="md">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-fg-muted">{t.preset}:</span>
                <Button type="button" size="sm" variant="secondary" onClick={() => preset("gmail")}>{t.presetGmail}</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => preset("outlook")}>{t.presetOutlook}</Button>
              </div>
              <Grid cols={{ base: 1, md: 2 }}>
                <Field label={t.host} required>
                  <Input value={form.host} onChange={(e) => set("host", e.target.value)} autoComplete="off" />
                </Field>
                <Field label={t.port} required>
                  <Input type="number" value={form.port} onChange={(e) => set("port", e.target.value)} />
                </Field>
                <SegmentedControl className="cq-md:col-span-2 cq-md:justify-start" label={t.security} value={form.secure ? "ssl" : "tls"} onChange={(v) => set("secure", v === "ssl")} options={[{ value: "ssl", label: t.ssl }, { value: "tls", label: t.starttls }]} />
                <Field label={t.username}>
                  <Input value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
                </Field>
                <Field label={t.password} hint={t.passwordHint}>
                  <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} autoComplete="new-password" placeholder={s.hasPassword ? t.passwordKeep : ""} />
                </Field>
                <Field label={t.fromName} required>
                  <Input value={form.fromName} onChange={(e) => set("fromName", e.target.value)} />
                </Field>
                <Field label={t.fromEmail} required>
                  <Input type="email" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} />
                </Field>
                <Field label={t.replyTo} hint={t.replyToHint}>
                  <Input type="email" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
                </Field>
              </Grid>
              <p className="flex items-center gap-2 text-xs text-fg-muted">
                <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
                {t.secretNote}
              </p>
              {problem && <Alert tone="danger">{problem}</Alert>}
            </Stack>
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-2">
            {s.configured ? <StatusBadge status={s.lastTest?.ok === false ? "INTEGRATION_ERROR" : "INTEGRATION_CONNECTED"} /> : <StatusBadge status="INTEGRATION_NOT_CONFIGURED" />}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" leftIcon={<MailCheck className="h-4 w-4" />} disabled={!s.configured} loading={test.isPending} onClick={() => test.mutate(undefined)}>{t.sendTestMail}</Button>
              <Button type="submit" leftIcon={<Save className="h-4 w-4" />} loading={save.isPending}>{t.saveAndTest}</Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </Stack>
  );
}
