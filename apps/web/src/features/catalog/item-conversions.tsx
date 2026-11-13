"use client";
// Quy đổi đơn vị của mặt hàng: "1 ĐVT = hệ số ĐVT gốc" (hệ số là chuỗi Decimal). Sửa: người sửa thông tin chung hoặc người phụ trách bộ mã.
import type { CatalogItem, UnitConversion } from "@kb/contracts";
import { Button, Combobox, ConfirmDialog, createDataTableColumnHelper, DataTable, Field, fill, Input, RowActions, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { catalogKeys, removeConversion, setConversion } from "@/api/catalog";
import { formatNumber } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { CATALOG_ITEM_MESSAGES } from "./catalog.messages";
import { useUnitOptions } from "./unit-options";

type Messages = (typeof CATALOG_ITEM_MESSAGES)["vi"];
const col = createDataTableColumnHelper<UnitConversion>();

/** Hệ số giữ đủ số lẻ đã nhập (0,4 không bị làm tròn thành 0). */
export const formatFactor = (factor: string) => formatNumber(factor, factor.split(".")[1]?.length ?? 0);
export const conversionText = (t: Messages, c: UnitConversion, base: string | null) => fill(t.conversionRow, { unit: c.unit, factor: formatFactor(c.factor), base: base ?? "" }).trim();

export function ItemConversions({ item, conversions, canEdit }: { item: CatalogItem; conversions: readonly UnitConversion[]; canEdit: boolean }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const qc = useQueryClient();
  const units = useUnitOptions();
  const [unit, setUnit] = useState<string | null>(null);
  const [factor, setFactor] = useState("");
  const [removing, setRemoving] = useState<UnitConversion | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: catalogKeys.all });
  const save = useMutation({
    mutationFn: () => setConversion({ itemId: item.id, unit: unit!, factor: factor.trim().replace(",", ".") }),
    onSuccess: () => {
      refresh();
      setUnit(null);
      setFactor("");
      toast({ tone: "success", title: t.conversionSaved });
    },
    onError: toastMutationError(t.saveFailed),
  });
  const remove = useMutation({
    mutationFn: (c: UnitConversion) => removeConversion(item.id, c.unit),
    onSuccess: () => {
      refresh();
      setRemoving(null);
      toast({ tone: "success", title: t.conversionRemoved });
    },
    onError: toastMutationError(t.saveFailed),
  });
  const columns = useMemo(
    () =>
      col.columns([
        col.accessor("unit", { header: t.colConvUnit, size: 100 }),
        col.accessor((c) => conversionText(t, c, item.baseUnit), { id: "factor", header: t.colConvFactor, size: 240, cell: (c) => <span className="tabular-nums">{c.getValue()}</span> }),
      ]),
    [t, item.baseUnit],
  );
  const editable = canEdit && item.status !== "MERGED";

  return (
    <div className="flex flex-col gap-3">
      {conversions.length === 0 ? (
        <p className="text-sm text-fg-muted">{t.conversionsEmpty}</p>
      ) : (
        <DataTable
          aria-label={t.conversionsLabel}
          columns={columns}
          data={conversions}
          getRowId={(c) => c.unit}
          rowLabel={(c) => c.unit}
          pagination={false}
          {...(editable
            ? { rowActions: (c: UnitConversion) => <RowActions rowLabel={c.unit} actions={[{ id: "remove", label: t.removeConversion, icon: <Trash2 />, tone: "danger", onSelect: () => setRemoving(c) }]} /> }
            : {})}
        />
      )}
      {editable && !item.baseUnit && <p className="text-sm text-fg-muted">{t.needBaseUnit}</p>}
      {editable && item.baseUnit && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (unit && factor.trim()) save.mutate();
          }}
        >
          <Field label={t.convUnit} className="w-full cq-sm:w-48">
            <Combobox options={units.filter((u) => u.value !== item.baseUnit)} value={unit} onChange={setUnit} placeholder={t.unitPlaceholder} />
          </Field>
          <Field label={t.convFactor} hint={unit ? fill(t.aliasFactorHint, { unit, base: item.baseUnit }) : undefined} className="min-w-40 flex-1">
            <Input value={factor} onChange={(e) => setFactor(e.target.value)} placeholder={t.aliasFactorPlaceholder} inputMode="decimal" />
          </Field>
          <Button type="submit" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} loading={save.isPending} disabled={!unit || !factor.trim()}>{t.addConversion}</Button>
        </form>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t.removeConversionTitle}
        icon={<Trash2 className="h-4 w-4" />}
        subject={removing ? conversionText(t, removing, item.baseUnit) : null}
        confirmLabel={t.removeConversion}
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      >
        {t.removeConversionBody}
      </ConfirmDialog>
    </div>
  );
}
