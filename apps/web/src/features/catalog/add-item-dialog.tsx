"use client";
// Thêm mặt hàng: tạo thẳng (người sửa thông tin chung / người phụ trách bộ mã) hoặc vào hàng chờ duyệt (người khác) – backend quyết định.
import type { CatalogItemKind, CodeSet } from "@kb/contracts";
import { Alert, Button, Combobox, Dialog, DialogContent, DialogFooter, Field, fill, Input, Select, Stack, toast, useMessages, useUiLocale } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { useState } from "react";
import { catalogKeys, createCatalogItem } from "@/api/catalog";
import { getFormatLocale } from "@/lib/format";
import { errorText } from "@/lib/reason-codes";
import type { CatalogAccess } from "./catalog-access";
import { CATALOG_MESSAGES } from "./catalog.messages";
import { setTitle } from "./catalog-xlsx";
import { ITEM_KINDS } from "./catalog-display";
import { useUnitOptions } from "./unit-options";

export function AddItemDialog({ sets, access, onClose, onCreated }: { sets: readonly CodeSet[]; access: CatalogAccess; onClose: () => void; onCreated: (id: string) => void }) {
  const t = useMessages(CATALOG_MESSAGES);
  const locale = useUiLocale();
  const qc = useQueryClient();
  const units = useUnitOptions();
  const [kind, setKind] = useState<CatalogItemKind>("GOODS");
  const [name, setName] = useState("");
  const [hs, setHs] = useState("");
  const [unit, setUnit] = useState<string | null>(null);
  const [setId, setSetId] = useState("");
  const [code, setCode] = useState("");
  const create = useMutation({
    mutationFn: () =>
      createCatalogItem({
        kind, name, ...(hs.trim() ? { hsCode: hs } : {}), ...(unit ? { baseUnit: unit } : {}),
        ...(setId && code.trim() ? { codeSetId: setId, code } : {}),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      if (r.status === "CREATED") {
        toast({ tone: "success", title: fill(t.created, { itemNo: r.item.item.itemNo }) });
        onCreated(r.item.item.id);
      } else toast({ tone: "success", title: t.queued });
      onClose();
    },
  });
  // Người thêm không có quyền tạo thẳng vẫn gửi được (vào hàng chờ) – chỉ ẩn khi chưa biết vai trò / VIEWER.
  if (!access.canContribute) return null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.addTitle} description={t.addDescription} icon={<PackagePlus className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Stack gap="md">
            {create.isError && <Alert tone="danger">{errorText(create.error, getFormatLocale(), t.saveFailed)}</Alert>}
            <Field label={t.fieldName} required>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.fieldNamePlaceholder} autoFocus />
            </Field>
            <Field label={t.fieldKind}>
              <Select options={ITEM_KINDS.map((k) => ({ value: k, label: t[`kind${k}`] }))} value={kind} onChange={(e) => setKind(e.target.value as CatalogItemKind)} />
            </Field>
            <Field label={t.fieldHs}>
              <Input value={hs} onChange={(e) => setHs(e.target.value)} placeholder={t.fieldHsPlaceholder} inputMode="numeric" />
            </Field>
            <Field label={t.fieldBaseUnit}>
              <Combobox options={units} value={unit} onChange={setUnit} placeholder={t.fieldUnitPlaceholder} clearable />
            </Field>
            <Field label={t.fieldFirstSet}>
              <Select options={[{ value: "", label: t.fieldFirstSetNone }, ...sets.map((s) => ({ value: s.id, label: setTitle(s, locale) }))]} value={setId} onChange={(e) => setSetId(e.target.value)} />
            </Field>
            {setId && (
              <Field label={t.fieldFirstCode}>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t.fieldCodePlaceholder} />
              </Field>
            )}
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" loading={create.isPending} disabled={!name.trim()}>{t.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
