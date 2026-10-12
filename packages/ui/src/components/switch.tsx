import * as SwitchPrimitive from "@radix-ui/react-switch";
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useFieldControl } from "./field.js";

export type SwitchProps = {
  /** Nhãn bên cạnh. Bỏ trống khi Switch nằm trong Field (Field đã gắn nhãn). */
  label?: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
};

export function Switch({
  label,
  description,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  id,
  name,
  "aria-label": ariaLabel,
  className,
}: SwitchProps) {
  const ownId = useId();
  const descId = useId();
  const field = useFieldControl({ id });
  const controlId = field.id ?? ownId;
  const describedBy = [field["aria-describedby"], description ? descId : undefined].filter(Boolean).join(" ") || undefined;

  const control = (
    <SwitchPrimitive.Root
      id={controlId}
      name={name}
      {...(checked !== undefined ? { checked } : {})}
      {...(defaultChecked !== undefined ? { defaultChecked } : {})}
      {...(onCheckedChange ? { onCheckedChange } : {})}
      disabled={disabled}
      aria-label={label ? undefined : ariaLabel}
      aria-describedby={describedBy}
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
        "bg-border-strong data-[state=checked]:bg-primary",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-50",
      )}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-surface shadow-sm transition-transform data-[state=checked]:translate-x-4 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );

  if (!label && !description) return <span className={className}>{control}</span>;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span className="pt-0.5">{control}</span>
      <span className="flex flex-col gap-0.5">
        {label && (
          <label htmlFor={controlId} className="cursor-pointer text-sm font-medium text-fg peer-disabled:cursor-not-allowed">
            {label}
          </label>
        )}
        {description && (
          <span id={descId} className="text-xs text-fg-subtle">
            {description}
          </span>
        )}
      </span>
    </div>
  );
}
