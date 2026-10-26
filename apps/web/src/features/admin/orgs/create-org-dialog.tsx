"use client";
// Tạo hộ doanh nghiệp ký hợp đồng trực tiếp: doanh nghiệp + gói + hợp đồng + Chủ sở hữu (mật khẩu tạm, bắt đổi ở lần đăng nhập đầu).
// Tạo xong hộp chuyển sang bước "gửi thông tin đăng nhập": mật khẩu tạm chỉ hiện MỘT lần ở đây.
import { CreateOrgInputSchema, type CreateOrgResult, type PlanCode } from "@kb/contracts";
import {
  Alert, Button, DatePicker, Dialog, DialogContent, DialogFooter, Field, fill, Grid, Input, Select, Stack, Textarea, toast, useMessages,
} from "@kb/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, Copy, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys, createOrg, listAdminPlans } from "@/api/admin";
import { lookupTaxCode } from "@/api/session";
import { useAdminMutation } from "../common/use-admin-mutation";
import { CREATE_ORG_MESSAGES } from "./orgs.messages";

type Draft = {
  taxCode: string; name: string; address: string; planCode: PlanCode | ""; contractNo: string; contractEndsOn: string | null;
  ownerName: string; ownerEmail: string; note: string;
};
type ErrorKey = "taxCode" | "name" | "ownerName" | "ownerEmail";

const EMPTY: Draft = { taxCode: "", name: "", address: "", planCode: "", contractNo: "", contractEndsOn: null, ownerName: "", ownerEmail: "", note: "" };

async function copyText(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ tone: "success", title: done });
  } catch {
    // Trình duyệt chặn clipboard (http, quyền) → người dùng tự bôi đen chép.
  }
}

/** Bước sau khi tạo: thông tin đăng nhập để gửi khách. */
function CreatedView({ result, onClose }: { result: CreateOrgResult; onClose: () => void }) {
  const t = useMessages(CREATE_ORG_MESSAGES);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/login`;
  const share = fill(t.shareText, { org: result.orgName, url, email: result.ownerEmail, password: result.tempPassword });
  const rows = [
    { label: t.loginUrl, value: url },
    { label: t.loginEmail, value: result.ownerEmail },
    { label: t.tempPassword, value: result.tempPassword, secret: true },
  ];
  return (
    <>
      <Stack gap="md">
        <Alert tone="warning" title={t.doneTitle}>{t.doneBody}</Alert>
        <dl className="flex flex-col divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-fg-muted">{r.label}</dt>
                <dd className={r.secret ? "select-all break-all font-mono text-base font-semibold text-fg" : "break-all text-sm text-fg"}>{r.value}</dd>
              </div>
              <Button size="sm" variant="ghost" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copyText(r.value, t.copied)} aria-label={`${t.copy} – ${r.label}`}>
                {t.copy}
              </Button>
            </div>
          ))}
        </dl>
      </Stack>
      {/* Khung hẹp: hai nút xuống hàng thay vì tràn khỏi hộp. */}
      <DialogFooter className="flex-wrap">
        <Button variant="secondary" leftIcon={<Copy className="h-4 w-4" />} onClick={() => void copyText(share, t.copied)}>{t.copyAll}</Button>
        <Button onClick={onClose}>{t.close}</Button>
      </DialogFooter>
    </>
  );
}

export function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useMessages(CREATE_ORG_MESSAGES);
  const plans = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans, enabled: open });
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [lookupNote, setLookupNote] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [result, setResult] = useState<CreateOrgResult | null>(null);
  useEffect(() => {
    if (open) {
      setDraft(EMPTY);
      setErrors({});
      setLookupNote(null);
      setResult(null);
    }
  }, [open]);
  // Gói mặc định: gói trả phí đầu tiên (doanh nghiệp ký hợp đồng không đi qua dùng thử).
  const planOptions = (plans.data ?? []).map((p) => ({ value: p.code, label: p.name }));
  const planCode = draft.planCode || ((plans.data ?? []).find((p) => p.code !== "TRIAL")?.code ?? plans.data?.[0]?.code ?? "");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  // Tra MST chỉ điền sẵn form – không ghi gì, không cần toast / tải lại dữ liệu như thao tác quản trị.
  const lookup = useMutation({ mutationFn: () => lookupTaxCode(draft.taxCode) });
  const runLookup = async () => {
    const r = await lookup.mutateAsync().catch(() => null);
    if (!r || !r.found) return setLookupNote({ tone: "warning", text: t.lookupNotFound });
    setDraft((d) => ({ ...d, name: d.name || r.name, address: d.address || r.address }));
    setLookupNote(r.existing ? { tone: "warning", text: t.lookupExisting } : { tone: "success", text: t.lookupFound });
  };

  const create = useAdminMutation({
    mutationFn: createOrg,
    success: (r) => fill(t.created, { name: r.orgName }),
    errorTitle: t.createError,
    onSuccess: setResult,
  });
  const submit = () => {
    const parsed = CreateOrgInputSchema.safeParse({
      taxCode: draft.taxCode,
      name: draft.name,
      address: draft.address,
      planCode,
      ...(draft.contractNo.trim() ? { contractNo: draft.contractNo } : {}),
      ...(draft.contractEndsOn ? { contractEndsOn: draft.contractEndsOn } : {}),
      owner: { email: draft.ownerEmail, name: draft.ownerName },
      ...(draft.note.trim() ? { note: draft.note } : {}),
    });
    if (!parsed.success) {
      // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt → hiển thị theo trường lỗi.
      const found: typeof errors = {};
      for (const i of parsed.error.issues) {
        const [a, b] = i.path;
        if (a === "taxCode") found.taxCode ??= t.taxCodeInvalid;
        if (a === "name") found.name ??= t.nameRequired;
        if (a === "owner" && b === "name") found.ownerName ??= t.ownerNameRequired;
        if (a === "owner" && b === "email") found.ownerEmail ??= t.emailInvalid;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    create.mutate(parsed.data);
  };
  const err = (k: ErrorKey) => (errors[k] ? { error: errors[k] } : {});

  return (
    <Dialog open={open} onOpenChange={(o) => !create.isPending && onOpenChange(o)}>
      <DialogContent title={t.title} size="md" icon={<Building2 className="h-4 w-4" />} description={result ? result.orgName : t.description}>
        {result ? (
          <CreatedView result={result} onClose={() => onOpenChange(false)} />
        ) : (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Stack gap="lg">
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.sectionOrg}</legend>
                <Field label={t.taxCode} required {...err("taxCode")}>
                  <div className="flex gap-2">
                    <Input value={draft.taxCode} onChange={(e) => set("taxCode", e.target.value)} inputMode="numeric" autoFocus className="font-mono" />
                    <Button type="button" variant="secondary" leftIcon={<Search className="h-4 w-4" />} loading={lookup.isPending} disabled={draft.taxCode.replace(/\D/g, "").length < 10} onClick={() => void runLookup()}>
                      {t.lookup}
                    </Button>
                  </div>
                </Field>
                {lookupNote && <Alert tone={lookupNote.tone}>{lookupNote.text}</Alert>}
                <Field label={t.name} required {...err("name")}>
                  <Input value={draft.name} onChange={(e) => set("name", e.target.value)} />
                </Field>
                <Field label={t.address}>
                  <Textarea value={draft.address} onChange={(e) => set("address", e.target.value)} rows={2} />
                </Field>
              </fieldset>
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.sectionContract}</legend>
                <Field label={t.plan} required>
                  <Select options={planOptions} value={planCode} onChange={(e) => set("planCode", e.target.value as PlanCode)} />
                </Field>
                <Grid cols={{ base: 1, sm: 2 }}>
                  <Field label={t.contractNo}>
                    <Input value={draft.contractNo} onChange={(e) => set("contractNo", e.target.value)} />
                  </Field>
                  <Field label={t.contractEndsOn}>
                    <DatePicker value={draft.contractEndsOn} onChange={(v) => set("contractEndsOn", v)} />
                  </Field>
                </Grid>
              </fieldset>
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t.sectionOwner}</legend>
                <Grid cols={{ base: 1, sm: 2 }}>
                  <Field label={t.ownerName} required {...err("ownerName")}>
                    <Input value={draft.ownerName} onChange={(e) => set("ownerName", e.target.value)} autoComplete="off" />
                  </Field>
                  <Field label={t.ownerEmail} required {...err("ownerEmail")}>
                    <Input type="email" value={draft.ownerEmail} onChange={(e) => set("ownerEmail", e.target.value)} autoComplete="off" />
                  </Field>
                </Grid>
                <Field label={t.note} hint={t.noteHint}>
                  <Textarea value={draft.note} onChange={(e) => set("note", e.target.value)} rows={3} maxLength={2000} />
                </Field>
              </fieldset>
            </Stack>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>{t.cancel}</Button>
              <Button type="submit" loading={create.isPending} disabled={!planCode}>{t.submit}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
