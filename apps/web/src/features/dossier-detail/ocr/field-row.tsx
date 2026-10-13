"use client";
// Một trường trích xuất: nhãn + trạng thái, ô sửa trực tiếp, nút "Đúng", ghi chú khi mâu thuẫn, "AI đọc: …" khi đã sửa.
import { Button, cn, Input, Label, StatusBadge } from "@kb/ui";
import { Check, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSuspect } from "@/api/ocr";
import type { ExtractedField } from "@/mocks/types";

export type FieldRowProps = {
  field: ExtractedField;
  active: boolean;
  onActivate: (id: string | null) => void;
  onSave: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
  onRevert: (id: string) => void;
  busy?: boolean;
};

export const fieldDomId = (id: string) => `field-${id}`;

export function FieldRow({ field, active, onActivate, onSave, onConfirm, onRevert, busy = false }: FieldRowProps) {
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  const suspect = isSuspect(field.status);
  const edited = field.value !== field.originalValue;
  const commit = () => {
    if (value.trim() !== field.value) onSave(field.id, value);
  };
  const inputId = `${fieldDomId(field.id)}-input`;
  const noteId = field.note ? `${fieldDomId(field.id)}-note` : undefined;

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
        {suspect && (
          <Button size="sm" variant="secondary" leftIcon={<Check className="h-4 w-4" />} disabled={busy} onClick={() => onConfirm(field.id)} aria-label={`Xác nhận ${field.label} đúng`}>
            Đúng
          </Button>
        )}
      </div>
      {field.note && field.status !== "USER_CONFIRMED" && (
        <p id={noteId} className={cn("text-sm", field.status === "CONFLICT" || field.status === "INVALID_FORMAT" ? "text-danger-subtle-fg" : "text-fg-muted")}>
          {field.note}
        </p>
      )}
      {edited && (
        <p className="flex flex-wrap items-center gap-1 text-xs text-fg-subtle">
          AI đọc: <span className="font-mono line-through">{field.originalValue}</span>
          <Button size="sm" variant="link" className="h-auto px-1 py-0 text-xs" leftIcon={<Undo2 className="h-3 w-3" />} onClick={() => onRevert(field.id)}>
            Hoàn tác
          </Button>
        </p>
      )}
    </div>
  );
}
