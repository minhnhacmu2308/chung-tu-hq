"use client";
// Cài đặt hóa đơn thương mại xuất khẩu (ADR 0013 mục 3): mẫu số + cách đánh lại (xem trước số đầu tiên), tên người bán, người ký.
import { formatDocNo, InvoiceSettingsInputSchema, patternIssue, vnDateOf, type NumberReset, type Organization } from "@kb/contracts";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Field, fill, Input, Select, SkeletonForm, Stack, toast, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getSession, sessionKeys } from "@/api/session";
import { getOrganization, settingsKeys, updateInvoiceSettings } from "@/api/settings";
import { LoadError } from "@/components/common/load-error";
import { toastMutationError } from "@/lib/mutation-error";
import { INVOICE_SETTINGS_MESSAGES } from "./invoice-settings-card.messages";

type Draft = { pattern: string; reset: NumberReset; signatoryName: string; signatoryTitle: string; sellerName: string };
const toDraft = (o: Organization): Draft => ({
  pattern: o.invoiceSettings.numbering.pattern, reset: o.invoiceSettings.numbering.reset,
  signatoryName: o.invoiceSettings.signatoryName ?? "", signatoryTitle: o.invoiceSettings.signatoryTitle ?? "", sellerName: o.invoiceSettings.sellerName ?? "",
});

export function InvoiceSettingsCard() {
  const qc = useQueryClient();
  const m = useMessages(INVOICE_SETTINGS_MESSAGES);
  const { data: org, isLoading, isError, refetch } = useQuery({ queryKey: settingsKeys.org, queryFn: getOrganization });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const [draft, setDraft] = useState<Draft>({ pattern: "", reset: "MONTH", signatoryName: "", signatoryTitle: "", sellerName: "" });
  useEffect(() => {
    if (org) setDraft(toDraft(org));
  }, [org]);
  const input = { numbering: { pattern: draft.pattern, reset: draft.reset }, signatoryName: draft.signatoryName, signatoryTitle: draft.signatoryTitle, sellerName: draft.sellerName };
  const parsed = InvoiceSettingsInputSchema.safeParse(input);
  const pattern = draft.pattern.trim().toUpperCase();
  const issue = patternIssue(pattern, draft.reset);
  const today = vnDateOf(new Date()); // ngày giờ Việt Nam (không lệch tháng lúc 0h–7h)

  const save = useMutation({
    mutationFn: () => updateInvoiceSettings(InvoiceSettingsInputSchema.parse(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.org });
      toast({ tone: "success", title: m.saved });
    },
    onError: toastMutationError(m.saveFailed),
  });

  if (isError) return <Card className="max-w-4xl p-5"><LoadError onRetry={() => void refetch()} /></Card>;
  if (isLoading || !org) return <Card className="max-w-4xl p-5"><SkeletonForm fields={4} /></Card>;
  const saved = toDraft(org);
  const dirty = (Object.keys(saved) as (keyof Draft)[]).some((k) => draft[k] !== saved[k]);

  return (
    <Card className="max-w-4xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.success) save.mutate();
        }}
      >
        <CardHeader className="pb-5">
          <CardTitle>{m.title}</CardTitle>
          <CardDescription>{m.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Stack gap="md">
            {!canManage && <p className="text-sm text-fg-muted">{m.adminOnly}</p>}
            <div className="grid gap-4 cq-md:grid-cols-3">
              <Field label={m.pattern} hint={m.patternHint} {...(issue ? { error: m[`issue${issue}`] } : {})} className="cq-md:col-span-2">
                <Input
                  value={draft.pattern}
                  onChange={(e) => setDraft({ ...draft, pattern: e.target.value.toUpperCase() })}
                  placeholder={m.patternPlaceholder}
                  maxLength={60}
                  className="font-mono"
                  disabled={!canManage}
                />
              </Field>
              <Field label={m.reset}>
                <Select
                  value={draft.reset}
                  onChange={(e) => setDraft({ ...draft, reset: e.target.value as NumberReset })}
                  options={[{ value: "MONTH", label: m.resetMonth }, { value: "YEAR", label: m.resetYear }, { value: "NEVER", label: m.resetNever }]}
                  disabled={!canManage}
                />
              </Field>
            </div>
            {!issue && <p className="text-sm text-fg-muted" aria-live="polite">{fill(m.preview, { no: formatDocNo(pattern, today, 1) })}</p>}
            <Field label={m.sellerName} hint={m.sellerNameHint}>
              <Input value={draft.sellerName} onChange={(e) => setDraft({ ...draft, sellerName: e.target.value })} placeholder={m.sellerNamePlaceholder} maxLength={255} disabled={!canManage} />
            </Field>
            <Field label={m.signatory} hint={m.signatoryHint}>
              <Input value={draft.signatoryName} onChange={(e) => setDraft({ ...draft, signatoryName: e.target.value })} placeholder={m.signatoryPlaceholder} maxLength={100} disabled={!canManage} />
            </Field>
            <Field label={m.title2} className="cq-md:max-w-xs">
              <Input value={draft.signatoryTitle} onChange={(e) => setDraft({ ...draft, signatoryTitle: e.target.value })} placeholder={m.titlePlaceholder} maxLength={100} disabled={!canManage} />
            </Field>
          </Stack>
        </CardContent>
        <CardFooter>
          <Button type="button" variant="ghost" disabled={!dirty} onClick={() => setDraft(saved)}>
            {m.undo}
          </Button>
          <Button type="submit" disabled={!canManage || !dirty || !parsed.success} loading={save.isPending}>{m.save}</Button>
        </CardFooter>
      </form>
    </Card>
  );
}
