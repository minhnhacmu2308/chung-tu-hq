import { createContext, useContext, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "../lib/cn.js";

interface FieldContextValue {
  id: string;
  labelId: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Control (Input/Select/Textarea/Checkbox) đọc id, aria-* từ Field bao quanh. */
export function useFieldControl(props: {
  id?: string | undefined;
  "aria-describedby"?: string | undefined;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling" | undefined;
  required?: boolean | undefined;
}) {
  const ctx = useContext(FieldContext);
  const invalid = ctx?.invalid || props["aria-invalid"] === true || props["aria-invalid"] === "true";
  return {
    id: props.id ?? ctx?.id,
    "aria-describedby": [ctx?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined,
    "aria-invalid": invalid || undefined,
    required: ctx?.required || props.required || undefined,
  };
}

/** id của nhãn Field – cho control có nhiều ô (vd DateRangePicker) tự ghép tên truy cập bằng aria-labelledby. */
export function useFieldLabelId(): string | undefined {
  return useContext(FieldContext)?.labelId;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export type FieldProps = {
  label: ReactNode;
  /** Gợi ý dưới ô nhập. */
  hint?: ReactNode;
  /** Thông báo lỗi. Có lỗi → control được đánh dấu aria-invalid. */
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
};

/** Bọc 1 control: gắn nhãn, gợi ý, lỗi đúng chuẩn a11y. Luôn dùng Field cho ô nhập trong form. */
export function Field({ label, hint, error, required = false, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const value: FieldContextValue = {
    id,
    labelId: `${id}-label`,
    describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
    invalid: Boolean(error),
    required,
  };
  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <Label htmlFor={id} id={`${id}-label`}>
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {children}
        {hint && (
          <p id={hintId} className="text-xs text-fg-subtle">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-danger-subtle-fg" role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
