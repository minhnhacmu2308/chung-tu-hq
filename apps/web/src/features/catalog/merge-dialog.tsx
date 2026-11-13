"use client";
// Gộp mặt hàng đang xem vào mặt hàng khác (Quản trị/Chủ): chọn mặt hàng giữ lại → ConfirmDialog → gộp.
// Mã, quy đổi, số lần khai chuyển sang mặt hàng giữ lại; chứng từ cũ tra theo merged_into_id (backend).
import type { CatalogItem, CatalogItemListRow } from "@kb/contracts";
import { Button, ConfirmDialog, Dialog, DialogContent, DialogFooter, Field, fill, Stack, toast, useMessages } from "@kb/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Merge } from "lucide-react";
import { useState } from "react";
import { catalogKeys, mergeCatalogItems } from "@/api/catalog";
import { toastMutationError } from "@/lib/mutation-error";
import { CATALOG_ITEM_MESSAGES } from "./catalog.messages";
import { ItemPicker } from "./item-picker";

export function MergeDialog({ item, open, onOpenChange, onMerged }: { item: CatalogItem; open: boolean; onOpenChange: (o: boolean) => void; onMerged: (intoId: string) => void }) {
  const t = useMessages(CATALOG_ITEM_MESSAGES);
  const qc = useQueryClient();
  const [target, setTarget] = useState<CatalogItemListRow | null>(null);
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setTarget(null);
    setConfirming(false);
    onOpenChange(false);
  };
  const merge = useMutation({
    mutationFn: (intoId: string) => mergeCatalogItems(item.id, intoId),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: catalogKeys.all });
      toast({ tone: "success", title: fill(t.merged, { itemNo: d.item.itemNo }) });
      close();
      onMerged(d.item.id);
    },
    onError: toastMutationError(t.mergeFailed),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !confirming && close()}>
        <DialogContent title={t.mergeTitle} description={fill(t.mergeDescription, { name: item.name })} icon={<Merge className="h-4 w-4" />} size="md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (target) setConfirming(true);
            }}
          >
            <Stack gap="md">
              <Field label={t.mergeTarget} required>
                <ItemPicker excludeId={item.id} value={target} onChange={setTarget} placeholder={t.mergeTargetPlaceholder} emptyText={t.pickNoResults} />
              </Field>
            </Stack>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={close}>{t.cancel}</Button>
              <Button type="submit" disabled={!target}>{t.mergeNext}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={open && confirming && !!target}
        onOpenChange={(o) => !o && setConfirming(false)}
        title={t.mergeConfirmTitle}
        icon={<Merge className="h-4 w-4" />}
        tone="warning"
        subject={target ? `${item.itemNo} ${item.name} → ${target.itemNo} ${target.name}` : null}
        confirmLabel={t.mergeConfirm}
        loading={merge.isPending}
        onConfirm={() => target && merge.mutate(target.id)}
      >
        {target ? fill(t.mergeConfirmBody, { from: item.itemNo, into: target.itemNo }) : null}
      </ConfirmDialog>
    </>
  );
}
