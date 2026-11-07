"use client";
import { UpdatePlanInputSchema, type AdminPlan } from "@kb/contracts";
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, Dialog, DialogContent, DialogFooter, Field, Grid, Input, PageHeader, SkeletonCard, Stack, Textarea, fill, useMessages, useUiLocale } from "@kb/ui";
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

type Draft = { name: string; pagesPerDossier: string; price: string; reason: string };
type Errors = Partial<Record<keyof Draft, string>>;

const toInt = (s: string) => (s.trim() === "" ? Number.NaN : Number(s));
/** Người dùng gõ "25.000" hay "25 000" đều được – bỏ dấu phân cách trước khi kiểm tra. */
const cleanMoney = (s: string) => s.replace(/[.\s,]/g, "");

/** Sửa gói: PAYG – tên, trang/hồ sơ, đơn giá/lượt; CONTRACT – tên, trang/hồ sơ, giá niêm yết (0 = Liên hệ). */
export function EditPlanDialog({ plan, onClose }: { plan: AdminPlan | null; onClose: () => void }) {
  const t = useMessages(PLAN_LIST_MESSAGES);
  const locale = useUiLocale();
  const [draft, setDraft] = useState<Draft>({ name: "", pagesPerDossier: "", price: "", reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  const payg = plan?.kind === "PAYG";
  useEffect(() => {
    if (plan) {
      setDraft({ name: plan.name, pagesPerDossier: String(plan.pagesPerDossier), price: plan.kind === "PAYG" ? plan.pricePerDeclarationVnd : plan.priceVnd, reason: "" });
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
    if (!plan) return;
    const price = cleanMoney(draft.price);
    const parsed = UpdatePlanInputSchema.safeParse({
      name: draft.name,
      pagesPerDossier: toInt(draft.pagesPerDossier),
      // Mỗi loại gói chỉ sửa một loại giá; giá còn lại giữ nguyên.
      priceVnd: payg ? plan.priceVnd : price,
      pricePerDeclarationVnd: payg ? price : plan.pricePerDeclarationVnd,
      reason: draft.reason,
    });
    if (!parsed.success) {
      const found: Errors = {};
      for (const issue of parsed.error.issues) {
        const raw = issue.path[0];
        const key: keyof Draft = raw === "priceVnd" || raw === "pricePerDeclarationVnd" ? "price" : (raw as keyof Draft);
        // Thông báo của schema (@kb/contracts) chỉ có tiếng Việt: ngôn ngữ khác dùng nhãn chung.
        found[key] ??= key === "price" ? t.priceInvalid : locale === "vi" ? issue.message : t.fieldInvalid;
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
      <DialogContent title={fill(t.editTitle, { name: plan?.name ?? "" })} size="sm" icon={<Pencil className="h-4 w-4" />} description={payg ? t.kindPayg : t.kindContract}>
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
                {fill(payg ? t.appliesNowPayg : t.appliesNow, { n: formatNumber(plan.orgCount) })}
              </Alert>
            )}
            <Field label={t.name} required {...err("name")}>
              <Input value={draft.name} onChange={set("name")} placeholder={t.namePlaceholder} />
            </Field>
            <Field label={t.pagesPerDossier} required hint={t.pagesHint} {...err("pagesPerDossier")}>
              <Input inputMode="numeric" value={draft.pagesPerDossier} onChange={set("pagesPerDossier")} placeholder={t.pagesPlaceholder} className="cq-sm:max-w-xs" />
            </Field>
            <Field label={payg ? t.unitPrice : t.listPrice} required hint={payg ? t.unitPriceHint : t.listPriceHint} {...err("price")}>
              <Input inputMode="numeric" value={draft.price} onChange={set("price")} placeholder={payg ? t.unitPricePlaceholder : t.listPricePlaceholder} className="cq-sm:max-w-xs" />
            </Field>
            <Field label={t.reason} required hint={t.reasonHint} {...err("reason")}>
              <Textarea value={draft.reason} onChange={set("reason")} rows={3} maxLength={500} placeholder={t.reasonPlaceholder} />
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
        <Grid cols={{ base: 1, md: 2 }}>{[0, 1].map((i) => <SkeletonCard key={i} lines={4} />)}</Grid>
      ) : (
        <Grid cols={{ base: 1, md: 2 }} stagger>
          {data.map((p) => (
            <Card key={p.code} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {p.name} <Badge tone={PLAN_TONE[p.code]} variant="outline" size="sm">{p.kind === "PAYG" ? t.kindPayg : t.kindContract}</Badge>
                </CardTitle>
                <p className="text-xl font-semibold text-fg">
                  {p.kind === "PAYG" ? fill(t.perCredit, { price: formatVnd(p.pricePerDeclarationVnd) }) : Number(p.priceVnd) === 0 ? t.contact : fill(t.perYear, { price: formatVnd(p.priceVnd) })}
                </p>
                {p.kind === "CONTRACT" && Number(p.priceVnd) > 0 && <p className="text-xs text-fg-subtle">{t.listPriceNote}</p>}
                <CardDescription>{p.kind === "PAYG" ? t.paygSummary : t.contractSummary}</CardDescription>
              </CardHeader>
              <CardContent className="flex-1">
                <dl className="flex flex-col gap-2 text-sm">
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
