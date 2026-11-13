"use client";
// Thao tác trên một mục hàng chờ ghép (spec §4 "Duyệt"): Xác nhận (ghép vào mặt hàng gợi ý/đã chọn – mục không có gợi ý thì nút ghi rõ
// "Tạo mặt hàng mới" để người duyệt không vô tình sinh mặt hàng trùng), Chọn mặt hàng khác (ứng viên gợi ý kèm lý do + tìm phía server theo
// mọi mã), Tạo mặt hàng mới thay vì ghép, Bỏ qua. Xác nhận khóa khi ĐVT khác ĐVT gốc mà chưa nhập hệ số quy đổi.
import type { CatalogItemListRow, MatchQueueListRow, QueueTargetSummary } from "@kb/contracts";
import { Button, Dialog, DialogContent, DialogFooter, Field, fill, RadioGroup, Stack, useMessages, type RowAction } from "@kb/ui";
import { ArrowRightLeft, Check, PackagePlus, SkipForward } from "lucide-react";
import { useState } from "react";
import { formatNumber } from "@/lib/format";
import { CATALOG_QUEUE_MESSAGES } from "./catalog.messages";
import { ItemPicker } from "./item-picker";

type Messages = (typeof CATALOG_QUEUE_MESSAGES)["vi"];

/** Nhãn lý do ghép: mã đã biết (ITEM_MATCH_REASONS) → nhãn đã dịch; mã lạ → giữ nguyên. */
export const reasonLabel = (t: Messages, reason: string) => (t as Record<string, string>)[`reason${reason}`] ?? reason;

export type QueueRowState = {
  /** Mặt hàng sẽ ghép vào (đã chọn khác hoặc gợi ý); null = tạo mặt hàng mới. */
  target: QueueTargetSummary | null;
  /** Bắt buộc nhập hệ số và chưa nhập hợp lệ (hoặc chưa biết – mặt hàng chọn khác đang tải quy đổi). */
  factorBlocked: boolean;
  pending: boolean;
};

export function queueRowActions(t: Messages, s: QueueRowState, on: { confirm: () => void; choose: () => void; create: () => void; skip: () => void }): RowAction[] {
  const confirm: RowAction = s.target
    ? { id: "confirm", label: fill(t.confirmInto, { itemNo: s.target.itemNo }), icon: <Check />, disabled: s.pending || s.factorBlocked, onSelect: on.confirm }
    : { id: "confirm", label: t.confirmCreate, icon: <PackagePlus />, disabled: s.pending, onSelect: on.confirm };
  return [
    confirm,
    { id: "choose", label: t.choose, icon: <ArrowRightLeft />, disabled: s.pending, onSelect: on.choose },
    ...(s.target ? [{ id: "create", label: t.createNew, icon: <PackagePlus />, quick: false, disabled: s.pending, onSelect: on.create }] : []),
    { id: "skip", label: t.skip, icon: <SkipForward />, quick: false, disabled: s.pending, onSelect: on.skip },
  ];
}

/**
 * Chọn mặt hàng khác cho một mục: ứng viên gợi ý (≤ 5, kèm lý do, điểm) ở trên, tìm tự do bên dưới. Chỉ ghi nhận lựa chọn trên dòng;
 * người duyệt bấm Xác nhận sau (kèm hệ số nếu cần).
 */
export function ChooseItemDialog({ row, onPick, onClose }: { row: MatchQueueListRow; onPick: (item: QueueTargetSummary) => void; onClose: () => void }) {
  const t = useMessages(CATALOG_QUEUE_MESSAGES);
  const [target, setTarget] = useState<QueueTargetSummary | null>(null);
  const [picked, setPicked] = useState<CatalogItemListRow | null>(null);
  const candidates = row.candidateItems;
  const fromCandidates = target ? candidates.some((c) => c.id === target.id) : false;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t.chooseTitle} description={fill(t.chooseDescription, { code: row.code || row.name })} icon={<ArrowRightLeft className="h-4 w-4" />} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (target) {
              onPick(target);
              onClose();
            }
          }}
        >
          <Stack gap="md">
            {candidates.length > 0 && (
              <RadioGroup
                label={t.candidates}
                options={candidates.map((c) => ({
                  value: c.id,
                  label: fill(t.candidateLabel, { itemNo: c.itemNo, name: c.name }),
                  description: fill(t.candidateHint, { reason: reasonLabel(t, c.reason), score: formatNumber(c.score, 2) }),
                }))}
                value={fromCandidates ? target!.id : null}
                onChange={(id) => setTarget(candidates.find((c) => c.id === id) ?? null)}
              />
            )}
            <Field label={candidates.length > 0 ? t.searchOther : t.chooseTarget}>
              <ItemPicker
                value={fromCandidates ? null : picked}
                onChange={(r) => {
                  setPicked(r);
                  setTarget(r ? { id: r.id, itemNo: r.itemNo, name: r.name, hsCode: r.hsCode, baseUnit: r.baseUnit } : null);
                }}
                placeholder={t.choosePlaceholder}
                emptyText={t.pickNoResults}
              />
            </Field>
          </Stack>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>{t.cancel}</Button>
            <Button type="submit" disabled={!target}>{t.chooseConfirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
