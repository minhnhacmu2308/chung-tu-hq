"use client";
// Panel chi tiết mặt hàng (Dialog dạng panel, nút Đóng cuối): thông tin chung (+ sửa – APPROVER/Quản trị/Chủ), mã theo bộ mã, quy đổi,
// đã dùng ở, lịch sử (field_audit CATALOG_EDIT); Gộp vào mặt hàng khác + Ngưng dùng / Dùng lại (Quản trị/Chủ).
import type { CatalogItem, CatalogItemHistoryEntry, CatalogItemKind, CodeSet, UpdateItemRequest } from "@kb/contracts";
import {
  Alert, Button, Combobox, ConfirmDialog, Dialog, DialogContent, DialogFooter, Field, fill, Input, Select, SkeletonList, Stack, StatusBadge, Textarea, toast, useMessages, useUiLocale,
  statusLabel, type UiLocale,
} from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, Merge, Package, Pencil } from "lucide-react";
import { useState, type ReactNode } from "react";
import { archiveCatalogItem, catalogKeys, getCatalogItem, getCatalogItemHistory, updateCatalogItem } from "@/api/catalog";
import { listMembers, memberKeys } from "@/api/session";
import { LoadError } from "@/components/common/load-error";
import { formatDate, formatDateTime, formatHs, getFormatLocale } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { errorText } from "@/lib/reason-codes";
import type { CatalogAccess } from "./catalog-access";
import { ALIAS_STATUS, ITEM_KINDS, ITEM_STATUS } from "./catalog-display";
import { CATALOG_ITEM_MESSAGES, CATALOG_MESSAGES } from "./catalog.messages";
import { ItemAliases } from "./item-aliases";
import { ItemConversions } from "./item-conversions";
import { MergeDialog } from "./merge-dialog";
import { useUnitOptions } from "./unit-options";

type Messages = (typeof CATALOG_ITEM_MESSAGES)["vi"];
type ListMessages = (typeof CATALOG_MESSAGES)["vi"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function Meta({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <div className={wide ? "flex min-w-0 flex-col gap-0.5 cq-md:col-span-2" : "flex min-w-0 flex-col gap-0.5"}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-fg">{children}</dd>
    </div>
  );
}

const FIELD_LABEL: Partial<Record<string, keyof Messages>> = {
  name: "name", hsCode: "hs", baseUnit: "baseUnit", kind: "kind", origin: "origin", description: "description", note: "note",
  importDutyRate: "importDuty", vatRate: "vat", tariffSchedule: "tariffSchedule", status: "status",
};

/** Một dòng lịch sử → nhãn đã dịch + giá trị cũ/mới dễ đọc. */
export function describeHistory(e: CatalogItemHistoryEntry, t: Messages, tl: ListMessages, sets: readonly CodeSet[], locale: UiLocale): { label: string; from: string; to: string } {
  const setName = (id: string) => sets.find((s) => s.id === id)?.name ?? t.histUnknownSet;
  const kindLabel = (v: string) => (ITEM_KINDS.includes(v as CatalogItemKind) ? tl[`kind${v as CatalogItemKind}`] : v);
  const itemStatus = (v: string) => (v in ITEM_STATUS ? statusLabel(ITEM_STATUS[v as keyof typeof ITEM_STATUS], locale) : v);
  const aliasStatus = (v: string) => (v in ALIAS_STATUS ? statusLabel(ALIAS_STATUS[v as keyof typeof ALIAS_STATUS], locale) : v);
  const alias = /^alias:([^:]+):(.*?)(?::(name|unit))?$/.exec(e.key);
  if (alias) {
    const [, setId, code, part] = alias;
    const vars = { code: code ?? "", set: setName(setId ?? "") };
    if (part === "name") return { label: fill(t.histAliasName, vars), from: e.oldValue, to: e.newValue };
    if (part === "unit") return { label: fill(t.histAliasUnit, vars), from: e.oldValue, to: e.newValue };
    return { label: fill(t.histAlias, vars), from: aliasStatus(e.oldValue), to: aliasStatus(e.newValue) };
  }
  if (e.key.startsWith("conv:")) return { label: fill(t.histConversion, { unit: e.key.slice(5) }), from: e.oldValue, to: e.newValue };
  if (e.key === "item") return { label: t.histCreated, from: e.oldValue, to: e.newValue };
  if (e.key === "merge") return { label: t.histMerged, from: e.oldValue, to: e.newValue };
  if (e.key === "kind") return { label: t.kind, from: kindLabel(e.oldValue), to: kindLabel(e.newValue) };
  if (e.key === "status") return { label: t.status, from: itemStatus(e.oldValue), to: itemStatus(e.newValue) };
  const k = FIELD_LABEL[e.key];
  return { label: k ? t[k] : e.key, from: e.oldValue, to: e.newValue };
}

function History({ itemId, sets }: { itemId: string; sets: readonly CodeSet[] }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const tl = useMessages(CATALOG_MESSAGES);
  const locale = useUiLocale();
  const history = useQuery({ queryKey: catalogKeys.history(itemId), queryFn: () => getCatalogItemHistory(itemId) });
  // Tên người sửa: danh sách thành viên (không tải được thì hiện nhãn chung, không chặn lịch sử).
  const members = useQuery({ queryKey: memberKeys.all, queryFn: listMembers });
  if (history.isLoading) return <SkeletonList rows={3} />;
  if (history.isError) return <LoadError onRetry={() => void history.refetch()} title={t.historyLoadError} />;
  const rows = history.data ?? [];
  if (rows.length === 0) return <p className="text-sm text-fg-muted">{t.historyEmpty}</p>;
  return (
    <ul aria-label={t.sectionHistory} className="flex flex-col divide-y divide-border">
      {rows.map((e, i) => {
        const d = describeHistory(e, t, tl, sets, locale);
        // Danh sách thành viên chưa có (đang tải / lỗi) → nhãn trung tính; có mà không thấy người → đã rời doanh nghiệp.
        const who = members.data ? (members.data.find((m) => m.id === e.userId)?.name ?? t.histUnknownUser) : t.histMember;
        return (
          <li key={`${e.at}-${i}`} className="flex flex-col gap-0.5 py-2">
            <span className="text-sm font-medium text-fg">{d.label}</span>
            <span className="break-words text-sm text-fg-muted">
              {d.from && <span>{d.from}</span>}
              {d.from && d.to && <span aria-hidden="true"> → </span>}
              {d.to && <span className="text-fg">{d.to}</span>}
            </span>
            <span className="text-xs text-fg-subtle">{fill(t.histBy, { name: who, time: formatDateTime(e.at) })}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Mặt hàng đã gộp: nêu mặt hàng giữ lại (đọc chi tiết theo merged_into_id; chưa tải được thì câu chung). */
function MergedNotice({ intoId }: { intoId: string | null }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const into = useQuery({ queryKey: catalogKeys.item(intoId ?? ""), queryFn: () => getCatalogItem(intoId!), enabled: !!intoId });
  const target = into.data?.item;
  return <Alert tone="info">{target ? fill(t.mergedIntoNamed, { itemNo: target.itemNo, name: target.name }) : t.mergedInto}</Alert>;
}

function Usage({ usage }: { usage: { declarations: { declarationNo: string | null; date: string | null }[]; invoices: { invoiceNo: string | null; date: string | null }[] } }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const lines = [
    ...usage.declarations.map((d) => ({ text: fill(t.usageDeclaration, { no: d.declarationNo ?? t.usageNoNumber }), date: d.date })),
    ...usage.invoices.map((d) => ({ text: fill(t.usageInvoice, { no: d.invoiceNo ?? t.usageNoNumber }), date: d.date })),
  ];
  if (lines.length === 0) return <p className="text-sm text-fg-muted">{t.usageEmpty}</p>;
  return (
    <ul className="flex flex-col gap-1 text-sm text-fg">
      {lines.map((l, i) => (
        <li key={i}>
          {l.text}
          {l.date && <span className="text-fg-muted"> · {formatDate(l.date)}</span>}
        </li>
      ))}
    </ul>
  );
}

function EditItemDialog({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const tl = useMessages(CATALOG_MESSAGES);
  const qc = useQueryClient();
  const units = useUnitOptions(item.baseUnit ? [item.baseUnit] : []);
  const [form, setForm] = useState({
    name: item.name, kind: item.kind, hsCode: item.hsCode ?? "", baseUnit: item.baseUnit, origin: item.origin ?? "",
    importDutyRate: item.importDutyRate ?? "", vatRate: item.vatRate ?? "", description: item.description ?? "", note: item.note ?? "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const text = (v: string) => (v.trim() ? v.trim() : null);
  const save = useMutation({
    mutationFn: () => {
      const patch: UpdateItemRequest = {};
      if (form.name !== item.name) patch.name = form.name;
      if (form.kind !== item.kind) patch.kind = form.kind;
      if (form.hsCode !== (item.hsCode ?? "")) patch.hsCode = form.hsCode;
      if (form.baseUnit !== item.baseUnit) patch.baseUnit = form.baseUnit;
      if (form.origin !== (item.origin ?? "")) patch.origin = text(form.origin);
      if (form.importDutyRate !== (item.importDutyRate ?? "")) patch.importDutyRate = text(form.importDutyRate.replace(",", "."));
      if (form.vatRate !== (item.vatRate ?? "")) patch.vatRate = text(form.vatRate.replace(",", "."));
      if (form.description !== (item.description ?? "")) patch.description = text(form.description);
      if (form.note !== (item.note ?? "")) patch.note = text(form.note);
      return updateCatalogItem(item.id, patch);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: t.saved });
      onClose();
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.editTitle} description={t.editDescription} icon={<Pencil className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Stack gap="md">
            {save.isError && <Alert tone="danger">{errorText(save.error, getFormatLocale(), t.saveFailed)}</Alert>}
            <Field label={t.name} required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder={t.namePlaceholder} />
            </Field>
            <Field label={t.kind}>
              <Select options={ITEM_KINDS.map((k) => ({ value: k, label: tl[`kind${k}`] }))} value={form.kind} onChange={(e) => set("kind", e.target.value as CatalogItemKind)} />
            </Field>
            <Field label={t.hs}>
              <Input value={form.hsCode} onChange={(e) => set("hsCode", e.target.value)} placeholder={t.hsPlaceholder} inputMode="numeric" />
            </Field>
            <Field label={t.baseUnit}>
              <Combobox options={units} value={form.baseUnit} onChange={(v) => set("baseUnit", v)} placeholder={t.unitPlaceholder} />
            </Field>
            <Field label={t.origin}>
              <Input value={form.origin} onChange={(e) => set("origin", e.target.value)} placeholder={t.originPlaceholder} />
            </Field>
            <Field label={t.importDuty}>
              <Input value={form.importDutyRate} onChange={(e) => set("importDutyRate", e.target.value)} placeholder={t.ratePlaceholder} inputMode="decimal" />
            </Field>
            <Field label={t.vat}>
              <Input value={form.vatRate} onChange={(e) => set("vatRate", e.target.value)} placeholder={t.ratePlaceholder} inputMode="decimal" />
            </Field>
            <Field label={t.description}>
              <Textarea value={form.description} onChange={(e) => set("description", e.target.value)} placeholder={t.descriptionPlaceholder} rows={2} />
            </Field>
            <Field label={t.note}>
              <Textarea value={form.note} onChange={(e) => set("note", e.target.value)} placeholder={t.notePlaceholder} rows={2} />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={save.isPending} disabled={!form.name.trim()}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ItemPanel({ itemId, sets, access, onOpenChange }: { itemId: string | null; sets: readonly CodeSet[]; access: CatalogAccess; onOpenChange: (o: boolean) => void }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const tl = useMessages(CATALOG_MESSAGES);
  const qc = useQueryClient();
  // Sau khi gộp: panel chuyển sang mặt hàng giữ lại.
  const [shownId, setShownId] = useState<string | null>(null);
  const id = shownId ?? itemId;
  const detail = useQuery({ queryKey: catalogKeys.item(id ?? ""), queryFn: () => getCatalogItem(id!), enabled: !!id });
  const [editing, setEditing] = useState(false);
  const [merging, setMerging] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const close = (o: boolean) => {
    if (o) return;
    setShownId(null);
    onOpenChange(false);
  };
  const archive = useMutation({
    mutationFn: (archived: boolean) => archiveCatalogItem(id!, archived),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      setArchiving(false);
      toast({ tone: "success", title: d.item.status === "ARCHIVED" ? t.archived : t.unarchived });
    },
    onError: toastMutationError(t.actionFailed),
  });
  const d = detail.data;
  const item = d?.item;
  const live = item?.status === "ACTIVE";
  const pct = (v: string | null) => (v ? fill(t.percent, { n: v }) : t.none);

  return (
    <>
      <Dialog open={!!id} onOpenChange={close} defaultPresentation="panel">
        <DialogContent title={t.panelTitle} {...(item ? { description: `${item.itemNo} · ${item.name}` } : {})} icon={<Package className="h-4 w-4" />} size="lg">
          {detail.isLoading && <SkeletonList rows={6} />}
          {detail.isError && <LoadError onRetry={() => void detail.refetch()} title={t.loadError} />}
          {d && item && (
            <Stack gap="lg">
              {item.status === "MERGED" && <MergedNotice intoId={item.mergedIntoId} />}
              <Section title={t.sectionInfo}>
                <dl className="grid grid-cols-1 gap-3 cq-md:grid-cols-2">
                  <Meta label={t.itemNo}><span className="font-mono">{item.itemNo}</span></Meta>
                  <Meta label={t.status}><StatusBadge status={ITEM_STATUS[item.status]} /></Meta>
                  <Meta label={t.name} wide>{item.name}</Meta>
                  <Meta label={t.kind}>{tl[`kind${item.kind}`]}</Meta>
                  <Meta label={t.hs}><span className="font-mono">{item.hsCode ? formatHs(item.hsCode) : t.none}</span></Meta>
                  <Meta label={t.baseUnit}>{item.baseUnit ?? t.none}</Meta>
                  <Meta label={t.origin}>{item.origin ?? t.none}</Meta>
                  <Meta label={t.importDuty}>{pct(item.importDutyRate)}</Meta>
                  <Meta label={t.vat}>{pct(item.vatRate)}</Meta>
                  <Meta label={t.timesDeclared}>{item.timesDeclared}</Meta>
                  {item.description && <Meta label={t.description} wide>{item.description}</Meta>}
                  {item.note && <Meta label={t.note} wide>{item.note}</Meta>}
                </dl>
                {access.canEditItem && item.status !== "MERGED" && (
                  <div>
                    <Button size="sm" variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>{t.edit}</Button>
                  </div>
                )}
              </Section>
              <Section title={t.sectionAliases}>
                <ItemAliases item={item} aliases={d.aliases} sets={sets} access={access} />
              </Section>
              <Section title={t.sectionConversions}>
                <ItemConversions item={item} conversions={d.conversions} canEdit={access.canEditConversions} />
              </Section>
              <Section title={t.sectionUsage}>
                <Usage usage={d.usage} />
              </Section>
              <Section title={t.sectionHistory}>
                <History itemId={item.id} sets={sets} />
              </Section>
            </Stack>
          )}
          <DialogFooter>
            {item && access.isAdmin && live && (
              <Button variant="secondary" className="mr-auto" leftIcon={<Merge className="h-4 w-4" />} onClick={() => setMerging(true)}>{t.merge}</Button>
            )}
            {item && access.isAdmin && live && (
              <Button variant="danger-outline" leftIcon={<Archive className="h-4 w-4" />} onClick={() => setArchiving(true)}>{t.archive}</Button>
            )}
            {item && access.isAdmin && item.status === "ARCHIVED" && (
              <Button variant="secondary" leftIcon={<ArchiveRestore className="h-4 w-4" />} loading={archive.isPending} onClick={() => archive.mutate(false)}>{t.unarchive}</Button>
            )}
            <Button variant="secondary" onClick={() => close(false)}>{t.close}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {item && editing && <EditItemDialog item={item} onClose={() => setEditing(false)} />}
      {item && <MergeDialog item={item} open={merging} onOpenChange={setMerging} onMerged={(intoId) => setShownId(intoId)} />}
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={t.archiveTitle}
        icon={<Archive className="h-4 w-4" />}
        subject={item ? `${item.itemNo} · ${item.name}` : null}
        confirmLabel={t.archive}
        loading={archive.isPending}
        onConfirm={() => archive.mutate(true)}
      >
        {t.archiveBody}
      </ConfirmDialog>
    </>
  );
}
