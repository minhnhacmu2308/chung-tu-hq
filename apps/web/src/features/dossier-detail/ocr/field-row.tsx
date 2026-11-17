"use client";
// Một trường trích xuất: nhãn + trạng thái, ô sửa trực tiếp, nút "Đúng", ghi chú khi mâu thuẫn, "AI đọc: …" khi đã sửa.
import { isHiddenOcrRow, isReadOnlyField, PAYMENT_METHODS, paymentChoiceValue, paymentNeedsChoice, reconcilePayment } from "@kb/contracts";
import { Button, cn, fill, Input, Label, Select, StatusBadge, useMessages } from "@kb/ui";
import { Check, Crosshair, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSuspect } from "@/api/ocr";
import type { ExtractedField } from "@/mocks/types";
import { FIELD_ROW_MESSAGES } from "./ocr.messages";

export type FieldRowProps = {
  field: ExtractedField;
  active: boolean;
  onActivate: (id: string | null) => void;
  onSave: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
  onRevert: (id: string) => void;
  /** Chỉ vị trí giá trị trên file gốc (chỉ khi file là PDF có lớp chữ). */
  onPick?: (id: string) => void;
  picking?: boolean;
  busy?: boolean;
  /** Mã PTTT AI chọn + số L/C của cùng hồ sơ – kiểm chéo ô Phương thức thanh toán (paymentHint). */
  paymentHint?: PaymentHint;
};
export type PaymentHint = { aiCode: string | null; lcNo: string | null };

export const fieldDomId = (id: string) => `field-${id}`;

/** Mã PTTT AI chọn và số L/C: giá trị đầu tiên có trong mọi ô của hồ sơ. */
export const paymentHint = (fields: ExtractedField[]): PaymentHint => ({
  aiCode: fields.find((f) => f.key === "payment_method_code" && f.value.trim())?.value ?? null,
  lcNo: fields.find((f) => f.key === "lc_no" && f.value.trim())?.value ?? null,
});
/** Ô Phương thức thanh toán cần chọn mã (không nhận ra, hoặc lệch mã AI / số L/C) – bắt chọn trước khi sang bước sau. */
export const isUnknownPayment = (f: ExtractedField, hint?: PaymentHint) => f.key === "payment_terms" && paymentNeedsChoice(f.value, hint?.aiCode, hint?.lcNo);
/** Dòng hiện trên màn OCR: mã PTTT AI chọn không thành dòng riêng (đã hiện qua ô mã của dòng thanh toán). */
export const ocrRows = (fields: ExtractedField[]) => fields.filter((f) => !isHiddenOcrRow(f.key));
const PAYMENT_OPTIONS = PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} – ${p.label}` }));

export function FieldRow({ field, active, onActivate, onSave, onConfirm, onRevert, onPick, picking = false, busy = false, paymentHint: hint }: FieldRowProps) {
  const t = useMessages(FIELD_ROW_MESSAGES);
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  const suspect = isSuspect(field.status);
  const edited = field.value !== field.originalValue;
  const readOnly = isReadOnlyField(field.key);
  const commit = () => {
    if (!readOnly && value.trim() !== field.value) onSave(field.id, value);
  };
  const inputId = `${fieldDomId(field.id)}-input`;
  const noteId = field.note ? `${fieldDomId(field.id)}-note` : undefined;
  const hintId = readOnly ? `${fieldDomId(field.id)}-ro` : undefined;
  const describedBy = [noteId, hintId].filter(Boolean).join(" ");
  // PTTT: chữ trên chứng từ + mã chuẩn TK_IVP (1.43 / 2.38) – khớp thì chọn sẵn, không nhận ra / lệch mã AI, số L/C thì bắt chọn.
  const payment = field.key === "payment_terms";
  const pay = payment ? reconcilePayment(field.value, hint?.aiCode ?? null, hint?.lcNo ?? null) : null;
  const payUnknown = !!pay?.suspect;
  const payCode = payment && !payUnknown ? (pay?.code ?? "") : "";
  const payHinted = payUnknown && !!(hint?.aiCode || hint?.lcNo);

  return (
    <div
      id={fieldDomId(field.id)}
      data-suspect={suspect || undefined}
      className={cn(
        "flex scroll-mt-24 flex-col gap-1.5 rounded-md border px-3 py-2.5 transition-colors",
        active ? "border-primary bg-primary-subtle" : suspect ? "border-warning bg-warning-subtle" : "border-transparent hover:bg-surface-muted",
      )}
      onMouseEnter={() => onActivate(field.id)}
      onMouseLeave={() => onActivate(null)}
      onFocus={() => onActivate(field.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId} className="text-xs text-fg-muted">
          {field.label}
        </Label>
        <StatusBadge status={field.status} />
      </div>
      <div className="flex items-center gap-2">
        <Input
          id={inputId}
          value={value}
          className="h-9 min-w-0 flex-1"
          readOnly={readOnly}
          aria-invalid={field.status === "INVALID_FORMAT" || undefined}
          {...(describedBy ? { "aria-describedby": describedBy } : {})}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setValue(field.value);
          }}
        />
        {onPick && !readOnly && (
          <Button
            size="icon"
            variant={picking ? "secondary" : "ghost"}
            className="h-9 w-9 shrink-0"
            aria-label={fill(t.pickOnFile, { label: field.label })}
            title={fill(t.pickOnFile, { label: field.label })}
            aria-pressed={picking}
            disabled={busy}
            onClick={() => onPick(field.id)}
          >
            <Crosshair className="h-4 w-4" />
          </Button>
        )}
        {suspect && (
          <Button size="sm" variant="secondary" leftIcon={<Check className="h-4 w-4" />} disabled={busy} onClick={() => onConfirm(field.id)} aria-label={fill(t.confirmField, { label: field.label })}>
            {t.correct}
          </Button>
        )}
      </div>
      {payment && (
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${inputId}-code`} className="text-xs text-fg-muted">
            {t.paymentCode}
          </Label>
          <Select
            id={`${inputId}-code`}
            options={PAYMENT_OPTIONS}
            placeholder={t.choosePayment}
            value={payCode}
            aria-invalid={payUnknown || undefined}
            required
            disabled={busy}
            onChange={(e) => e.target.value && e.target.value !== payCode && onSave(field.id, paymentChoiceValue(e.target.value, field.value))}
          />
          {payUnknown && <p className="text-sm text-danger-subtle-fg">{payHinted ? fill(t.paymentMismatch, { code: pay!.code }) : t.paymentUnknown}</p>}
        </div>
      )}
      {readOnly && (
        <p id={hintId} className="text-xs text-fg-subtle">
          {t.readOnlyHint}
        </p>
      )}
      {field.note && field.status !== "USER_CONFIRMED" && (
        <p id={noteId} className={cn("text-sm", field.status === "CONFLICT" || field.status === "INVALID_FORMAT" ? "text-danger-subtle-fg" : "text-fg-muted")}>
          {field.note}
        </p>
      )}
      {edited && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
          {t.aiRead} <span className="font-mono line-through">{field.originalValue}</span>
          <Button size="sm" variant="link" className="h-auto px-1 py-0 text-xs" leftIcon={<Undo2 className="h-3 w-3" />} onClick={() => onRevert(field.id)}>
            {t.revert}
          </Button>
        </p>
      )}
    </div>
  );
}
