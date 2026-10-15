"use client";
// Tài khoản VNACCS của doanh nghiệp (thẻ Customs Hub). Mật khẩu/terminal key chỉ đi một chiều lên máy chủ, không bao giờ hiện lại.
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, Input, Skeleton, Stack, toast } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getSession, sessionKeys } from "@/api/session";
import { getVnaccsAccount, removeVnaccsAccount, saveVnaccsAccount, settingsKeys } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { emptyVnaccsForm, validateVnaccsForm, type VnaccsForm, type VnaccsFormErrors } from "./vnaccs-account-form";

const errorProp = (e: string | undefined) => (e ? { error: e } : {});

function VnaccsDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: { userId: string | null; terminalId: string | null } }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<VnaccsForm>(() => emptyVnaccsForm(current));
  const [errors, setErrors] = useState<VnaccsFormErrors>({});
  const save = useMutation({
    mutationFn: saveVnaccsAccount,
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.vnaccs });
      toast({ tone: "success", title: "Đã lưu tài khoản VNACCS", description: `User ID ${a.userId ?? ""} · bấm Kiểm tra kết nối để thử đăng nhập.` });
      onOpenChange(false);
    },
  });
  const set = (k: keyof VnaccsForm) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateVnaccsForm(form);
    if (!r.ok) return setErrors(r.errors);
    save.mutate(r.value);
  };
  const reset = (o: boolean) => {
    if (o) {
      setForm(emptyVnaccsForm(current));
      setErrors({});
      save.reset();
    }
    onOpenChange(o);
  };
  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        title={current.userId ? "Đổi tài khoản VNACCS" : "Nhập tài khoản VNACCS"}
        icon={<KeyRound className="h-4 w-4" />}
        size="sm"
        description="Tài khoản do Hải quan cấp cho doanh nghiệp, gửi kèm mỗi lần truyền tờ khai. Mật khẩu và Terminal Access Key được mã hóa ở máy chủ và không hiện lại."
      >
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{save.error.message}</Alert>}
            <Field label="User ID" required {...errorProp(errors.userId)}>
              <Input value={form.userId} onChange={set("userId")} autoComplete="off" className="font-mono" placeholder="BI820001" />
            </Field>
            <Field label="Mật khẩu" required hint={current.userId ? "Nhập lại mật khẩu – máy chủ không trả mật khẩu cũ." : undefined} {...errorProp(errors.password)}>
              <Input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
            <Field label="Terminal ID" required {...errorProp(errors.terminalId)}>
              <Input value={form.terminalId} onChange={set("terminalId")} autoComplete="off" className="font-mono" placeholder="Z9999M" />
            </Field>
            <Field label="Terminal Access Key" required {...errorProp(errors.terminalAccessKey)}>
              <Input type="password" value={form.terminalAccessKey} onChange={set("terminalAccessKey")} autoComplete="off" className="font-mono" />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" loading={save.isPending}>Lưu tài khoản</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Khu tài khoản VNACCS trong thẻ Customs Hub. */
export function VnaccsAccountSection() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.vnaccs, queryFn: getVnaccsAccount });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const remove = useMutation({
    mutationFn: removeVnaccsAccount,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.vnaccs });
      toast({ tone: "success", title: "Đã gỡ tài khoản VNACCS", description: "Doanh nghiệp không truyền được tờ khai tới khi nhập lại." });
    },
    onError: toastMutationError("Không gỡ được tài khoản VNACCS"),
  });

  if (isError) {
    return (
      <Alert tone="danger" title="Không tải được tài khoản VNACCS">
        <Button size="sm" variant="secondary" onClick={() => void refetch()}>Thử lại</Button>
      </Alert>
    );
  }
  if (isLoading || !data) return <Skeleton className="h-16" />;
  return (
    <section aria-label="Tài khoản VNACCS" className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">Tài khoản VNACCS</p>
          {data.configured ? (
            <p className="text-sm text-fg-muted">
              User ID <span className="font-mono">{data.userId}</span> · Terminal <span className="font-mono">{data.terminalId}</span>
              {data.updatedAt && <span className="text-fg-subtle"> · cập nhật {formatRelative(data.updatedAt)}</span>}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">Chưa nhập – cần có để truyền tờ khai qua FPT.VNACCS.</p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant={data.configured ? "secondary" : "primary"} leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => setOpen(true)}>
              {data.configured ? "Đổi tài khoản" : "Nhập tài khoản VNACCS"}
            </Button>
            {data.configured && (
              <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-4 w-4" />} loading={remove.isPending} onClick={() => remove.mutate()}>
                Gỡ
              </Button>
            )}
          </div>
        )}
      </div>
      {!canManage && !data.configured && <p className="mt-2 text-xs text-fg-subtle">Nhờ Quản trị hoặc Chủ sở hữu nhập tài khoản.</p>}
      <VnaccsDialog open={open} onOpenChange={setOpen} current={{ userId: data.userId, terminalId: data.terminalId }} />
    </section>
  );
}
