import { useId, type CSSProperties, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";

const MESSAGES = { vi: { custom: "Màu khác" }, en: { custom: "Custom color" }, zh: { custom: "自定义颜色" } } satisfies Messages<"custom">;

/* ---------------- SegmentedControl ---------------- */
// Nhóm radio gốc của trình duyệt (bàn phím mũi tên, trình đọc màn hình hoạt động sẵn), chỉ đổi giao diện.

export type SegmentOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode };

export type SegmentedControlProps<T extends string> = {
  label: ReactNode;
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentOption<T>[];
  disabled?: boolean;
  /** Hiện nhãn bên trái (mặc định) hoặc ẩn khỏi màn hình nhưng vẫn đọc được. */
  hideLabel?: boolean;
  className?: string;
};

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  disabled = false,
  hideLabel = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <fieldset disabled={disabled} className={cn("flex items-center justify-between gap-3 disabled:opacity-60", className)}>
      <legend className={cn("float-left text-sm text-fg", hideLabel && "sr-only")}>{label}</legend>
      <div className="inline-flex rounded-md border border-border bg-surface-muted p-0.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 text-sm text-fg-muted",
              "has-[:checked]:bg-surface has-[:checked]:font-medium has-[:checked]:text-fg has-[:checked]:shadow-sm",
              "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
              "has-[:disabled]:cursor-not-allowed",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.icon && <span aria-hidden="true">{o.icon}</span>}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ---------------- ColorSwatchPicker ---------------- */

export type Swatch = { id: string; label: string; hex: string };

export type ColorSwatchPickerProps = {
  label: ReactNode;
  value: string;
  onChange: (hex: string) => void;
  swatches: readonly Swatch[];
  /** Cho nhập mã màu tự do (chỉ nên bật cho admin). */
  allowCustom?: boolean;
  customLabel?: string;
  disabled?: boolean;
  className?: string;
};

export function ColorSwatchPicker({
  label,
  value,
  onChange,
  swatches,
  allowCustom = false,
  customLabel,
  disabled = false,
  className,
}: ColorSwatchPickerProps) {
  const name = useId();
  const t = useMessages(MESSAGES, customLabel ? { custom: customLabel } : undefined);
  const current = value.toUpperCase();
  return (
    <fieldset disabled={disabled} className={cn("flex flex-col gap-2 disabled:opacity-60", className)}>
      <legend className="mb-2 text-sm text-fg">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {swatches.map((s) => (
          <label
            key={s.id}
            title={s.label}
            // Màu lấy từ dữ liệu (thương hiệu khách) nên truyền qua biến CSS cục bộ, không hard-code.
            style={{ "--swatch": s.hex } as CSSProperties}
            className={cn(
              "relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[var(--swatch)]",
              "ring-offset-2 ring-offset-surface has-[:checked]:ring-2 has-[:checked]:ring-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus",
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name}
              value={s.hex}
              aria-label={s.label}
              checked={current === s.hex.toUpperCase()}
              onChange={() => onChange(s.hex)}
            />
          </label>
        ))}
        {allowCustom && (
          <label className="inline-flex items-center gap-2 text-sm text-fg-muted">
            <input
              type="color"
              aria-label={t.custom}
              value={current.toLowerCase()}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="h-8 w-10 cursor-pointer rounded-sm border border-border bg-surface"
            />
            {t.custom}
          </label>
        )}
      </div>
    </fieldset>
  );
}
