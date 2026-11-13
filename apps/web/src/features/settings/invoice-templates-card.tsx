"use client";
// Mẫu in hóa đơn thương mại (ADR 0013 mục 3): danh sách + trình thiết kế ghép nhóm thông tin chuẩn (UCP600 Đ18, ISBP 821 mục C).
// Nhóm/cột: kéo để sắp xếp, bật/tắt (nhóm bắt buộc khóa), đổi nhãn in. Xem trước bằng chính bản in với dữ liệu mẫu.
import {
  DEFAULT_INVOICE_LAYOUT, InvoiceLayoutSchema, REQUIRED_BLOCKS, REQUIRED_COLUMNS,
  type CodeSet, type CodeSetKind, type InvoiceColumnKey, type InvoiceLayout, type InvoiceTemplate, type IssuedInvoice, type IssuedInvoiceSnapshot,
} from "@kb/contracts";
import {
  Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, createDataTableColumnHelper, DataTable, Dialog, DialogContent, DialogFooter,
  Field, fill, Grid, Input, RowActions, Select, SortableList, Stack, Switch, Textarea, toast, useMessages, useUiLocale,
} from "@kb/ui";
import { catalogKeys, listCodeSets } from "@/api/catalog";
import { setTitle } from "@/features/catalog/catalog-xlsx";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { deleteInvoiceTemplate, invoiceTemplateKeys, listInvoiceTemplates, saveInvoiceTemplate } from "@/api/invoice-templates";
import { getSession, sessionKeys } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { BLOCK_LABELS, COLUMN_LABELS } from "@/features/invoice-print/invoice-document.labels";
import { InvoicePrintView } from "@/features/invoice-print/invoice-print-page";
import { formatRelative } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { INVOICE_TEMPLATES_MESSAGES } from "./invoice-templates-card.messages";

type T = (typeof INVOICE_TEMPLATES_MESSAGES)["vi"];
const col = createDataTableColumnHelper<InvoiceTemplate>();
const colName = (t: T, k: InvoiceColumnKey) => (k === "ORIGIN" ? t.COL_ORIGIN : t[k]);

/** Dữ liệu mẫu cho xem trước (không phải dữ liệu khách). kb-allow-raw: ví dụ nội dung chứng từ tiếng Anh. */
const NO_PRINT = { catalogItemId: null, printedCode: null, printedUnit: null, printedQuantity: null, printedUnitPrice: null }; // bản mẫu: chưa in theo bộ mã
const SAMPLE: Omit<IssuedInvoiceSnapshot, "layout"> = {
  seller: { name: "YOUR COMPANY CO., LTD", taxCode: "0123456789", address: "HAI PHONG, VIETNAM", phone: "0225 000 000" }, // kb-allow-raw: dữ liệu mẫu
  buyer: { name: "SAMPLE BUYER AB", address: "STOCKHOLM, SWEDEN", country: "SE", taxCode: null }, // kb-allow-raw: dữ liệu mẫu
  invoice: { date: "2026-11-20", incoterm: "FOB", incotermPlace: "HAIPHONG PORT, VIETNAM", currency: "USD", paymentTerms: "T/T 30 DAYS", poNo: "PO-001", totalAmount: "1250.50" }, // kb-allow-raw: dữ liệu mẫu
  transport: { portOfLoading: "HAIPHONG", portOfDischarge: "GOTHENBURG", finalDestination: null, departureDate: "2026-11-22", vessel: "SAMPLE VESSEL 001W", packages: "20", packageUnit: "CT", grossWeightKg: "520.5", netWeightKg: "480", containers: [{ no: "ABCU1234567", sealNo: "SL001", size: "20GP" }] }, // kb-allow-raw: dữ liệu mẫu
  originCountry: "VN",
  declarationNo: "300000000000",
  marks: "SAMPLE / C/NO. 1-20", // kb-allow-raw: dữ liệu mẫu
  extra: { contractNo: "HD-01/2026", lcNo: "LC0001", lcDate: "2026-11-01", lcIssuingBank: "SAMPLE BANK", blNo: "BL0001", blDate: "2026-11-22" }, // kb-allow-raw: dữ liệu mẫu
  signatory: { name: "NGUYEN VAN A", title: "DIRECTOR" }, // kb-allow-raw: dữ liệu mẫu
  items: [
    { lineNo: 1, description: "Drill bit 10mm", partNo: "DB-10", hsCode: "82075000", quantity: "1000", unit: "PCE", unitPrice: "1.25", amount: "1250.00", origin: "VN", ...NO_PRINT }, // kb-allow-raw: dữ liệu mẫu
    { lineNo: 2, description: "Drill bit 2mm", partNo: "DB-02", hsCode: "82075000", quantity: "1", unit: "PCE", unitPrice: "0.5", amount: "0.50", origin: "VN", ...NO_PRINT }, // kb-allow-raw: dữ liệu mẫu
  ],
};
/**
 * Xem trước "In mã hàng theo bộ mã" bằng dữ liệu mẫu: dòng 1 có mã trong mọi loại bộ, dòng 2 chưa có mã ở bộ nào → in mã nối.
 * Tự động (null): người mua mẫu không có bộ khách hàng → Kế toán / "Mã chung" (theo bộ doanh nghiệp đang có) → mã nối. kb-allow-raw: mã mẫu.
 */
const SAMPLE_ITEM_NO = ["MH-000001", "MH-000002"] as const; // kb-allow-raw: mã nối mẫu
const SAMPLE_SET_CODE: Record<CodeSetKind, string> = { SHARED: "MC-0010", ACCOUNTING: "VT-0010", WAREHOUSE: "KHO-0010", CUSTOMS: "XNK-0010", SUPPLIER: "SUP-DB10", CUSTOMER: "CUS-DB10" }; // kb-allow-raw: mã mẫu
function sampleItems(pick: InvoiceLayout["itemCodeSet"], sets: readonly CodeSet[]): IssuedInvoiceSnapshot["items"] {
  if (!sets.length) return SAMPLE.items; // chưa thiết lập danh mục: hàng chưa gắn mặt hàng → in Part No như cũ
  const set = pick && "codeSetId" in pick ? sets.find((s) => s.id === pick.codeSetId) : !pick ? sets.find((s) => s.kind === "ACCOUNTING" || s.kind === "SHARED") : undefined;
  return SAMPLE.items.map((it, i) => ({
    ...it, catalogItemId: `sample-${i + 1}`, printedCode: (i === 0 && set ? SAMPLE_SET_CODE[set.kind] : null) ?? SAMPLE_ITEM_NO[i] ?? null,
  }));
}
const ITEM_NO_VALUE = "__item_no";
const codeSetValue = (v: InvoiceLayout["itemCodeSet"]) => (!v ? "" : "kind" in v ? ITEM_NO_VALUE : v.codeSetId);
const codeSetPick = (v: string): InvoiceLayout["itemCodeSet"] => (!v ? null : v === ITEM_NO_VALUE ? { kind: "ITEM_NO" } : { codeSetId: v });

const SAMPLE_INVOICE: IssuedInvoice = { id: "preview", no: "INV2611-001", status: "ISSUED", reservedAt: "2026-11-01T00:00:00.000Z", releasedAt: null, voidedAt: null, voidReason: null, templateId: null, snapshot: null }; // kb-allow-raw: số mẫu

type Draft = { name: string; isDefault: boolean; layout: InvoiceLayout; originals: string; copies: string };
const toDraft = (tpl: InvoiceTemplate | null, name = ""): Draft => {
  const layout = tpl?.layout ?? DEFAULT_INVOICE_LAYOUT;
  return { name: tpl?.name ?? name, isDefault: tpl?.isDefault ?? false, layout, originals: String(layout.originals), copies: String(layout.copies) };
};
const count = (v: string, min: number) => Math.min(5, Math.max(min, Number.parseInt(v, 10) || min));

function TemplateEditor({ open, onOpenChange, template, initial }: { open: boolean; onOpenChange: (o: boolean) => void; template: InvoiceTemplate | null; initial: Draft }) {
  const t = useMessages(INVOICE_TEMPLATES_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const layout: InvoiceLayout = { ...d.layout, originals: count(d.originals, 1), copies: count(d.copies, 0) };
  const parsed = InvoiceLayoutSchema.safeParse(layout);
  const nameMissing = !d.name.trim();
  const setLayout = (patch: Partial<InvoiceLayout>) => setD({ ...d, layout: { ...d.layout, ...patch } });
  const save = useMutation({
    mutationFn: () => saveInvoiceTemplate(template?.id ?? null, { name: d.name.trim(), isDefault: d.isDefault, layout: parsed.success ? parsed.data : layout }),
    onSuccess: (tpl) => {
      void qc.invalidateQueries({ queryKey: invoiceTemplateKeys.list });
      toast({ tone: "success", title: fill(t.saved, { name: tpl.name }) });
      onOpenChange(false);
    },
    onError: toastMutationError(t.saveFailed),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!nameMissing && parsed.success) save.mutate();
  };
  const codeSets = useQuery({ queryKey: catalogKeys.codeSets, queryFn: listCodeSets, enabled: open });
  const sets = codeSets.data ?? [];
  const codeSetOptions = [
    { value: "", label: t.itemCodeSetAuto },
    { value: ITEM_NO_VALUE, label: t.itemCodeSetItemNo },
    ...sets.map((s) => ({ value: s.id, label: setTitle(s, locale) })),
  ];
  const snapshot: IssuedInvoiceSnapshot = { ...SAMPLE, items: sampleItems(d.layout.itemCodeSet, sets), layout: parsed.success ? parsed.data : DEFAULT_INVOICE_LAYOUT };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" title={template ? fill(t.editorEdit, { name: template.name }) : t.editorNew} icon={<FileText className="h-4 w-4" />} description={t.editorDesc}>
        <form onSubmit={submit} noValidate>
          <Grid cols={{ base: 1, lg: 2 }} gap="lg">
            <Stack gap="md">
              <Field label={t.name} required {...(tried && nameMissing ? { error: t.nameRequired } : {})}>
                <Input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} maxLength={100} placeholder={t.namePlaceholder} />
              </Field>
              <Switch label={t.isDefault} checked={d.isDefault} onCheckedChange={(v) => setD({ ...d, isDefault: v })} disabled={!!template?.isDefault} />
              <div className="grid gap-4 cq-md:grid-cols-2">
                <Field label={t.docTitle} hint={t.docTitleHint} {...(!InvoiceLayoutSchema.shape.title.safeParse(d.layout.title).success ? { error: t.docTitleInvalid } : {})}>
                  <Input value={d.layout.title} onChange={(e) => setLayout({ title: e.target.value.toUpperCase() })} maxLength={60} placeholder={t.docTitlePlaceholder} />
                </Field>
                <Field label={t.incotermsVersion}>
                  <Select
                    value={d.layout.incotermsVersion ?? ""}
                    onChange={(e) => setLayout({ incotermsVersion: (e.target.value || null) as InvoiceLayout["incotermsVersion"] })}
                    options={[{ value: "2020", label: "Incoterms® 2020" }, { value: "2010", label: "Incoterms® 2010" }, { value: "", label: t.incotermsNone }]} // kb-allow-raw: tên phiên bản Incoterms
                  />
                </Field>
                <Field label={t.originals}>
                  <Input value={d.originals} onChange={(e) => setD({ ...d, originals: e.target.value })} inputMode="numeric" maxLength={1} placeholder={t.countPlaceholder} />
                </Field>
                <Field label={t.copies}>
                  <Input value={d.copies} onChange={(e) => setD({ ...d, copies: e.target.value })} inputMode="numeric" maxLength={1} placeholder={t.countPlaceholder} />
                </Field>
              </div>
              <Field label={t.itemCodeSet} hint={t.itemCodeSetHint}>
                <Select value={codeSetValue(d.layout.itemCodeSet)} onChange={(e) => setLayout({ itemCodeSet: codeSetPick(e.target.value) })} options={codeSetOptions} />
              </Field>
              <Field label={t.headerNote}>
                <Input value={d.layout.headerNote ?? ""} onChange={(e) => setLayout({ headerNote: e.target.value || null })} maxLength={1000} placeholder={t.headerNotePlaceholder} />
              </Field>
              <Field label={t.statement}>
                <Textarea value={d.layout.statement ?? ""} onChange={(e) => setLayout({ statement: e.target.value || null })} maxLength={1000} rows={2} placeholder={t.statementPlaceholder} />
              </Field>

              <Stack gap="sm">
                <div>
                  <p className="text-sm font-medium text-fg">{t.blocks}</p>
                  <p className="text-xs text-fg-muted">{t.blocksHint}</p>
                </div>
                <SortableList
                  aria-label={t.blocks}
                  items={d.layout.blocks}
                  getId={(b) => b.key}
                  itemLabel={(b) => t[b.key]}
                  onReorder={(blocks) => setLayout({ blocks })}
                  renderItem={(b, parts) => (
                    <ItemRow
                      t={t}
                      handle={parts.handle}
                      name={t[b.key]}
                      standard={BLOCK_LABELS[b.key]}
                      visible={b.visible}
                      label={b.label}
                      locked={REQUIRED_BLOCKS.includes(b.key)}
                      onChange={(patch) => setLayout({ blocks: d.layout.blocks.map((x) => (x.key === b.key ? { ...x, ...patch } : x)) })}
                    />
                  )}
                />
              </Stack>
              <Stack gap="sm">
                <div>
                  <p className="text-sm font-medium text-fg">{t.columns}</p>
                  <p className="text-xs text-fg-muted">{t.columnsHint}</p>
                </div>
                <SortableList
                  aria-label={t.columns}
                  items={d.layout.columns}
                  getId={(c) => c.key}
                  itemLabel={(c) => colName(t, c.key)}
                  onReorder={(columns) => setLayout({ columns })}
                  renderItem={(c, parts) => (
                    <ItemRow
                      t={t}
                      handle={parts.handle}
                      name={colName(t, c.key)}
                      standard={COLUMN_LABELS[c.key].replace(" ({cur})", "")}
                      visible={c.visible}
                      label={c.label}
                      locked={REQUIRED_COLUMNS.includes(c.key)}
                      onChange={(patch) => setLayout({ columns: d.layout.columns.map((x) => (x.key === c.key ? { ...x, ...patch } : x)) })}
                    />
                  )}
                />
              </Stack>
            </Stack>
            <Stack gap="sm">
              <div>
                <p className="text-sm font-medium text-fg">{t.preview}</p>
                <p className="text-xs text-fg-muted">{t.previewHint}</p>
              </div>
              <InvoicePrintView invoice={SAMPLE_INVOICE} snapshot={snapshot} doc="invoice" originals={1} copies={0} />
            </Stack>
          </Grid>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending} disabled={!parsed.success}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({ t, handle, name, standard, visible, label, locked, onChange }: {
  t: T; handle: ReactNode; name: string; standard: string; visible: boolean; label: string | null; locked: boolean;
  onChange: (patch: { visible?: boolean; label?: string | null }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5">
      {handle}
      <Switch aria-label={fill(t.show, { name })} checked={visible} onCheckedChange={(v) => onChange({ visible: v })} disabled={locked} />
      <span className="min-w-0 flex-1 basis-32 text-sm text-fg">
        {name}
        {locked && <Badge size="sm" className="ml-2">{t.required}</Badge>}
      </span>
      <Input
        aria-label={fill(t.labelFor, { name })}
        value={label ?? ""}
        onChange={(e) => onChange({ label: e.target.value || null })}
        maxLength={60}
        placeholder={fill(t.labelPlaceholder, { label: standard })}
        className="h-8 cq-sm:w-56"
        disabled={!visible}
      />
    </div>
  );
}

export function InvoiceTemplatesCard() {
  const t = useMessages(INVOICE_TEMPLATES_MESSAGES);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: invoiceTemplateKeys.list, queryFn: listInvoiceTemplates });
  const session = useQuery({ queryKey: sessionKeys.me, queryFn: getSession });
  const role = session.data?.user.role;
  const canManage = role === "OWNER" || role === "ADMIN";
  const [editing, setEditing] = useState<{ template: InvoiceTemplate | null; initial: Draft } | null>(null);
  const [toDelete, setToDelete] = useState<InvoiceTemplate | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: invoiceTemplateKeys.list });
  const remove = useMutation({
    mutationFn: (id: string) => deleteInvoiceTemplate(id),
    onSuccess: () => {
      done();
      toast({ tone: "success", title: t.removed });
      setToDelete(null);
    },
    onError: toastMutationError(t.saveFailed),
  });
  const makeDefault = useMutation({
    mutationFn: (x: InvoiceTemplate) => saveInvoiceTemplate(x.id, { name: x.name, isDefault: true, layout: x.layout }),
    onSuccess: done,
    onError: toastMutationError(t.saveFailed),
  });

  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("name", {
          header: t.colName,
          meta: { hideable: false },
          cell: (c) => (
            <span className="flex flex-wrap items-center gap-2 font-medium text-fg">
              {c.getValue()}
              {c.row.original.isDefault && <Badge size="sm" tone="primary">{t.defaultBadge}</Badge>}
            </span>
          ),
        }),
        col.accessor((x) => x.layout.title, { id: "title", header: t.colTitle }),
        col.accessor("updatedAt", { header: t.colUpdated, cell: (c) => <span className="text-fg-muted">{formatRelative(c.getValue())}</span> }),
      ]),
    [t],
  );

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap="md">
          {!canManage && <p className="text-sm text-fg-muted">{t.adminOnly}</p>}
          {q.isError ? (
            <LoadError title={t.loadFailed} onRetry={() => void q.refetch()} />
          ) : (
            <DataTable
              aria-label={t.title}
              columns={columns}
              data={q.data ?? []}
              getRowId={(x) => x.id}
              rowLabel={(x) => x.name}
              loading={q.isLoading}
              pagination={false}
              emptyTitle={t.empty}
              emptyDescription={t.emptyDesc}
              {...(canManage ? { onRowClick: (x: InvoiceTemplate) => setEditing({ template: x, initial: toDraft(x) }) } : {})}
              toolbarActions={canManage && <Button size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setEditing({ template: null, initial: toDraft(null) })}>{t.newTemplate}</Button>}
              {...(canManage
                ? {
                    rowActions: (x: InvoiceTemplate) => (
                      <RowActions
                        rowLabel={x.name}
                        actions={[
                          { id: "edit", label: t.edit, icon: <Pencil />, onSelect: () => setEditing({ template: x, initial: toDraft(x) }) },
                          { id: "dup", label: t.duplicate, icon: <Copy />, quick: false, onSelect: () => setEditing({ template: null, initial: { ...toDraft(x), name: fill(t.copyName, { name: x.name }), isDefault: false } }) },
                          ...(x.isDefault ? [] : [{ id: "default", label: t.setDefault, icon: <Star />, quick: false, onSelect: () => makeDefault.mutate(x) }]),
                          { id: "del", label: t.remove, icon: <Trash2 />, tone: "danger" as const, quick: false, onSelect: () => setToDelete(x) },
                        ]}
                      />
                    ),
                  }
                : {})}
            />
          )}
        </Stack>
      </CardContent>
      {editing && <TemplateEditor open onOpenChange={(o) => !o && setEditing(null)} template={editing.template} initial={editing.initial} />}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={t.removeTitle}
        icon={<Trash2 className="h-4 w-4" />}
        {...(toDelete ? { subject: toDelete.name } : {})}
        confirmLabel={t.remove}
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
      >
        {fill(t.removeBody, { name: toDelete?.name ?? "" })}
      </ConfirmDialog>
    </Card>
  );
}
