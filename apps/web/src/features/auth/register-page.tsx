"use client";
// Đăng ký: (1) tài khoản → (2) doanh nghiệp theo MST → (3) hoàn tất.
// MST mới → tạo doanh nghiệp, người đăng ký là Chủ sở hữu. MST đã có → gửi yêu cầu tham gia cho Chủ sở hữu duyệt.
import { Alert, Button, Field, Input, Stack, Stepper, fill, useMessages } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Search, Send } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { lookupTaxCode, register, type CompanyLookup } from "@/api/session";
import { AuthFrame } from "./auth-frame";
import { REGISTER_MESSAGES } from "./auth.messages";

type Step = "account" | "company" | "done";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const err = (e: string | undefined) => (e ? { error: e } : {});

export function RegisterPage() {
  const t = useMessages(REGISTER_MESSAGES);
  const steps = [
    { id: "account", label: t.stepAccount },
    { id: "company", label: t.stepCompany },
    { id: "done", label: t.stepDone },
  ];
  const [step, setStep] = useState<Step>("account");
  const [account, setAccount] = useState({ name: "", email: "", password: "", confirm: "" });
  const [accountErrors, setAccountErrors] = useState<Partial<Record<keyof typeof account, string>>>({});
  const [taxCode, setTaxCode] = useState("");
  const [taxError, setTaxError] = useState<string>();
  const [company, setCompany] = useState<CompanyLookup | null>(null);

  const lookup = useMutation({
    mutationFn: () => lookupTaxCode(taxCode),
    onSuccess: (r) => setCompany(r),
  });
  const submit = useMutation({
    mutationFn: (joinExisting: boolean) => register({ email: account.email, name: account.name, password: account.password, taxCode, joinExisting }),
    onSuccess: () => setStep("done"),
  });

  const setField = (k: keyof typeof account, v: string) => {
    setAccount((a) => ({ ...a, [k]: v }));
    setAccountErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submitAccount = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof accountErrors = {};
    if (account.name.trim().length < 2) next.name = t.nameRequired;
    if (!EMAIL_RE.test(account.email.trim())) next.email = t.invalidEmail;
    if (account.password.length < 8) next.password = t.passwordMin;
    if (account.confirm !== account.password) next.confirm = t.confirmMismatch;
    setAccountErrors(next);
    if (Object.keys(next).length === 0) setStep("company");
  };

  const doLookup = () => {
    const digits = taxCode.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 13) {
      setTaxError(t.taxCodeInvalid);
      setCompany(null);
      return;
    }
    setTaxError(undefined);
    lookup.mutate();
  };

  const joined = company?.found === true && company.existing;

  // Linh vật phản ứng theo form: tra MST → tìm kiếm, gửi đăng ký → suy nghĩ, lỗi → báo lỗi.
  const robot = lookup.isPending ? "searching" : submit.isPending ? "thinking" : submit.isSuccess ? "happy" : lookup.isError || submit.isError ? "error" : "idle";

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">{t.title}</h1>
        <p className="text-sm text-fg-muted">{t.subtitle}</p>
      </Stack>

      <Stepper steps={steps} currentId={step} label={t.stepsLabel} />

      {step === "account" && (
        <form onSubmit={submitAccount} noValidate>
          <Stack gap="md">
            <Field label={t.fullName} required {...err(accountErrors.name)}>
              <Input autoComplete="name" value={account.name} onChange={(e) => setField("name", e.target.value)} placeholder={t.fullNamePlaceholder} />
            </Field>
            <Field label={t.workEmail} required hint={t.workEmailHint} {...err(accountErrors.email)}>
              <Input type="email" autoComplete="email" value={account.email} onChange={(e) => setField("email", e.target.value)} placeholder="ten@congty.vn" />
            </Field>
            <div className="grid grid-cols-1 gap-4 cq-sm:grid-cols-2">
              <Field label={t.password} required {...err(accountErrors.password)}>
                <Input type="password" autoComplete="new-password" value={account.password} onChange={(e) => setField("password", e.target.value)} />
              </Field>
              <Field label={t.confirm} required {...err(accountErrors.confirm)}>
                <Input type="password" autoComplete="new-password" value={account.confirm} onChange={(e) => setField("confirm", e.target.value)} />
              </Field>
            </div>
            <Button type="submit" fullWidth>{t.continue}</Button>
          </Stack>
        </form>
      )}

      {step === "company" && (
        <Stack gap="md">
          <Field label={t.taxCode} required hint={t.taxCodeHint} {...err(taxError)}>
            <div className="flex gap-2">
              <Input
                inputMode="numeric"
                value={taxCode}
                onChange={(e) => {
                  setTaxCode(e.target.value);
                  setCompany(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    doLookup();
                  }
                }}
                placeholder={t.taxCodePlaceholder}
              />
              <Button type="button" variant="secondary" leftIcon={<Search className="h-4 w-4" />} loading={lookup.isPending} onClick={doLookup}>
                {t.lookup}
              </Button>
            </div>
          </Field>

          {company?.found === false && (
            <Alert tone="warning" title={t.notFound}>{t.notFoundDesc}</Alert>
          )}

          {company?.found === true && company.existing && (
            <Alert tone="warning" title={t.exists}>
              {fill(t.existsDesc, { name: company.name })}
            </Alert>
          )}

          {company?.found === true && !company.existing && (
            <Stack gap="md">
              <Field label={t.companyName} hint={t.companyNameHint}>
                <Input value={company.name} readOnly />
              </Field>
              <Field label={t.address}>
                <Input value={company.address} readOnly />
              </Field>
              <Alert tone="info" title={t.trial}>{t.trialDesc}</Alert>
            </Stack>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("account")}>{t.back}</Button>
            {company?.found === true && (
              <Button
                type="button"
                loading={submit.isPending}
                leftIcon={joined ? <Send className="h-4 w-4" /> : undefined}
                onClick={() => submit.mutate(company.existing)}
              >
                {company.existing ? t.sendJoin : t.createOrg}
              </Button>
            )}
          </div>
        </Stack>
      )}

      {step === "done" && (
        <Stack gap="md" align="center" className="py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-fg">{joined ? t.joinSent : t.success}</h2>
          <p className="max-w-sm text-sm text-fg-muted">
            {joined
              ? t.joinSentDesc
              : fill(t.successDesc, { email: account.email })}
          </p>
          <Button asChild>
            <Link href={joined ? "/login" : "/"}>{joined ? t.toLogin : t.toOverview}</Link>
          </Button>
        </Stack>
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-fg-muted">
          {t.haveAccount}{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">{t.signIn}</Link>
        </p>
      )}
    </AuthFrame>
  );
}
