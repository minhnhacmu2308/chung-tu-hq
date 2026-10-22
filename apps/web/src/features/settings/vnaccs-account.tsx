"use client";
// Tài khoản VNACCS của doanh nghiệp (thẻ Customs Hub). Mật khẩu/terminal key chỉ đi một chiều lên máy chủ, không bao giờ hiện lại.
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, Input, Skeleton, Stack, fill, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getSession, sessionKeys } from "@/api/session";
import { getVnaccsAccount, removeVnaccsAccount, saveVnaccsAccount, settingsKeys } from "@/api/settings";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { VNACCS_ACCOUNT_MESSAGES } from "./vnaccs-account.messages";
import { emptyVnaccsForm, validateVnaccsForm, type VnaccsForm, type VnaccsFormErrors } from "./vnaccs-account-form";

const errorProp = (e: string | undefined) => (e ? { error: e } : {});

function VnaccsDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (o: boolean) => void; current: { userId: string | null; terminalId: string | null } }) {
  const qc = useQueryClient();
  const t = useMessages(VNACCS_ACCOUNT_MESSAGES);
  const locale = useUiLocale();
  const [form, setForm] = useState<VnaccsForm>(() => emptyVnaccsForm(current));
  const [errors, setErrors] = useState<VnaccsFormErrors>({});
  const save = useMutation({
    mutationFn: saveVnaccsAccount,
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: settingsKeys.vnaccs });
      toast({ tone: "success", title: t.saved, description: fill(t.savedDesc, { userId: a.userId ?? "" }) });
      onOpenChange(false);
    },
  });
  const set = (k: keyof VnaccsForm) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((x) => ({ ...x, [k]: undefined }));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = validateVnaccsForm(form, locale);
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
        title={current.userId ? t.changeTitle : t.enterTitle}
        icon={<KeyRound className="h-4 w-4" />}
        size="sm"
        description={t.dialogDesc}
      >
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{save.error.message}</Alert>}
            <Field label={t.userId} required {...errorProp(errors.userId)}>
              {/* kb-allow-raw: ví dụ định dạng mã người dùng VNACCS, không dịch */}
              <Input value={form.userId} onChange={set("userId")} autoComplete="off" className="font-mono" placeholder="BI820001" />
            </Field>
            <Field label={t.password} required hint={current.userId ? t.passwordHint : undefined} {...errorProp(errors.password)}>
              <Input type="password" value={form.password} onChange={set("password")} autoComplete="new-password" />
            </Field>
            <Field label={t.terminalId} required {...errorProp(errors.terminalId)}>
              <Input value={form.terminalId} onChange={set("terminalId")} autoComplete="off" className="font-mono" placeholder="Z9999M" />
            </Field>
            <Field label={t.terminalAccessKey} required {...errorProp(errors.terminalAccessKey)}>
              <Input type="password" value={form.terminalAccessKey} onChange={set("terminalAccessKey")} autoComplete="off" className="font-mono" />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Khu tài khoản VNACCS trong thẻ Customs Hub. */
export function VnaccsAccountSection() {
  const qc = useQueryClient();
  const t = useMessages(VNACCS_ACCOUNT_MESSAGES);
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.vnaccs, queryFn: getVnaccsAccount });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const remove = useMutation({
    mutationFn: removeVnaccsAccount,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.vnaccs });
      toast({ tone: "success", title: t.removed, description: t.removedDesc });
    },
    onError: toastMutationError(t.removeError),
  });

  if (isError) {
    return (
      <Alert tone="danger" title={t.loadError}>
        <Button size="sm" variant="secondary" onClick={() => void refetch()}>{t.retry}</Button>
      </Alert>
    );
  }
  if (isLoading || !data) return <Skeleton className="h-16" />;
  return (
    <section aria-label={t.section} className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-fg">{t.section}</p>
          {data.configured ? (
            <p className="text-sm text-fg-muted">
              {t.userId} <span className="font-mono">{data.userId}</span> · {t.terminal} <span className="font-mono">{data.terminalId}</span>
              {data.updatedAt && <span className="text-fg-subtle">{fill(t.updated, { when: formatRelative(data.updatedAt) })}</span>}
            </p>
          ) : (
            <p className="text-sm text-fg-muted">{t.notSet}</p>
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button size="sm" variant={data.configured ? "secondary" : "primary"} leftIcon={<KeyRound className="h-4 w-4" />} onClick={() => setOpen(true)}>
              {data.configured ? t.change : t.enter}
            </Button>
            {data.configured && (
              <Button size="sm" variant="ghost" leftIcon={<Trash2 className="h-4 w-4" />} loading={remove.isPending} onClick={() => remove.mutate()}>
                {t.remove}
              </Button>
            )}
          </div>
        )}
      </div>
      {!canManage && !data.configured && <p className="mt-2 text-xs text-fg-subtle">{t.askAdmin}</p>}
      <VnaccsDialog open={open} onOpenChange={setOpen} current={{ userId: data.userId, terminalId: data.terminalId }} />
    </section>
  );
}
