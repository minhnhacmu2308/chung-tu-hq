import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useFieldControl } from "./field.js";

const control = [
  "w-full rounded-md border border-border bg-surface text-fg text-sm",
  "placeholder:text-fg-subtle",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-focus",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-danger aria-invalid:focus-visible:ring-danger",
].join(" ");

export function Input({ className, ...props }: ComponentProps<"input">) {
  const a11y = useFieldControl(props);
  return <input className={cn(control, "h-10 px-3", className)} {...props} {...a11y} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  const a11y = useFieldControl(props);
  return <textarea rows={rows} className={cn(control, "px-3 py-2", className)} {...props} {...a11y} />;
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<ComponentProps<"select">, "children"> & {
  options: readonly SelectOption[];
  /** Dòng gợi ý đầu tiên (giá trị rỗng). */
  placeholder?: string;
};

export function Select({ className, options, placeholder, ...props }: SelectProps) {
  const a11y = useFieldControl(props);
  return (
    <select className={cn(control, "h-10 px-3 pr-8", className)} {...props} {...a11y}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export type CheckboxProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode };

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const a11y = useFieldControl({ ...props, id });
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-fg", className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded-sm border-border accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        {...props}
        {...a11y}
      />
      {label}
    </label>
  );
}
