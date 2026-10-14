"use client";
// Bước xác thực 2 lớp của khu Quản trị hệ thống: lần đầu thiết lập ứng dụng xác thực (QR + mã khôi phục), các phiên sau nhập mã 6 số.
import type { AdminMfaState } from "@kb/contracts";
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, LoadingState, PageHeader, Stack } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { confirmAdminMfaSetup, startAdminMfaSetup, verifyAdminMfa } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : "Có lỗi xảy ra, thử lại sau");

/** Ô nhập mã + nút xác nhận dùng chung cho thiết lập và đăng nhập. */
function CodeForm({ label, hint, submitLabel, pending, error, onSubmit }: { label: string; hint: string; submitLabel: string; pending: boolean; error: string | null; onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim() && !pending) onSubmit(code.trim());
  };
  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <Field label={label} hint={hint} {...(error ? { error } : {})}>
          <Input value={code} onChange={(e) => setCode(e.currentTarget.value)} inputMode="text" autoComplete="one-time-code" autoFocus className="font-mono md:max-w-xs" />
        </Field>
        <div>
          <Button type="submit" loading={pending} disabled={!code.trim()} leftIcon={<ShieldCheck className="h-4 w-4" />}>
            {submitLabel}
          </Button>
        </div>
      </Stack>
    </form>
  );
}

function Enroll({ onDone }: { onDone: () => void }) {
  // Mỗi lần mở màn là một khóa mới (khóa cũ chưa xác nhận bị thay) – không cache.
  const setup = useQuery({ queryKey: ["admin", "mfa", "setup"], queryFn: startAdminMfaSetup, gcTime: 0, staleTime: Infinity, retry: false });
  const confirm = useMutation({ mutationFn: confirmAdminMfaSetup });
  const [saved, setSaved] = useState(false);

  if (confirm.data) {
    return (
      <Stack gap="md">
        <Alert tone="success" title="Đã bật xác thực 2 lớp">
          Lưu 8 mã khôi phục dưới đây ở nơi an toàn (trình quản lý mật khẩu). Mỗi mã dùng được một lần khi mất điện thoại. Mã chỉ hiện lần này.
        </Alert>
        <ol aria-label="Mã khôi phục" className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted p-4 font-mono text-sm text-fg sm:grid-cols-4">
          {confirm.data.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <div>
          <Button
            onClick={() => {
              setSaved(true);
              onDone();
            }}
            loading={saved}
          >
            Tôi đã lưu mã khôi phục
          </Button>
        </div>
      </Stack>
    );
  }
  if (setup.isError) return <LoadError onRetry={() => void setup.refetch()} />;
  if (!setup.data) return <LoadingState title="Đang tạo khóa xác thực" />;
  return (
    <Stack gap="lg">
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-fg-muted">
        <li>Mở ứng dụng xác thực trên điện thoại (Google Authenticator, Microsoft Authenticator…).</li>
        <li>Quét mã QR bên dưới, hoặc nhập khóa thủ công.</li>
        <li>Nhập mã 6 số ứng dụng hiện ra để xác nhận.</li>
      </ol>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* SVG do máy chủ vẽ từ URI otpauth – nền trắng, đọc được cả ở chế độ tối. */}
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.data.qrSvg)}`} alt="Mã QR thiết lập ứng dụng xác thực" className="h-44 w-44 shrink-0 rounded-md border border-border" />
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">Khóa nhập thủ công</p>
          <p className="font-mono text-sm text-fg">{setup.data.secret.replace(/(.{4})/g, "$1 ").trim()}</p>
        </div>
      </div>
      <CodeForm
        label="Mã 6 số"
        hint="Mã đổi sau mỗi 30 giây."
        submitLabel="Bật xác thực 2 lớp"
        pending={confirm.isPending}
        error={confirm.isError ? errorMessage(confirm.error) : null}
        onSubmit={(code) => confirm.mutate(code)}
      />
    </Stack>
  );
}

function Verify({ onDone }: { onDone: () => void }) {
  const verify = useMutation({ mutationFn: verifyAdminMfa, onSuccess: onDone });
  return (
    <CodeForm
      label="Mã xác thực"
      hint="Mã 6 số trong ứng dụng xác thực. Mất điện thoại: nhập một mã khôi phục (dạng abcd-efgh) hoặc nhờ Quản trị cấp cao đặt lại."
      submitLabel="Xác nhận"
      pending={verify.isPending}
      error={verify.isError ? errorMessage(verify.error) : null}
      onSubmit={(code) => verify.mutate(code)}
    />
  );
}

/** Thay nội dung khu quản trị cho tới khi phiên qua bước 2FA. Xong → tải lại mọi dữ liệu (lần trước bị chặn MFA_REQUIRED). */
export function MfaGate({ mfa }: { mfa: AdminMfaState }) {
  const qc = useQueryClient();
  const done = () => void qc.invalidateQueries();
  return (
    <Stack gap="lg" className="mx-auto max-w-2xl">
      <PageHeader
        title={mfa.enrolled ? "Xác thực 2 lớp" : "Thiết lập xác thực 2 lớp"}
        description={
          mfa.enrolled
            ? "Khu quản trị nhìn được dữ liệu của mọi doanh nghiệp, nên mỗi phiên đăng nhập cần thêm mã từ điện thoại của bạn."
            : "Bắt buộc với mọi tài khoản quản trị hệ thống trước khi xem dữ liệu của doanh nghiệp."
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="h-5 w-5 text-primary" />
            {mfa.enrolled ? "Nhập mã từ ứng dụng xác thực" : "Kết nối ứng dụng xác thực"}
          </CardTitle>
        </CardHeader>
        <CardContent>{mfa.enrolled ? <Verify onDone={done} /> : <Enroll onDone={done} />}</CardContent>
      </Card>
    </Stack>
  );
}
