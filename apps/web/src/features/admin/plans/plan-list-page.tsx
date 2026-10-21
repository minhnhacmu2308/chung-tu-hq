"use client";
import { UpdatePlanInputSchema, type AdminPlan } from "@kb/contracts";
import { Alert, Badge, Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Field, Grid, Input, PageHeader, SkeletonCard, Stack, Textarea, fill, useMessages, useUiLocale } from "@kb/ui";
import { useQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { adminKeys, listAdminPlans, updateAdminPlan } from "@/api/admin";
import { LoadError } from "@/components/common/load-error";
import { formatNumber, formatVnd } from "@/lib/format";
import { PLAN_TONE } from "../common/admin-display";
import { useAdminMutation } from "../common/use-admin-mutation";
import { useAdminSession } from "../shell/use-admin-session";
import { PLAN_LIST_MESSAGES } from "./plan-list-page.messages";

type Draft = { name: string; dossiersPerMonth: string; pagesPerDossier: string; priceVnd: string; reason: string };
type Errors = Partial<Record<keyof Draft, string>>;

const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
/** Người dùng gõ "3.990.000" hay "3 990 000" đều được – bỏ dấu phân cách trước khi kiểm tra. */
const cleanMoney = (s: string) => s.replace(/[.\s,]/g, "");

function EditPlanDialog({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const t = useMessages(PLAN_LIST_MESSAGES);
  const locale = useUiLocale();
  const [draft, setDraft] = useState<Draft>({ name: "", dossiersPerMonth: "", pagesPerDossier: "", priceVnd: "", reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (plan) {
      setDraft({ name: plan.name, dossiersPerMonth: String(plan.dossiersPerMonth), pagesPerDossier: String(plan.pagesPerDossier), priceVnd: plan.priceVnd, reason: "" });
      setErrors({});
    }
  }, [plan]);

  const save = useAdminMutation({
    mutationFn: (input: Parameters<typeof updateAdminPlan>[1]) => updateAdminPlan(plan!.code, input),
    success: (p) => fill(t.saved, { name: p.name }),
    errorTitle: t.saveFailed,
    onSuccess: onClose,
  });

  const submit = () => {
    const parsed = UpdatePlanInputSchema.safeParse({
      name: draft.name,
      dossiersPerMonth: toInt(draft.dossiersPerMonth),
      pagesPerDossier: toInt(draft.pagesPerDossier),
      priceVnd: cleanMoney(draft.priceVnd),
      reason: draft.reason,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Draft;
        // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt: ngôn ngữ khác dùng nhãn chung.
        found[key] ??= key === "priceVnd" ? t.priceInvalid : locale === "vi" ? issue.message : t.fieldInvalid;
      }
      setErrors(found);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  };

  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const err = (k: keyof Draft) => (errors[k] ? { error: errors[k] } : {});

  return (
    <Dialog open={plan !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(t.editTitle, { name: plan?.name ?? "" })} size="sm" icon={<Pencil className="h-4 w-4" />}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Stack gap="md">
            {plan && plan.orgCount > 0 && (
              <Alert tone="warning">
                {fill(t.appliesNow, { n: formatNumber(plan.orgCount) })}
              </Alert>
            )}
            <Field label={t.name} required {...err("name")}>
              <Input value={draft.name} onChange={set("name")} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={t.dossiersPerMonth} required {...err("dossiersPerMonth")}>
                <Input inputMode="numeric" value={draft.dossiersPerMonth} onChange={set("dossiersPerMonth")} />
              </Field>
              <Field label={t.pagesPerDossier} required {...err("pagesPerDossier")}>
                <Input inputMode="numeric" value={draft.pagesPerDossier} onChange={set("pagesPerDossier")} />
              </Field>
            </div>
            <Field label={t.price} required hint={plan?.customPricing ? t.priceHintCustom : t.priceHintFree} {...err("priceVnd")}>
              <Input inputMode="numeric" value={draft.priceVnd} onChange={set("priceVnd")} />
            </Field>
            <Field label={t.reason} required hint={t.reasonHint} {...err("reason")}>
              <Textarea value={draft.reason} onChange={set("reason")} rows={3} maxLength={500} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanListPage() {
  const { can } = useAdminSession();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: adminKeys.plans, queryFn: listAdminPlans });
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const t = useMessages(PLAN_LIST_MESSAGES);

  return (
    <Stack gap="lg">
      <PageHeader
        title={t.title}
        description={t.description}
      />
      {isError ? (
        <LoadError onRetry={() => void refetch()} title={t.loadFailed} />
      ) : isLoading || !data ? (
        <Grid cols={{ base: 1, md: 2, xl: 4 }}>{[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={4} />)}</Grid>
      ) : (
        <Grid cols={{ base: 1, md: 2, xl: 4 }} stagger>
          {data.map((p) => (
            <Card key={p.code} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {p.name} <Badge tone={PLAN_TONE[p.code]} variant="outline" size="sm" className="font-mono">{p.code}</Badge>
                </CardTitle>
                <p className="text-xl font-semibold text-fg">
                  {p.customPricing ? t.customPricing : Number(p.priceVnd) === 0 ? t.free : fill(t.perMonth, { price: formatVnd(p.priceVnd) })}
                </p>
                {p.customPricing && <p className="text-xs text-fg-subtle">{fill(t.referencePrice, { price: formatVnd(p.priceVnd) })}</p>}
              </CardHeader>
              <CardContent className="flex-1">
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">{t.dossiersPerMonthLong}</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.dossiersPerMonth)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">{t.pagesPerDossierLong}</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.pagesPerDossier)}</dd></div>
                  <div className="flex justify-between gap-2"><dt className="text-fg-muted">{t.orgsUsing}</dt><dd className="font-medium tabular-nums text-fg">{formatNumber(p.orgCount)}</dd></div>
                </dl>
              </CardContent>
              {can("BILLING") && (
                <CardFooter>
                  <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(p)}>{t.edit}</Button>
                </CardFooter>
              )}
            </Card>
          ))}
        </Grid>
      )}
      <EditPlanDialog plan={editing} onClose={() => setEditing(null)} />
    </Stack>
  );
}
