"use client";
import { ProductCatalogInputSchema, type ProductCatalogInput, type ProductCatalogItem } from "@kb/contracts";
import { Alert, Button, Dialog, DialogContent, DialogFooter, Disclosure, Field, fill, Grid, Input, Stack, Textarea, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { createProduct, productKeys, updateProduct } from "@/api/products";
import { errorText } from "@/lib/reason-codes";
import { formatHs } from "./format";
import { PRODUCT_DIALOG_MESSAGES } from "./product-catalog.messages";

type Form = Record<keyof ProductCatalogInput, string>;
type FieldKey = keyof Form;

const EMPTY: Form = {
  code: "", name: "", hsCode: "", description: "", unit: "", unit2: "", origin: "", unitPrice: "", currency: "", partner: "", tariffSchedule: "",
  importDutyRate: "", vatRate: "", envTaxRate: "", exciseRate: "", safeguardRate: "", antiDiscriminationRate: "", note: "",
};
const toForm = (p: ProductCatalogItem): Form => ({
  ...(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, p[k as FieldKey] ?? ""])) as Form),
  hsCode: formatHs(p.hsCode),
});
const RATE_FIELDS = ["importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"] as const;

/** Thêm (product = null) hoặc sửa một mặt hàng. Kiểm tra bằng schema dùng chung, báo lỗi theo ngôn ngữ đang chọn. */
export function ProductDialog({ open, product, onOpenChange }: { open: boolean; product: ProductCatalogItem | null; onOpenChange: (o: boolean) => void }) {
  const t = useMessages(PRODUCT_DIALOG_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  useEffect(() => {
    if (!open) return;
    setForm(product ? toForm(product) : EMPTY);
    setErrors({});
  }, [open, product]);

  const save = useMutation({
    mutationFn: (input: ProductCatalogInput) => (product ? updateProduct(product.id, input) : createProduct(input)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: productKeys.all });
      toast({ tone: "success", title: product ? t.saved : t.added });
      onOpenChange(false);
    },
  });

  const ERROR_TEXT: Partial<Record<FieldKey, string>> = {
    name: t.errName, hsCode: t.errHs, origin: t.errOrigin, unitPrice: t.errNumber, currency: t.errCurrency, ...Object.fromEntries(RATE_FIELDS.map((k) => [k, t.errRate])),
  };
  const RATE_LABEL: Record<(typeof RATE_FIELDS)[number], string> = {
    importDutyRate: t.importDuty, vatRate: t.vat, envTaxRate: t.envTax, exciseRate: t.excise, safeguardRate: t.safeguard, antiDiscriminationRate: t.antiDiscrimination,
  };
  const submit = () => {
    const parsed = ProductCatalogInputSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<FieldKey, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as FieldKey;
        next[k] ??= ERROR_TEXT[k] ?? issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(form);
  };
  const set = (k: FieldKey) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const err = (k: FieldKey) => (errors[k] ? { error: errors[k] } : {});
  const raw = product?.raw ? Object.entries(product.raw).filter(([, v]) => v !== "") : [];

  return (
    <Dialog open={open} onOpenChange={(o) => { save.reset(); onOpenChange(o); }}>
      <DialogContent title={product ? t.editTitle : t.addTitle} icon={<Package className="h-4 w-4" />} description={t.desc} size="lg">
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{errorText(save.error, locale)}</Alert>}
            <Grid cols={{ base: 1, md: 2 }} gap="md">
              <Field label={t.code} hint={t.codeHint}>
                <Input value={form.code} onChange={set("code")} className="font-mono" autoComplete="off" />
              </Field>
              <Field label={t.hs} hint={t.hsHint} required {...err("hsCode")}>
                <Input value={form.hsCode} onChange={set("hsCode")} className="font-mono" inputMode="numeric" autoComplete="off" />
              </Field>
            </Grid>
            <Field label={t.name} required {...err("name")}>
              <Textarea value={form.name} onChange={set("name")} rows={3} />
            </Field>
            <Field label={t.description} hint={t.descriptionHint}>
              <Textarea value={form.description} onChange={set("description")} rows={3} />
            </Field>
            <Grid cols={{ base: 2, md: 3 }} gap="md">
              <Field label={t.unit}>
                <Input value={form.unit} onChange={set("unit")} className="font-mono" autoComplete="off" />
              </Field>
              <Field label={t.unit2}>
                <Input value={form.unit2} onChange={set("unit2")} className="font-mono" autoComplete="off" />
              </Field>
              <Field label={t.origin} hint={t.originHint} {...err("origin")}>
                <Input value={form.origin} onChange={set("origin")} className="font-mono" maxLength={2} autoComplete="off" />
              </Field>
              <Field label={t.unitPrice} {...err("unitPrice")}>
                <Input value={form.unitPrice} onChange={set("unitPrice")} inputMode="decimal" autoComplete="off" />
              </Field>
              <Field label={t.currency} hint={t.currencyHint} {...err("currency")}>
                <Input value={form.currency} onChange={set("currency")} className="font-mono" maxLength={3} autoComplete="off" />
              </Field>
              <Field label={t.schedule}>
                <Input value={form.tariffSchedule} onChange={set("tariffSchedule")} className="font-mono" autoComplete="off" />
              </Field>
            </Grid>
            <Field label={t.partner}>
              <Input value={form.partner} onChange={set("partner")} autoComplete="off" />
            </Field>
            <Grid cols={{ base: 2, md: 3 }} gap="md">
              {RATE_FIELDS.map((k) => (
                <Field key={k} label={RATE_LABEL[k]} {...err(k)}>
                  <Input value={form[k]} onChange={set(k)} inputMode="decimal" autoComplete="off" />
                </Field>
              ))}
            </Grid>
            <Field label={t.note}>
              <Textarea value={form.note} onChange={set("note")} rows={2} />
            </Field>
            {raw.length > 0 && (
              <Disclosure title={t.rawTitle} meta={fill(t.rawMeta, { n: raw.length, no: product?.lastDeclarationNo ?? "—" })}>
                <dl className="grid grid-cols-1 gap-x-4 gap-y-1 p-3 text-sm cq-md:grid-cols-2">
                  {raw.map(([k, v]) => (
                    <div key={k} className="flex min-w-0 gap-2">
                      <dt className="shrink-0 text-fg-muted">{k}</dt>
                      <dd className="min-w-0 break-words text-fg">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Disclosure>
            )}
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
