"use client";
// "Mã lạ – Chọn mặt hàng" (ADR 0015, spec danh mục §5): gắn mặt hàng danh mục cho dòng hàng – chọn mặt hàng có sẵn (tìm mọi mã / mã nối / tên)
// hoặc tạo mặt hàng mới (tên, HS, ĐVT điền sẵn theo dòng). Backend ghi Part No của dòng thành bí danh bộ nhà cung cấp (người phụ trách → ACTIVE,
// người khác → đề xuất); tờ khai đã khóa → lỗi hiện trong hộp. ĐVT dòng khác ĐVT gốc → hỏi hệ số quy đổi.
import { itemUnitKey, type CatalogItemKind, type CatalogItemListRow, type LineItem, type LinkLineItemInput } from "@kb/contracts";
import { Alert, Button, Combobox, Dialog, DialogContent, DialogFooter, Field, fill, Input, SegmentedControl, Select, Stack, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { useState, type FormEvent } from "react";
import { catalogKeys, linkLineItem } from "@/api/catalog";
import { declarationKeys } from "@/api/declaration";
import { ITEM_KINDS } from "@/features/catalog/catalog-display";
import { CATALOG_MESSAGES } from "@/features/catalog/catalog.messages";
import { ItemPicker } from "@/features/catalog/item-picker";
import { useUnitOptions } from "@/features/catalog/unit-options";
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import { LINK_ITEM_MESSAGES } from "./link-item.messages";

type Mode = "PICK" | "CREATE";

export function LinkItemDialog({ item, dossierId, onClose }: { item: LineItem | null; dossierId: string; onClose: () => void }) {
  const t = useMessages(LINK_ITEM_MESSAGES);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={fill(t.dialogTitle, { line: item?.lineNo ?? "" })} icon={<PackageSearch className="h-4 w-4" />} description={t.dialogDesc} size="md">
        {item && <LinkItemForm item={item} dossierId={dossierId} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function LinkItemForm({ item, dossierId, onDone }: { item: LineItem; dossierId: string; onDone: () => void }) {
  const t = useMessages(LINK_ITEM_MESSAGES);
  const tc = useMessages(CATALOG_MESSAGES);
  const qc = useQueryClient();
  const units = useUnitOptions([item.unit]);
  const [mode, setMode] = useState<Mode>("PICK");
  const [picked, setPicked] = useState<CatalogItemListRow | null>(null);
  const [name, setName] = useState(item.description);
  const [kind, setKind] = useState<CatalogItemKind>("GOODS");
  const [hs, setHs] = useState((item.hsConfirmed ?? "").replace(/\D/g, ""));
  const [baseUnit, setBaseUnit] = useState<string | null>(item.unit || null);
  const [factor, setFactor] = useState("");
  // ĐVT gốc của mặt hàng (chọn / tạo) khác ĐVT dòng → hỏi hệ số "1 ĐVT dòng = ? ĐVT gốc".
  const base = mode === "PICK" ? picked?.baseUnit ?? null : baseUnit;
  const needFactor = !!base && !!item.unit && itemUnitKey(base) !== itemUnitKey(item.unit);
  const f = needFactor && factor.trim() ? { factor: factor.trim() } : {};

  const link = useMutation({
    mutationFn: () => {
      const input: LinkLineItemInput =
        mode === "PICK"
          ? { itemId: picked!.id, ...f }
          : { createItem: { kind, name: name.trim(), ...(hs.trim() ? { hsCode: hs.trim() } : {}), ...(baseUnit ? { baseUnit } : {}), ...f } };
      return linkLineItem(item.id, input);
    },
    onSuccess: (line) => {
      void qc.invalidateQueries({ queryKey: declarationKeys.items(dossierId) });
      void qc.invalidateQueries({ queryKey: declarationKeys.view(dossierId) });
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      if (line.catalogItem) toast({ tone: "success", title: fill(t.linked, { itemNo: line.catalogItem.itemNo, line: line.lineNo }) });
      else toast({ tone: "info", title: t.queued });
      onDone();
    },
  });
  const ready = mode === "PICK" ? !!picked : !!name.trim();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) link.mutate();
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {link.isError && <Alert tone="danger">{errorText(link.error, getFormatLocale(), t.failed)}</Alert>}
        <SegmentedControl<Mode>
          label={t.modeLabel}
          hideLabel
          className="justify-start"
          value={mode}
          onChange={setMode}
          options={[{ value: "PICK", label: t.modePick }, { value: "CREATE", label: t.modeCreate }]}
        />
        {mode === "PICK" ? (
          <Field label={t.itemLabel} required>
            <ItemPicker value={picked} onChange={setPicked} placeholder={t.itemPlaceholder} emptyText={t.noResults} />
          </Field>
        ) : (
          <>
            <Field label={t.nameLabel} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={500} placeholder={t.namePlaceholder} />
            </Field>
            <div className="grid gap-4 cq-md:grid-cols-3">
              <Field label={t.kindLabel}>
                <Select options={ITEM_KINDS.map((k) => ({ value: k, label: tc[`kind${k}`] }))} value={kind} onChange={(e) => setKind(e.target.value as CatalogItemKind)} />
              </Field>
              <Field label={t.hsLabel}>
                <Input value={hs} onChange={(e) => setHs(e.target.value)} inputMode="numeric" maxLength={12} placeholder={t.hsPlaceholder} />
              </Field>
              <Field label={t.unitLabel}>
                <Combobox options={units} value={baseUnit} onChange={setBaseUnit} placeholder={t.unitPlaceholder} clearable />
              </Field>
            </div>
          </>
        )}
        {needFactor && (
          <Field label={fill(t.factorLabel, { unit: item.unit, base })} hint={t.factorHint}>
            <Input value={factor} onChange={(e) => setFactor(e.target.value)} inputMode="decimal" maxLength={20} placeholder={t.factorPlaceholder} />
          </Field>
        )}
      </Stack>
      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onDone}>{t.cancel}</Button>
        <Button type="submit" loading={link.isPending} disabled={!ready}>{mode === "PICK" ? t.submitPick : t.submitCreate}</Button>
      </DialogFooter>
    </form>
  );
}
