import { ChevronDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useFieldControl } from "./field.js";

const control = [
  "w-full rounded-md border border-border bg-surface text-fg text-sm",
  "placeholder:text-fg-subtle",
  "hover:border-border-strong",
  // Focus: viền đổi sang màu focus (đủ tương phản) + quầng mờ 3px cho dịu mắt.
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/25 focus-visible:border-focus",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border",
  "aria-invalid:border-danger aria-invalid:hover:border-danger aria-invalid:focus-visible:border-danger aria-invalid:focus-visible:ring-danger/25",
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
    // Mũi tên tự vẽ thay cho mũi tên mặc định của trình duyệt (mỗi hệ điều hành một kiểu).
    <span className="relative block w-full">
      <select className={cn(control, "h-10 cursor-pointer appearance-none truncate pl-3 pr-9", className)} {...props} {...a11y}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
    </span>
  );
}

export type CheckboxProps = Omit<ComponentProps<"input">, "type"> & { label: ReactNode };

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  const a11y = useFieldControl({ ...props, id });
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2 text-sm text-fg", className)}>
      <input
        type="checkbox"
        className="kb-checkbox"
        {...props}
        {...a11y}
      />
      {label}
    </label>
  );
}
