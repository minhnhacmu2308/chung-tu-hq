"use client";
// Một trường trích xuất: nhãn + trạng thái, ô sửa trực tiếp, nút "Đúng", ghi chú khi mâu thuẫn, "AI đọc: …" khi đã sửa.
import { PAYMENT_METHODS, paymentChoiceValue, paymentNeedsChoice, resolvePayment } from "@kb/contracts";
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
};

export const fieldDomId = (id: string) => `field-${id}`;

/** Ô Phương thức thanh toán chưa ra mã chuẩn (chữ trên chứng từ không nhận ra) – bắt chọn mã trước khi sang bước sau. */
export const isUnknownPayment = (f: ExtractedField) => f.key === "payment_terms" && paymentNeedsChoice(f.value);
const PAYMENT_OPTIONS = PAYMENT_METHODS.map((p) => ({ value: p.code, label: `${p.code} – ${p.label}` }));

export function FieldRow({ field, active, onActivate, onSave, onConfirm, onRevert, onPick, picking = false, busy = false }: FieldRowProps) {
  const t = useMessages(FIELD_ROW_MESSAGES);
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  const suspect = isSuspect(field.status);
  const edited = field.value !== field.originalValue;
  const commit = () => {
    if (value.trim() !== field.value) onSave(field.id, value);
  };
  const inputId = `${fieldDomId(field.id)}-input`;
  const noteId = field.note ? `${fieldDomId(field.id)}-note` : undefined;
  // PTTT: chữ trên chứng từ + mã chuẩn TK_IVP (1.43 / 2.38) – nhận ra thì chọn sẵn, không nhận ra thì bắt chọn.
  const payment = field.key === "payment_terms";
  const payUnknown = payment && paymentNeedsChoice(field.value);
  const payCode = payment && !payUnknown ? (resolvePayment(field.value)?.code ?? "") : "";

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
          aria-invalid={field.status === "INVALID_FORMAT" || undefined}
          {...(noteId ? { "aria-describedby": noteId } : {})}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setValue(field.value);
          }}
        />
        {onPick && (
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
          {payUnknown && <p className="text-sm text-danger-subtle-fg">{t.paymentUnknown}</p>}
        </div>
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
