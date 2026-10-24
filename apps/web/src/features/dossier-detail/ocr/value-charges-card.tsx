"use client";
// Khối "Chi phí và điều chỉnh trị giá" ở bước OCR & kiểm tra: cước (1.47), bảo hiểm (1.48), khoản điều chỉnh (1.49); xuất khẩu theo 2.40.
// Chứng từ là nguồn chính; người khai nhập số / ghi lý do khi chứng từ không có. Tờ khai đọc lại từ đây (ô 1.47–1.49 chỉ đọc).
import { ADJUSTMENT_CODES, CURRENCIES, FreightReasonSchema, type FreightReason, type ValueChargesView } from "@kb/contracts";
import {
  Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Checkbox, Dialog, DialogContent, DialogFooter, Field, FormSection, Input, RadioGroup,
  Select, SkeletonList, Stack, fill, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Receipt, Sparkles, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { declarationKeys } from "@/api/declaration";
import { getSession, sessionKeys } from "@/api/session";
import { getValueCharges, saveValueCharges, valueChargesKeys } from "@/api/value-charges";
import { LoadError } from "@/components/common/load-error";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import {
  emptyAdjustmentRow, formFromView, freightReasonLabel, kindOfCode, suggestAdjustments, summarize, toValueCharges, type AdjustmentRowForm, type ChargesForm, type ChargesFormErrors,
} from "./value-charges-form";
import { VALUE_CHARGES_MESSAGES } from "./value-charges.messages";

const MAX_ADJUSTMENTS = 5;
const errorProp = (e: string | undefined) => (e ? { error: e } : {});
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: c.code }));
const CODE_OPTIONS = ADJUSTMENT_CODES.map((c) => ({ value: c.code, label: `${c.code} – ${c.label}` }));

function ChargesDialog({ open, onOpenChange, view, dossierId, currency }: { open: boolean; onOpenChange: (o: boolean) => void; view: ValueChargesView; dossierId: string; currency: string }) {
  const qc = useQueryClient();
  const t = useMessages(VALUE_CHARGES_MESSAGES);
  const locale = useUiLocale();
  const reasonOptions = FreightReasonSchema.options.map((r) => ({ value: r, label: freightReasonLabel(t, r) }));
  const kindOptions = [{ value: "AD", label: t.kindAdd }, { value: "SB", label: t.kindSubtract }];
  const [form, setForm] = useState<ChargesForm>(() => formFromView(view, currency));
  const [errors, setErrors] = useState<ChargesFormErrors>({});
  const nk = view.direction === "NK";
  const insuranceApplies = nk ? !view.insuranceIncluded : view.insuranceIncluded;
  const save = useMutation({
    mutationFn: (input: Parameters<typeof saveValueCharges>[1]) => saveValueCharges(dossierId, input),
    onSuccess: (v) => {
      qc.setQueryData(valueChargesKeys.detail(dossierId), v);
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      toast({ tone: "success", title: t.saved, description: t.savedDescription });
      onOpenChange(false);
    },
    onError: toastMutationError(t.saveError),
  });
  const set = <K extends keyof ChargesForm>(k: K, value: ChargesForm[K]) => {
    setForm((f) => ({ ...f, [k]: value }));
    setErrors({});
  };
  const setRow = (i: number, patch: Partial<AdjustmentRowForm>) => set("adjustments", form.adjustments.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = toValueCharges(form, locale);
    if (!r.ok) return setErrors(r.errors);
    save.mutate(r.value);
  };
  const reset = (o: boolean) => {
    if (o) {
      setForm(formFromView(view, currency));
      setErrors({});
      save.reset();
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        title={t.title}
        icon={<Receipt className="h-4 w-4" />}
        size="lg"
        description={fill(t.dialogDescription, { incoterm: view.incoterm || t.noIncoterm })}
      >
        <form onSubmit={submit} noValidate>
          <Stack gap="md">
            <FormSection title={fill(t.freightTitle, { no: nk ? "1.47" : "2.40" })} description={view.freightRequired ? (nk ? t.freightAddNk : t.freightSubtractXk) : t.notNeeded}>
              {view.freightRequired ? (
                <Stack gap="sm">
                  <RadioGroup<ChargesForm["freightMode"]>
                    label={t.freightSource}
                    hideLabel
                    value={form.freightMode}
                    onChange={(v) => set("freightMode", v)}
                    options={[
                      { value: "DOC", label: t.fromDocs, description: view.fromDocuments.freight ? fill(t.freightFromDocs, { amount: view.fromDocuments.freight.amount, currency: view.fromDocuments.freight.currency }) : t.freightNoDocs },
                      { value: "MANUAL", label: t.freightManual, description: t.freightManualHint },
                    ]}
                  />
                  {form.freightMode === "MANUAL" && (
                    <div className="grid gap-3 cq-md:grid-cols-2">
                      <Field label={t.freightAmount} hint={t.freightAmountHint} {...errorProp(errors.freightAmount)}>
                        <Input value={form.freightAmount} onChange={(e) => set("freightAmount", e.target.value)} inputMode="decimal" className="font-mono" />
                      </Field>
                      <Field label={t.currency} {...errorProp(errors.freightCurrency)}>
                        <Select options={CURRENCY_OPTIONS} value={form.freightCurrency} onChange={(e) => set("freightCurrency", e.target.value)} />
                      </Field>
                      <Field label={t.reason} required {...errorProp(errors.freightReason)}>
                        <Select options={reasonOptions} placeholder={t.chooseReason} value={form.freightReason} onChange={(e) => set("freightReason", e.target.value as FreightReason | "")} />
                      </Field>
                      <Field label={t.note} required={form.freightReason === "OTHER"} {...errorProp(errors.freightNote)}>
                        <Input value={form.freightNote} onChange={(e) => set("freightNote", e.target.value)} maxLength={200} />
                      </Field>
                    </div>
                  )}
                </Stack>
              ) : (
                <p className="text-sm text-fg-muted">{nk ? t.freightIncludedNk : t.freightNotIncludedXk}</p>
              )}
            </FormSection>

            <FormSection title={fill(t.insuranceTitle, { no: nk ? "1.48" : "2.40" })} description={insuranceApplies ? (nk ? t.insuranceAddNk : t.insuranceSubtractXk) : t.notNeeded}>
              {insuranceApplies ? (
                <Stack gap="sm">
                  <RadioGroup<ChargesForm["insuranceMode"]>
                    label={t.insurance}
                    hideLabel
                    value={form.insuranceMode}
                    onChange={(v) => set("insuranceMode", v)}
                    options={[
                      { value: "DOC", label: t.fromDocs, description: view.fromDocuments.insurance ? `${view.fromDocuments.insurance.amount} ${view.fromDocuments.insurance.currency}` : t.insuranceNoDocs },
                      { value: "NONE", label: t.insuranceNone, description: nk ? t.insuranceNoneNk : t.insuranceNoneXk },
                      { value: "AMOUNT", label: t.insuranceEnter },
                    ]}
                  />
                  {form.insuranceMode === "AMOUNT" && (
                    <div className="grid gap-3 cq-md:grid-cols-2">
                      <Field label={t.insuranceAmount} required {...errorProp(errors.insuranceAmount)}>
                        <Input value={form.insuranceAmount} onChange={(e) => set("insuranceAmount", e.target.value)} inputMode="decimal" className="font-mono" />
                      </Field>
                      <Field label={t.currency} {...errorProp(errors.insuranceCurrency)}>
                        <Select options={CURRENCY_OPTIONS} value={form.insuranceCurrency} onChange={(e) => set("insuranceCurrency", e.target.value)} />
                      </Field>
                    </div>
                  )}
                </Stack>
              ) : (
                <p className="text-sm text-fg-muted">{nk ? t.insuranceIncludedNk : t.insuranceNotIncludedXk}</p>
              )}
            </FormSection>

            {nk && (
              <FormSection title={t.adjustmentsTitle} description={t.adjustmentsDescription}>
                <Stack gap="sm">
                  <RadioGroup<ChargesForm["adjustmentsMode"]>
                    label={t.adjustments}
                    hideLabel
                    value={form.adjustmentsMode}
                    onChange={(v) => set("adjustmentsMode", v)}
                    options={[
                      { value: "DOC", label: t.fromDocs, description: view.fromDocuments.other.length ? fill(t.adjustmentsFromDocs, { n: view.fromDocuments.other.length }) : t.adjustmentsNoDocs },
                      { value: "MANUAL", label: t.adjustmentsManual, description: t.adjustmentsManualHint },
                    ]}
                  />
                  {form.adjustmentsMode === "MANUAL" && (
                    <Stack gap="sm">
                      {form.adjustments.length === 0 && <p className="text-sm text-fg-muted">{t.adjustmentsEmpty}</p>}
                      {form.adjustments.map((row, i) => (
                        <fieldset key={i} className="grid gap-3 rounded-md border border-border p-3 cq-md:grid-cols-2">
                          <legend className="px-1 text-sm font-medium text-fg">{fill(t.adjustmentNo, { n: i + 1 })}</legend>
                          <Field label={t.adjustmentCode} required {...errorProp(errors[`adjustments.${i}.code`])}>
                            <Select options={CODE_OPTIONS} placeholder={t.chooseCode} value={row.code} onChange={(e) => setRow(i, { code: e.target.value, kind: kindOfCode(e.target.value, row.kind) })} />
                          </Field>
                          <Field label={t.adjustmentKind} {...errorProp(errors[`adjustments.${i}.kind`])}>
                            <Select options={kindOptions} value={row.kind} onChange={(e) => setRow(i, { kind: e.target.value as AdjustmentRowForm["kind"] })} />
                          </Field>
                          <Field label={t.adjustmentValue} required {...errorProp(errors[`adjustments.${i}.amount`])}>
                            <Input value={row.amount} onChange={(e) => setRow(i, { amount: e.target.value })} inputMode="decimal" className="font-mono" />
                          </Field>
                          <Field label={t.currency} {...errorProp(errors[`adjustments.${i}.currency`])}>
                            <Select options={CURRENCY_OPTIONS} value={row.currency} onChange={(e) => setRow(i, { currency: e.target.value })} />
                          </Field>
                          <Field label={t.adjustmentNote} className="cq-md:col-span-2">
                            <Input value={row.note} onChange={(e) => setRow(i, { note: e.target.value })} maxLength={200} placeholder={t.adjustmentNotePlaceholder} />
                          </Field>
                          <Checkbox
                            className="cq-md:col-span-2"
                            label={fill(t.allocate, { n: i + 1 })}
                            checked={row.allocate}
                            onChange={(e) => setRow(i, { allocate: e.target.checked })}
                          />
                          <div className="cq-md:col-span-2">
                            <Button type="button" size="sm" variant="ghost" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => set("adjustments", form.adjustments.filter((_, j) => j !== i))}>
                              {fill(t.removeAdjustment, { n: i + 1 })}
                            </Button>
                          </div>
                        </fieldset>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} disabled={form.adjustments.length >= MAX_ADJUSTMENTS} onClick={() => set("adjustments", [...form.adjustments, emptyAdjustmentRow(currency)])}>
                          {t.addAdjustment}
                        </Button>
                        {view.fromDocuments.other.length > 0 && (
                          <Button type="button" size="sm" variant="ghost" leftIcon={<Sparkles className="h-4 w-4" />} onClick={() => set("adjustments", suggestAdjustments(view).slice(0, MAX_ADJUSTMENTS))}>
                            {t.suggestAdjustments}
                          </Button>
                        )}
                      </div>
                    </Stack>
                  )}
                </Stack>
              </FormSection>
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

export function ValueChargesCard({ dossierId, currency }: { dossierId: string; currency: string }) {
  const [open, setOpen] = useState(false);
  const t = useMessages(VALUE_CHARGES_MESSAGES);
  const locale = useUiLocale();
  const q = useQuery({ queryKey: valueChargesKeys.detail(dossierId), queryFn: () => getValueCharges(dossierId) });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const canEdit = session.data?.user.role !== "VIEWER";

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <Receipt aria-hidden="true" className="h-4 w-4 text-primary" />
            {t.title}
          </CardTitle>
          <CardDescription>
            {t.cardDescription}{q.data?.incoterm ? fill(t.cardIncoterm, { incoterm: q.data.incoterm }) : ""}{t.period}
            {q.data?.updatedAt && fill(t.cardUpdated, { when: formatRelative(q.data.updatedAt) })}
          </CardDescription>
        </div>
        {q.data && canEdit && !q.data.locked && (
          <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {t.edit}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <SkeletonList rows={3} />
        ) : q.isError || !q.data ? (
          <LoadError title={t.loadError} onRetry={() => void q.refetch()} />
        ) : (
          <Stack gap="sm">
            {q.data.locked && <Alert tone="info">{t.locked}</Alert>}
            <ul className="flex flex-col divide-y divide-border" aria-label={t.title}>
              {summarize(q.data, locale).map((r) => (
                <li key={r.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {r.label} <span className="font-mono text-xs text-fg-subtle">{r.no}</span>
                    </p>
                    {r.hint && <p className="text-sm text-fg-muted">{r.hint}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-fg">{r.value}</span>
                    <Badge tone={r.tone}>{r.source}</Badge>
                  </div>
                </li>
              ))}
            </ul>
            <ChargesDialog open={open} onOpenChange={setOpen} view={q.data} dossierId={dossierId} currency={currency} />
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
