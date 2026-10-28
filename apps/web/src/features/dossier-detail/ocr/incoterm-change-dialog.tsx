"use client";
// Báo trước khi đổi ô Điều kiện giao hàng của hóa đơn (bước OCR): cước sẽ cộng / không cộng / trừ thế nào, và nếu điều kiện mới mâu thuẫn
// người trả cước trên vận đơn (CIF mà Freight Collect) thì bắt chọn lý do – lý do lưu vào chi phí (freightTermNote, luật R-FREIGHT-TERM).
import { freightTermFit, FreightTermReasonSchema, incotermIncludesFreight, incotermOf, type FreightTermNote, type FreightTermReason } from "@kb/contracts";
import { Alert, Button, Dialog, DialogContent, DialogFooter, Field, fill, Input, RadioGroup, Stack, useMessages } from "@kb/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { ocrKeys } from "@/api/ocr";
import { getValueCharges, saveValueCharges, valueChargesKeys } from "@/api/value-charges";
import { formatVnd } from "@/lib/format";
import { toastMutationError } from "@/lib/mutation-error";
import { freightTermReasonLabel } from "./value-charges-form";
import { VALUE_CHARGES_MESSAGES } from "./value-charges.messages";
import { INCOTERM_CHANGE_MESSAGES } from "./incoterm-change.messages";

type Props = {
  dossierId: string;
  /** Giá trị đang có và giá trị mới của ô (null = đóng). */
  change: { from: string; to: string } | null;
  saving: boolean;
  onConfirm: (note: FreightTermNote | null) => void;
  onCancel: () => void;
};

/** Lưu lý do giữ điều kiện giao hàng vào chi phí (giữ nguyên các phần khác) – luật R-FREIGHT-TERM chuyển từ chặn sang cảnh báo. */
export function useSaveFreightTermNote(dossierId: string) {
  const qc = useQueryClient();
  const t = useMessages(INCOTERM_CHANGE_MESSAGES);
  return useMutation({
    mutationFn: async (note: FreightTermNote) => {
      const v = await getValueCharges(dossierId);
      return saveValueCharges(dossierId, { ...v.charges, freightTermNote: note });
    },
    onSuccess: (v) => {
      qc.setQueryData(valueChargesKeys.detail(dossierId), v);
      void qc.invalidateQueries({ queryKey: ocrKeys.checks(dossierId) });
    },
    onError: toastMutationError(t.noteSaveFailed),
  });
}

/** Đổi sang mã khác hẳn (FCA → CIF) mới cần hỏi; chỉ sửa địa điểm ("FCA BUSAN" → "FCA CHANGWON") thì lưu luôn. */
export const incotermCodeChanged = (from: string, to: string) => incotermOf(to) !== "" && incotermOf(from) !== incotermOf(to);

export function IncotermChangeDialog({ dossierId, change, saving, onConfirm, onCancel }: Props) {
  const t = useMessages(INCOTERM_CHANGE_MESSAGES);
  const tc = useMessages(VALUE_CHARGES_MESSAGES);
  const q = useQuery({ queryKey: valueChargesKeys.detail(dossierId), queryFn: () => getValueCharges(dossierId), enabled: change !== null });
  const [reason, setReason] = useState<FreightTermReason | null>(null);
  const [note, setNote] = useState("");
  // Mở cho lần đổi khác → bỏ lý do đã chọn lần trước.
  const [seen, setSeen] = useState(change);
  if (seen !== change) {
    setSeen(change);
    setReason(null);
    setNote("");
  }
  const from = incotermOf(change?.from);
  const to = incotermOf(change?.to);
  const v = q.data;
  const docFreight = v?.fromDocuments.freight ?? null;
  const toIncl = incotermIncludesFreight(to);
  const vnd = v?.freightVnd ? formatVnd(v.freightVnd) : null;
  const p = { to, amount: docFreight?.amount ?? "", currency: docFreight?.currency ?? "", vnd: vnd ?? "" };
  const impact = incotermIncludesFreight(from) === toIncl ? t.sameFreight
    : v?.direction === "XK" ? fill(toIncl ? t.xkToIncluded : t.xkToExcluded, p)
    // Có tỷ giá → nói rõ trị giá đổi bao nhiêu VND (cước × tỷ giá tính thuế, backend tính); chưa có tỷ giá → "tương ứng".
    : fill(toIncl ? (docFreight ? (vnd ? t.nkToIncludedDocsVnd : t.nkToIncludedDocs) : t.nkToIncluded) : docFreight ? (vnd ? t.nkToExcludedDocsVnd : t.nkToExcludedDocs) : t.nkToExcluded, p);
  const fit = v ? freightTermFit(to, v.freightTerm) : "UNKNOWN";
  const noteMissing = reason === "OTHER" && !note.trim();
  const ready = fit !== "CONFLICT" || (reason !== null && !noteMissing);

  return (
    <Dialog open={change !== null} onOpenChange={(o) => !o && !saving && onCancel()}>
      <DialogContent
        title={t.title}
        // Mã cũ → mã mới ở dòng mô tả (tiêu đề một dòng bị cắt trên màn hẹp).
        description={fill(t.change, { from: from || (change?.from ?? ""), to })}
        icon={<ArrowRightLeft className="h-4 w-4" />}
      >
        <Stack gap="md">
          <p className="text-sm text-fg">{impact}</p>
          <p className="text-sm text-fg-muted">{t.mustMatch}</p>
          {fit === "CHECK" && <Alert tone="warning" title={t.checkTitle}>{fill(t.checkBody, { to })}</Alert>}
          {fit === "CONFLICT" && (
            <Stack gap="sm">
              <Alert tone="danger" title={t.conflictTitle}>{fill(t.conflictBody, { to })}</Alert>
              <RadioGroup<FreightTermReason>
                label={t.reason}
                value={reason}
                onChange={setReason}
                options={FreightTermReasonSchema.options.map((r) => ({ value: r, label: freightTermReasonLabel(tc, r) }))}
              />
              {reason && (
                <Field label={t.note} required={reason === "OTHER"} {...(noteMissing ? { error: t.noteRequired } : {})}>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={t.notePlaceholder} />
                </Field>
              )}
            </Stack>
          )}
        </Stack>
        <DialogFooter>
          <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>{t.cancel}</Button>
          <Button
            type="button"
            leftIcon={<ArrowRightLeft className="h-4 w-4" />}
            loading={saving}
            disabled={!ready || q.isLoading}
            onClick={() => onConfirm(fit === "CONFLICT" && reason ? { reason, note: note.trim() } : null)}
          >
            {t.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
