"use client";
// Đăng ký: (1) tài khoản → (2) doanh nghiệp theo MST → (3) hoàn tất.
// MST mới → tạo doanh nghiệp, người đăng ký là Chủ sở hữu. MST đã có → gửi yêu cầu tham gia cho Chủ sở hữu duyệt.
import { Alert, Button, Field, Input, Stack, Stepper } from "@kb/ui";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Search, Send } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { lookupTaxCode, register, type CompanyLookup } from "@/api/session";
import { AuthFrame } from "./auth-frame";

type Step = "account" | "company" | "done";
const STEPS = [
  { id: "account", label: "Tài khoản" },
  { id: "company", label: "Doanh nghiệp" },
  { id: "done", label: "Hoàn tất" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const err = (e: string | undefined) => (e ? { error: e } : {});

export function RegisterPage() {
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
    if (account.name.trim().length < 2) next.name = "Nhập họ tên";
    if (!EMAIL_RE.test(account.email.trim())) next.email = "Email không hợp lệ";
    if (account.password.length < 8) next.password = "Mật khẩu ít nhất 8 ký tự";
    if (account.confirm !== account.password) next.confirm = "Mật khẩu nhập lại không khớp";
    setAccountErrors(next);
    if (Object.keys(next).length === 0) setStep("company");
  };

  const doLookup = () => {
    const digits = taxCode.replace(/\D/g, "");
    if (digits.length !== 10 && digits.length !== 13) {
      setTaxError("MST gồm 10 hoặc 13 chữ số");
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
        <h1 className="text-2xl font-semibold text-fg">Đăng ký doanh nghiệp</h1>
        <p className="text-sm text-fg-muted">Mỗi doanh nghiệp (một MST) là một không gian làm việc riêng.</p>
      </Stack>

      <Stepper steps={STEPS} currentId={step} label="Các bước đăng ký" />

      {step === "account" && (
        <form onSubmit={submitAccount} noValidate>
          <Stack gap="md">
            <Field label="Họ và tên" required {...err(accountErrors.name)}>
              <Input autoComplete="name" value={account.name} onChange={(e) => setField("name", e.target.value)} placeholder="Nguyễn Văn An" />
            </Field>
            <Field label="Email công việc" required hint="Dùng để đăng nhập và nhận thông báo" {...err(accountErrors.email)}>
              <Input type="email" autoComplete="email" value={account.email} onChange={(e) => setField("email", e.target.value)} placeholder="ten@congty.vn" />
            </Field>
            <div className="grid grid-cols-1 gap-4 cq-sm:grid-cols-2">
              <Field label="Mật khẩu" required {...err(accountErrors.password)}>
                <Input type="password" autoComplete="new-password" value={account.password} onChange={(e) => setField("password", e.target.value)} />
              </Field>
              <Field label="Nhập lại mật khẩu" required {...err(accountErrors.confirm)}>
                <Input type="password" autoComplete="new-password" value={account.confirm} onChange={(e) => setField("confirm", e.target.value)} />
              </Field>
            </div>
            <Button type="submit" fullWidth>Tiếp tục</Button>
          </Stack>
        </form>
      )}

      {step === "company" && (
        <Stack gap="md">
          <Field label="Mã số thuế doanh nghiệp" required hint="Thử 0316789012 để xem trường hợp doanh nghiệp đã có trên hệ thống" {...err(taxError)}>
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
                placeholder="10 hoặc 13 chữ số"
              />
              <Button type="button" variant="secondary" leftIcon={<Search className="h-4 w-4" />} loading={lookup.isPending} onClick={doLookup}>
                Tra cứu
              </Button>
            </div>
          </Field>

          {company?.found === false && (
            <Alert tone="warning" title="Không tìm thấy MST">Kiểm tra lại mã số thuế hoặc liên hệ hỗ trợ.</Alert>
          )}

          {company?.found === true && company.existing && (
            <Alert tone="warning" title="Doanh nghiệp đã có trên hệ thống">
              {company.name} đã đăng ký KhaiBáo AI. Bạn có thể gửi yêu cầu tham gia – Chủ sở hữu của doanh nghiệp sẽ duyệt.
            </Alert>
          )}

          {company?.found === true && !company.existing && (
            <Stack gap="md">
              <Field label="Tên doanh nghiệp" hint="Theo thông tin đăng ký thuế">
                <Input value={company.name} readOnly />
              </Field>
              <Field label="Địa chỉ">
                <Input value={company.address} readOnly />
              </Field>
              <Alert tone="info" title="Gói dùng thử 14 ngày">Bạn sẽ là Chủ sở hữu và có thể mời thêm thành viên sau.</Alert>
            </Stack>
          )}

          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" onClick={() => setStep("account")}>Quay lại</Button>
            {company?.found === true && (
              <Button
                type="button"
                loading={submit.isPending}
                leftIcon={joined ? <Send className="h-4 w-4" /> : undefined}
                onClick={() => submit.mutate(company.existing)}
              >
                {company.existing ? "Gửi yêu cầu tham gia" : "Tạo doanh nghiệp"}
              </Button>
            )}
          </div>
        </Stack>
      )}

      {step === "done" && (
        <Stack gap="md" align="center" className="py-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-fg">{joined ? "Đã gửi yêu cầu tham gia" : "Đăng ký thành công"}</h2>
          <p className="max-w-sm text-sm text-fg-muted">
            {joined
              ? "Chủ sở hữu doanh nghiệp sẽ nhận email và duyệt yêu cầu. Bạn sẽ được báo khi có thể đăng nhập."
              : `Đã gửi email xác thực tới ${account.email}. Bạn có thể bắt đầu tạo hồ sơ ngay.`}
          </p>
          <Button asChild>
            <Link href={joined ? "/login" : "/"}>{joined ? "Về trang đăng nhập" : "Vào trang tổng quan"}</Link>
          </Button>
        </Stack>
      )}

      {step !== "done" && (
        <p className="text-center text-sm text-fg-muted">
          Đã có tài khoản?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">Đăng nhập</Link>
        </p>
      )}
    </AuthFrame>
  );
}
