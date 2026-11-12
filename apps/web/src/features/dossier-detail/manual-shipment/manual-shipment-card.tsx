"use client";
// Khối "Dữ liệu lô hàng nhập tay" ở bước OCR & kiểm tra (ADR 0013 – Khai trước): tóm tắt + popup nhập người mua, điều kiện giao hàng, vận chuyển, dòng hàng.
// Backend ghép dữ liệu này vào shipment (thắng chứng từ), chạy lại luật và dựng lại tờ khai nháp.
import type { ManualShipmentView } from "@kb/contracts";
import {
  Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Combobox, DatePicker, Dialog, DialogContent, DialogFooter, Field, FormSection, Input,
  Select, SkeletonList, Stack, Textarea, fill, toast, useMessages,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { declarationKeys } from "@/api/declaration";
import { dossierKeys } from "@/api/dossiers";
import { issuedInvoiceKeys } from "@/api/issued-invoice";
import { getManualShipment, manualShipmentKeys, saveManualShipment } from "@/api/manual-shipment";
import { ocrKeys } from "@/api/ocr";
import { listProducts, productKeys } from "@/api/products";
import { LoadError } from "@/components/common/load-error";
import { useCodeLists } from "@/features/declaration-form/use-code-list";
import { formatMoney, formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { lineAmount, manualTotal } from "./manual-amount";
import { emptyItem, formFromData, itemFromProduct, toInput, type ErrorKind, type ItemRow, type ManualForm, type ManualFormErrors } from "./manual-shipment-form";
import { MANUAL_SHIPMENT_MESSAGES } from "./manual-shipment.messages";

const MAX_ITEMS = 500;
type T = (typeof MANUAL_SHIPMENT_MESSAGES)["vi"];
const ERR_KEY: Record<ErrorKind, keyof T> = { required: "errRequired", positive: "errPositive", nonNegative: "errNonNegative", number: "errNumber", date: "errDate", invalid: "errInvalid" };

function ManualDialog({ open, onOpenChange, view, dossierId, currency, incoterm }: { open: boolean; onOpenChange: (o: boolean) => void; view: ManualShipmentView; dossierId: string; currency: string; incoterm: string }) {
  const t = useMessages(MANUAL_SHIPMENT_MESSAGES);
  const qc = useQueryClient();
  const [form, setForm] = useState<ManualForm>(() => formFromData(view.data, { currency, incoterm }));
  const [errors, setErrors] = useState<ManualFormErrors>({});
  const codes = useCodeLists(["COUNTRY", "UNIT", "CURRENCY", "INCOTERM", "PACKAGE_KIND"] as const);
  const products = useQuery({ queryKey: productKeys.all, queryFn: listProducts, enabled: open });
  const opts = (id: keyof typeof codes.lists, keep: string[]) => {
    const list = (codes.lists[id] ?? []).filter((e) => !e.inactive);
    const extra = keep.filter((k) => k && !list.some((e) => e.code === k)).map((k) => ({ value: k, label: k }));
    return [...extra, ...list.map((e) => ({ value: e.code, label: `${e.code} – ${e.name}` }))];
  };
  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name, description: [p.code, p.hsCode, p.unit].filter(Boolean).join(" · ") }));
  const err = (k: string) => (errors[k] ? { error: t[ERR_KEY[errors[k]!]] } : {});
  const set = <K extends keyof ManualForm>(k: K, v: ManualForm[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors({});
  };
  const setRow = (i: number, patch: Partial<ItemRow>) => set("items", form.items.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveManualShipment>[1]) => saveManualShipment(dossierId, input),
    onSuccess: (v) => {
      qc.setQueryData(manualShipmentKeys.detail(dossierId), v);
      void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
      void qc.invalidateQueries({ queryKey: ocrKeys.fields(dossierId) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      void qc.invalidateQueries({ queryKey: dossierKeys.detail(dossierId) });
      void qc.invalidateQueries({ queryKey: issuedInvoiceKeys.detail(dossierId) });
      toast({ tone: "success", title: t.saved, description: t.savedDesc });
      onOpenChange(false);
    },
    onError: toastMutationError(t.saveFailed),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = toInput(form);
    if (!r.ok) return setErrors(r.errors);
    save.mutate(r.value);
  };
  const readOnly = !view.editable;
  const total = manualTotal(form.items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t.dialogTitle} icon={<PackagePlus className="h-4 w-4" />} size="lg" description={t.dialogDescription}>
        <form onSubmit={submit} noValidate>
          <fieldset disabled={readOnly || save.isPending} className="contents">
            {Object.keys(errors).length > 0 && <Alert tone="danger" className="mb-4">{t.fixErrors}</Alert>}
            <FormSection title={t.secBuyer} description={t.secBuyerDesc}>
              <Stack gap="md">
                <Field label={t.buyerName} {...err("buyerName")}>
                  <Input value={form.buyerName} onChange={(e) => set("buyerName", e.target.value)} maxLength={255} placeholder={t.phText} />
                </Field>
                <Field label={t.buyerAddress} {...err("buyerAddress")}>
                  <Input value={form.buyerAddress} onChange={(e) => set("buyerAddress", e.target.value)} maxLength={500} placeholder={t.phText} />
                </Field>
                <div className="grid gap-4 cq-md:grid-cols-2">
                  <Field label={t.buyerCountry} {...err("buyerCountry")}>
                    <Combobox options={opts("COUNTRY", [form.buyerCountry])} value={form.buyerCountry || null} onChange={(v) => set("buyerCountry", v ?? "")} placeholder={t.choose} clearable />
                  </Field>
                  <Field label={t.buyerTaxCode} {...err("buyerTaxCode")}>
                    <Input value={form.buyerTaxCode} onChange={(e) => set("buyerTaxCode", e.target.value)} maxLength={20} className="font-mono" placeholder={t.phCode} />
                  </Field>
                </div>
              </Stack>
            </FormSection>

            <FormSection title={t.secInvoice} description={t.secInvoiceDesc}>
              <div className="grid gap-4 cq-md:grid-cols-2">
                <Field label={t.invoiceDate} {...err("invoiceDate")}>
                  <DatePicker value={form.invoiceDate || null} onChange={(v) => set("invoiceDate", v ?? "")} />
                </Field>
                <Field label={t.poNo} {...err("poNo")}>
                  <Input value={form.poNo} onChange={(e) => set("poNo", e.target.value)} maxLength={50} className="font-mono" placeholder={t.phCode} />
                </Field>
                <Field label={t.incoterm} {...err("incoterm")}>
                  <Select options={opts("INCOTERM", [form.incoterm])} placeholder={t.choose} value={form.incoterm} onChange={(e) => set("incoterm", e.target.value)} />
                </Field>
                <Field label={t.incotermPlace} {...err("incotermPlace")}>
                  <Input value={form.incotermPlace} onChange={(e) => set("incotermPlace", e.target.value)} maxLength={100} placeholder={t.phText} />
                </Field>
                <Field label={t.currency} {...err("currency")}>
                  <Select options={opts("CURRENCY", [form.currency])} placeholder={t.choose} value={form.currency} onChange={(e) => set("currency", e.target.value)} />
                </Field>
                <Field label={t.paymentTerms} {...err("paymentTerms")}>
                  <Input value={form.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} maxLength={255} placeholder={t.phText} />
                </Field>
              </div>
              <Field label={t.marks} {...err("marks")}>
                <Textarea value={form.marks} onChange={(e) => set("marks", e.target.value)} maxLength={500} rows={2} placeholder={t.marksPlaceholder} />
              </Field>
            </FormSection>

            <FormSection title={t.secTransport} description={t.secTransportDesc}>
              <div className="grid gap-4 cq-md:grid-cols-2">
                <Field label={t.portOfLoading} {...err("portOfLoading")}>
                  <Input value={form.portOfLoading} onChange={(e) => set("portOfLoading", e.target.value)} maxLength={100} placeholder={t.phText} />
                </Field>
                <Field label={t.portOfDischarge} {...err("portOfDischarge")}>
                  <Input value={form.portOfDischarge} onChange={(e) => set("portOfDischarge", e.target.value)} maxLength={100} placeholder={t.phText} />
                </Field>
                <Field label={t.finalDestination} {...err("finalDestination")}>
                  <Input value={form.finalDestination} onChange={(e) => set("finalDestination", e.target.value)} maxLength={100} placeholder={t.phText} />
                </Field>
                <Field label={t.departureDate} {...err("departureDate")}>
                  <DatePicker value={form.departureDate || null} onChange={(v) => set("departureDate", v ?? "")} />
                </Field>
                <Field label={t.vessel} {...err("vessel")}>
                  <Input value={form.vessel} onChange={(e) => set("vessel", e.target.value)} maxLength={100} placeholder={t.phText} />
                </Field>
                <Field label={t.originCountry} {...err("originCountry")}>
                  <Combobox options={opts("COUNTRY", [form.originCountry])} value={form.originCountry || null} onChange={(v) => set("originCountry", v ?? "")} placeholder={t.choose} clearable />
                </Field>
                <Field label={t.packages} hint={t.numberHint} {...err("packages")}>
                  <Input value={form.packages} onChange={(e) => set("packages", e.target.value)} inputMode="decimal" className="font-mono" placeholder={t.phNumber} />
                </Field>
                <Field label={t.packageUnit} {...err("packageUnit")}>
                  <Combobox options={opts("PACKAGE_KIND", [form.packageUnit])} value={form.packageUnit || null} onChange={(v) => set("packageUnit", v ?? "")} placeholder={t.choose} clearable />
                </Field>
                <Field label={t.grossWeight} hint={t.numberHint} {...err("grossWeightKg")}>
                  <Input value={form.grossWeightKg} onChange={(e) => set("grossWeightKg", e.target.value)} inputMode="decimal" className="font-mono" placeholder={t.phNumber} />
                </Field>
                <Field label={t.netWeight} hint={t.numberHint} {...err("netWeightKg")}>
                  <Input value={form.netWeightKg} onChange={(e) => set("netWeightKg", e.target.value)} inputMode="decimal" className="font-mono" placeholder={t.phNumber} />
                </Field>
                <Field label={t.containers} hint={t.containersHint} className="cq-md:col-span-2" {...err("containers")}>
                  <Input value={form.containers} onChange={(e) => set("containers", e.target.value)} className="font-mono" placeholder={t.phContainers} />
                </Field>
              </div>
            </FormSection>

            <FormSection title={t.secItems} description={t.secItemsDesc}>
              <Stack gap="sm">
                {form.items.map((row, i) => {
                  const amount = lineAmount(row.quantity.replace(/[\s,]/g, ""), row.unitPrice.replace(/[\s,]/g, ""));
                  return (
                    <fieldset key={i} className="grid gap-3 rounded-md border border-border p-3 cq-md:grid-cols-2">
                      <legend className="px-1 text-sm font-medium text-fg">{fill(t.itemNo, { n: i + 1 })}</legend>
                      {!readOnly && (
                        <Field label={t.pickProduct} className="cq-md:col-span-2">
                          <Combobox
                            options={productOptions}
                            value={row.catalogItemId}
                            onChange={(id) => {
                              const p = products.data?.find((x) => x.id === id);
                              if (p) setRow(i, itemFromProduct(row, p));
                            }}
                            placeholder={t.pickProductPlaceholder}
                            emptyText={t.noProducts}
                            loading={products.isLoading}
                          />
                        </Field>
                      )}
                      <Field label={t.description_} required className="cq-md:col-span-2" {...err(`items.${i}.description`)}>
                        <Input value={row.description} onChange={(e) => setRow(i, { description: e.target.value, catalogItemId: null })} maxLength={500} placeholder={t.phText} />
                      </Field>
                      <Field label={t.partNo} {...err(`items.${i}.partNo`)}>
                        <Input value={row.partNo} onChange={(e) => setRow(i, { partNo: e.target.value })} maxLength={50} className="font-mono" placeholder={t.phCode} />
                      </Field>
                      <Field label={t.hsCode} {...err(`items.${i}.hsOnInvoice`)}>
                        <Input value={row.hsOnInvoice} onChange={(e) => setRow(i, { hsOnInvoice: e.target.value })} maxLength={12} inputMode="numeric" className="font-mono" placeholder={t.phCode} />
                      </Field>
                      <Field label={t.quantity} required {...err(`items.${i}.quantity`)}>
                        <Input value={row.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} inputMode="decimal" className="font-mono" placeholder={t.phNumber} />
                      </Field>
                      <Field label={t.unit} required {...err(`items.${i}.unit`)}>
                        <Combobox options={opts("UNIT", [row.unit])} value={row.unit || null} onChange={(v) => setRow(i, { unit: v ?? "" })} placeholder={t.choose} />
                      </Field>
                      <Field label={fill(t.unitPriceIn, { c: form.currency || "–" })} required {...err(`items.${i}.unitPrice`)}>
                        <Input value={row.unitPrice} onChange={(e) => setRow(i, { unitPrice: e.target.value })} inputMode="decimal" className="font-mono" placeholder={t.phNumber} />
                      </Field>
                      <Field label={t.itemOrigin} {...err(`items.${i}.origin`)}>
                        <Combobox options={opts("COUNTRY", [row.origin])} value={row.origin || null} onChange={(v) => setRow(i, { origin: v ?? "" })} placeholder={t.choose} clearable />
                      </Field>
                      <div className="flex flex-wrap items-center justify-between gap-2 cq-md:col-span-2">
                        <p className="text-sm text-fg-muted">
                          {t.amount}: {amount ? <span className="font-mono font-medium text-fg">{formatMoney(amount, form.currency || undefined)}</span> : <span className="text-fg-muted">{t.amountPending}</span>}
                        </p>
                        {!readOnly && form.items.length > 1 && (
                          <Button type="button" size="sm" variant="danger-ghost" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => set("items", form.items.filter((_, j) => j !== i))}>
                            {fill(t.removeItem, { n: i + 1 })}
                          </Button>
                        )}
                      </div>
                    </fieldset>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!readOnly && (
                    <Button type="button" size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={form.items.length >= MAX_ITEMS} onClick={() => set("items", [...form.items, emptyItem()])}>
                      {t.addItem}
                    </Button>
                  )}
                  <p className="text-sm font-semibold text-fg">{fill(t.total, { amount: formatMoney(total, form.currency || undefined) })}</p>
                </div>
              </Stack>
            </FormSection>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t.cancel}
            </Button>
            {!readOnly && (
              <Button type="submit" loading={save.isPending}>
                {t.save}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManualShipmentCard({ dossierId, currency, incoterm, hasDocuments }: { dossierId: string; currency: string; incoterm: string; hasDocuments: boolean }) {
  const t = useMessages(MANUAL_SHIPMENT_MESSAGES);
  const q = useQuery({ queryKey: manualShipmentKeys.detail(dossierId), queryFn: () => getManualShipment(dossierId) });
  const [open, setOpen] = useState(false);
  const v = q.data;
  const d = v?.data;
  const cur = d?.invoice.currency ?? currency;
  const terms = [d?.invoice.incoterm, d?.invoice.incotermPlace].filter(Boolean).join(" ");

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle>{t.title}</CardTitle>
          <CardDescription>{hasDocuments ? t.descriptionWithDocs : t.description}</CardDescription>
        </div>
        {v && (
          <Button size="sm" variant={d ? "secondary" : "primary"} leftIcon={<PackagePlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            {!v.editable ? t.viewOnly : d ? t.edit : t.open}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <SkeletonList rows={2} />
        ) : q.isError ? (
          <LoadError title={t.loadFailed} onRetry={() => void q.refetch()} />
        ) : !d ? (
          <p className="text-sm text-fg-muted">{t.empty}</p>
        ) : (
          <Stack gap="sm">
            <dl className="grid gap-x-6 gap-y-2 text-sm cq-md:grid-cols-4">
              <div className="flex flex-col gap-0.5">
                <dt className="text-fg-muted">{t.summaryBuyer}</dt>
                <dd className="font-medium text-fg">{d.buyer.name ?? "–"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-fg-muted">{t.summaryTerms}</dt>
                <dd className="font-medium text-fg">{terms || "–"}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-fg-muted">{t.summaryLines}</dt>
                <dd className="font-medium text-fg">{fill(t.linesCount, { n: d.items.length })}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-fg-muted">{t.summaryTotal}</dt>
                <dd className="font-mono font-medium text-fg">{formatMoney(manualTotal(d.items), cur)}</dd>
              </div>
            </dl>
            {v.updatedAt && <p className="text-xs text-fg-subtle">{fill(t.updated, { time: formatRelative(v.updatedAt) })}</p>}
            {!v.editable && <Alert tone="info">{t.locked}</Alert>}
          </Stack>
        )}
      </CardContent>
      {open && v && <ManualDialog open={open} onOpenChange={setOpen} view={v} dossierId={dossierId} currency={currency} incoterm={incoterm} />}
    </Card>
  );
}
