"use client";
// Mã của mặt hàng theo từng bộ mã: mỗi bộ một bảng con (tên bộ + nhãn loại bộ), RowActions theo quyền người phụ trách bộ:
// đề xuất → Duyệt / Từ chối; đang dùng → Chuyển sang mặt hàng khác / Ngưng dùng (ConfirmDialog). Ai ≠ VIEWER cũng thêm/đề xuất được mã.
import type { CatalogItem, CatalogItemListRow, CodeSet, ItemAlias } from "@kb/contracts";
import {
  Button, Combobox, ConfirmDialog, createDataTableColumnHelper, DataTable, Dialog, DialogContent, DialogFooter, Field, fill, Input, RowActions, Select, Stack, StatusBadge, toast,
  useMessages, useUiLocale, type RowAction,
} from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Ban, Check, Plus, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { aliasAction, catalogKeys, deactivateAlias, proposeAlias } from "@/api/catalog";
import { toastMutationError } from "@/lib/mutation-error";
import type { CatalogAccess } from "./catalog-access";
import { ALIAS_STATUS } from "./catalog-display";
import { CATALOG_ITEM_MESSAGES } from "./catalog.messages";
import { setTitle } from "./catalog-xlsx";
import { CodeSetLabel } from "./code-set-label";
import { ItemPicker } from "./item-picker";
import { useUnitOptions } from "./unit-options";

type Messages = (typeof CATALOG_ITEM_MESSAGES)["vi"];
const col = createDataTableColumnHelper<ItemAlias>();
const buildColumns = (t: Messages) =>
  col.columns([
    col.accessor("code", { header: t.colAliasCode, size: 150, meta: { hideable: false }, cell: (c) => <span className="font-mono">{c.getValue()}</span> }),
    col.accessor((a) => a.name ?? "", { id: "name", header: t.colAliasName, size: 240, meta: { wrap: true } }),
    col.accessor((a) => a.unit ?? "", { id: "unit", header: t.colAliasUnit, size: 80 }),
    col.accessor("status", { header: t.colAliasStatus, size: 130, cell: (c) => <StatusBadge status={ALIAS_STATUS[c.getValue()]} /> }),
  ]);

export function ItemAliases({ item, aliases, sets, access }: { item: CatalogItem; aliases: readonly ItemAlias[]; sets: readonly CodeSet[]; access: CatalogAccess }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const qc = useQueryClient();
  const columns = useMemo(() => buildColumns(t), [t]);
  const [moving, setMoving] = useState<ItemAlias | null>(null);
  const [stopping, setStopping] = useState<ItemAlias | null>(null);
  const [adding, setAdding] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: catalogKeys.all });
  const act = useMutation({
    mutationFn: ({ a, approve }: { a: ItemAlias; approve: boolean }) => aliasAction(a.id, approve ? { action: "APPROVE" } : { action: "REJECT" }),
    onSuccess: (a, v) => {
      refresh();
      toast({ tone: "success", title: fill(v.approve ? t.approved : t.rejected, { code: a.code }) });
    },
    onError: toastMutationError(t.actionFailed),
  });
  const stop = useMutation({
    mutationFn: (a: ItemAlias) => deactivateAlias(a.id),
    onSuccess: (a) => {
      refresh();
      setStopping(null);
      toast({ tone: "success", title: fill(t.deactivated, { code: a.code }) });
    },
    onError: toastMutationError(t.actionFailed),
  });
  const live = item.status !== "MERGED";
  // Bộ mã theo thứ tự danh sách bộ (bộ đã xóa/không còn thấy xếp cuối với id).
  const groups = [...new Set(aliases.map((a) => a.codeSetId))]
    .map((id) => ({ id, set: sets.find((s) => s.id === id) ?? null, rows: aliases.filter((a) => a.codeSetId === id) }))
    .sort((x, y) => (x.set ? sets.indexOf(x.set) : sets.length) - (y.set ? sets.indexOf(y.set) : sets.length));

  const actionsFor = (a: ItemAlias): RowAction[] => {
    if (!live || !access.managesSet(a.codeSetId)) return [];
    if (a.status === "PROPOSED")
      return [
        { id: "approve", label: t.approve, icon: <Check />, disabled: act.isPending, onSelect: () => act.mutate({ a, approve: true }) },
        { id: "reject", label: t.reject, icon: <X />, disabled: act.isPending, onSelect: () => act.mutate({ a, approve: false }) },
      ];
    if (a.status === "ACTIVE")
      return [
        { id: "move", label: t.move, icon: <ArrowRightLeft />, onSelect: () => setMoving(a) },
        { id: "stop", label: t.deactivate, icon: <Ban />, tone: "danger", onSelect: () => setStopping(a) },
      ];
    return [];
  };

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 && <p className="text-sm text-fg-muted">{t.aliasesEmpty}</p>}
      {groups.map((g) => {
        const name = g.set?.name ?? g.id;
        return (
          <div key={g.id} className="flex flex-col gap-2">
            {g.set ? <CodeSetLabel name={g.set.name} kind={g.set.kind} /> : <span className="font-medium text-fg">{name}</span>}
            <DataTable
              aria-label={fill(t.aliasesLabel, { set: name })}
              columns={columns}
              data={g.rows}
              getRowId={(a) => a.id}
              rowLabel={(a) => a.code}
              pagination={false}
              rowActions={(a) => {
                const actions = actionsFor(a);
                return actions.length ? <RowActions rowLabel={a.code} actions={actions} /> : null;
              }}
            />
          </div>
        );
      })}
      {access.canContribute && live && sets.length > 0 && (
        <div>
          <Button size="sm" variant="secondary" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>{t.addAlias}</Button>
        </div>
      )}
      {adding && <AddAliasDialog item={item} sets={sets} onClose={() => setAdding(false)} />}
      {moving && <MoveAliasDialog alias={moving} item={item} onClose={() => setMoving(null)} />}
      <ConfirmDialog
        open={stopping !== null}
        onOpenChange={(o) => !o && setStopping(null)}
        title={t.deactivateTitle}
        icon={<Ban className="h-4 w-4" />}
        subject={stopping ? `${stopping.code} · ${sets.find((s) => s.id === stopping.codeSetId)?.name ?? ""}` : null}
        confirmLabel={t.deactivate}
        loading={stop.isPending}
        onConfirm={() => stopping && stop.mutate(stopping)}
      >
        {t.deactivateBody}
      </ConfirmDialog>
    </div>
  );
}

function AddAliasDialog({ item, sets, onClose }: { item: CatalogItem; sets: readonly CodeSet[]; onClose: () => void }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const units = useUnitOptions(item.baseUnit ? [item.baseUnit] : []);
  const [setId, setSetId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string | null>(item.baseUnit);
  const [factor, setFactor] = useState("");
  const otherUnit = !!unit && !!item.baseUnit && unit !== item.baseUnit;
  const add = useMutation({
    mutationFn: () =>
      proposeAlias({
        itemId: item.id, codeSetId: setId, code, ...(name.trim() ? { name } : {}), ...(unit ? { unit } : {}),
        ...(otherUnit && factor.trim() ? { factor: factor.trim().replace(",", ".") } : {}),
      }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: fill(a.status === "ACTIVE" ? t.aliasAdded : t.aliasProposed, { code: a.code }) });
      onClose();
    },
    onError: toastMutationError(t.saveFailed),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.addAliasTitle} description={t.addAliasDescription} icon={<Tag className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (setId && code.trim()) add.mutate();
          }}
        >
          <Stack gap="md">
            <Field label={t.aliasSet} required>
              <Select options={sets.map((s) => ({ value: s.id, label: setTitle(s, locale) }))} value={setId} onChange={(e) => setSetId(e.target.value)} placeholder={t.aliasSetPlaceholder} />
            </Field>
            <Field label={t.aliasCode} required>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.aliasCodePlaceholder} />
            </Field>
            <Field label={t.aliasName}>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.aliasNamePlaceholder} />
            </Field>
            <Field label={t.aliasUnit}>
              <Combobox options={units} value={unit} onChange={setUnit} placeholder={t.unitPlaceholder} clearable />
            </Field>
            {otherUnit && (
              <Field label={t.aliasFactor} hint={fill(t.aliasFactorHint, { unit: unit ?? "", base: item.baseUnit ?? "" })}>
                <Input value={factor} onChange={(e) => setFactor(e.target.value)} placeholder={t.aliasFactorPlaceholder} inputMode="decimal" />
              </Field>
            )}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={add.isPending} disabled={!setId || !code.trim()}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveAliasDialog({ alias, item, onClose }: { alias: ItemAlias; item: CatalogItem; onClose: () => void }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const qc = useQueryClient();
  const [target, setTarget] = useState<CatalogItemListRow | null>(null);
  const move = useMutation({
    mutationFn: (toItemId: string) => aliasAction(alias.id, { action: "MOVE", toItemId }),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: fill(t.moved, { code: a.code }) });
      onClose();
    },
    onError: toastMutationError(t.actionFailed),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.moveTitle} description={fill(t.moveDescription, { code: alias.code })} icon={<ArrowRightLeft className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target) move.mutate(target.id);
          }}
        >
          <Field label={t.moveTarget} required>
            <ItemPicker excludeId={item.id} value={target} onChange={setTarget} placeholder={t.mergeTargetPlaceholder} emptyText={t.pickNoResults} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={move.isPending} disabled={!target}>{t.moveConfirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
