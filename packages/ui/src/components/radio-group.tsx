// Nhóm radio (mặc định dọc; orientation="horizontal" cho lựa chọn ngắn xếp một hàng): mỗi lựa chọn có nhãn (+ mô tả). Dựa trên fieldset + input radio gốc → phím mũi tên, trình đọc màn hình tự đúng.
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { FRAME_CLASS, FRAME_LEGEND_CLASS, FrameLegend } from "./field.js";

export type RadioOption<T extends string> = { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean };

export type RadioGroupProps<T extends string> = {
  label: ReactNode;
  description?: ReactNode;
  options: readonly RadioOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Ẩn nhãn nhóm (vẫn đọc được bằng trình đọc màn hình). */
  hideLabel?: boolean;
  /** "horizontal": lựa chọn ngắn xếp một hàng (tự xuống dòng khi hẹp). Mặc định "vertical". */
  orientation?: "vertical" | "horizontal";
  /** Khung viền, tên nhóm nằm trên đường viền – như FieldFrame (form dày ô). */
  framed?: boolean;
  /** Với `framed`: nút đặt trên đường viền sau tên nhóm (vd ⓘ hướng dẫn). */
  legendAction?: ReactNode;
  className?: string;
};

export function RadioGroup<T extends string>({ label, description, options, value, onChange, disabled, hideLabel, orientation = "vertical", framed = false, legendAction, className }: RadioGroupProps<T>) {
  const name = useId();
  const descId = `${name}-desc`;
  return (
    <fieldset role="radiogroup" aria-orientation={orientation} aria-labelledby={legendAction ? `${name}-name` : undefined} aria-describedby={description ? descId : undefined} disabled={disabled} data-frame={framed ? "" : undefined} className={cn("min-w-0", framed && FRAME_CLASS, className)}>
      <legend className={cn(framed ? FRAME_LEGEND_CLASS : "text-sm font-medium text-fg", hideLabel && "sr-only")}>
        <FrameLegend nameId={`${name}-name`} legend={label} action={legendAction} />
      </legend>
      {description && <p id={descId} className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      <div className={cn(framed ? "mt-1 flex gap-1" : "mt-2 flex gap-1", orientation === "horizontal" ? "flex-row flex-wrap" : "flex-col")}>
        {options.map((o, i) => {
          // id theo vị trí: giá trị có thể là nhãn có khoảng trắng/dấu – không dùng được trong aria-describedby.
          const id = `${name}-${i}`;
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-sm text-fg hover:bg-surface-muted",
                "has-[:checked]:border-primary/40 has-[:checked]:bg-primary-subtle has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50",
              )}
            >
              <input
                id={id}
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                disabled={o.disabled}
                onChange={() => onChange(o.value)}
                aria-describedby={o.description ? `${id}-desc` : undefined}
                className="kb-radio mt-0.5"
              />
              <span className="min-w-0">
                <span className="block">{o.label}</span>
                {o.description && <span id={`${id}-desc`} className="block text-xs text-fg-muted">{o.description}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
