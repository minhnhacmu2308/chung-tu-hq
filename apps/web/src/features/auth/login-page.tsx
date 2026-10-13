"use client";
import { Alert, Button, Checkbox, Field, Input, Stack, toast } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { login } from "@/api/session";
import { AuthFrame } from "./auth-frame";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginPage() {
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
      router.push("/");
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!EMAIL_RE.test(email.trim())) next.email = "Email không hợp lệ";
    if (password.length < 6) next.password = "Mật khẩu ít nhất 6 ký tự";
    setErrors(next);
    if (Object.keys(next).length === 0) mutation.mutate();
  };

  // Linh vật phản ứng theo form: đang gửi → suy nghĩ, sai → báo lỗi, đang gõ → lắng nghe.
  const robot = mutation.isPending ? "thinking" : mutation.isSuccess ? "happy" : mutation.isError ? "error" : typing ? "listening" : "idle";

  return (
    <AuthFrame robot={robot}>
      <Stack gap="xs">
        <h1 className="text-2xl font-semibold text-fg">Đăng nhập</h1>
        <p className="text-sm text-fg-muted">Dùng email công việc mà doanh nghiệp đã mời bạn.</p>
      </Stack>

      <form onSubmit={submit} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} noValidate>
        <Stack gap="md">
          {mutation.isError && <Alert tone="danger" title="Không đăng nhập được">Sai email hoặc mật khẩu.</Alert>}
          <Field label="Email" required {...(errors.email ? { error: errors.email } : {})}>
            <Input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@congty.vn" />
          </Field>
          <Field label="Mật khẩu" required {...(errors.password ? { error: errors.password } : {})}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Checkbox label="Ghi nhớ đăng nhập" defaultChecked />
            <Button
              type="button"
              variant="link"
              onClick={() => toast({ tone: "info", title: "Đã gửi liên kết đặt lại mật khẩu", description: "Kiểm tra hộp thư email của bạn (bản demo – không gửi thật)." })}
            >
              Quên mật khẩu?
            </Button>
          </div>
          <Button type="submit" fullWidth loading={mutation.isPending}>Đăng nhập</Button>
        </Stack>
      </form>

      <Alert tone="info" title="Bản demo">Mật khẩu bất kỳ từ 6 ký tự. Dữ liệu là dữ liệu mẫu.</Alert>

      <p className="text-center text-sm text-fg-muted">
        Doanh nghiệp chưa dùng KhaiBáo AI?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">Đăng ký theo MST</Link>
      </p>
    </AuthFrame>
  );
}
