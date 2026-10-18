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
  /** horizontal: nhãn bên trái (2/5), ô bên phải (3/5) khi vùng nội dung từ mốc md – form dày ô (tờ khai). Hẹp hơn vẫn xếp dọc. */
  orientation?: "vertical" | "horizontal";
  className?: string;
  children: ReactNode;
};

/** Bọc 1 control: gắn nhãn, gợi ý, lỗi đúng chuẩn a11y. Luôn dùng Field cho ô nhập trong form. */
export function Field({ label, hint, error, required = false, orientation = "vertical", className, children }: FieldProps) {
  const horizontal = orientation === "horizontal";
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
      <div data-orientation={orientation} className={cn("flex flex-col gap-1.5", horizontal && "cq-md:grid cq-md:grid-cols-5 cq-md:gap-x-3 cq-md:gap-y-1", className)}>
        <Label htmlFor={id} id={`${id}-label`} className={cn(horizontal && "cq-md:col-span-2 cq-md:pt-2.5")}>
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {horizontal ? <div className="min-w-0 cq-md:col-span-3">{children}</div> : children}
        {hint && (
          <p id={hintId} className={cn("text-xs text-fg-subtle", horizontal && "cq-md:col-span-3 cq-md:col-start-3")}>
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className={cn("text-sm text-danger-subtle-fg", horizontal && "cq-md:col-span-3 cq-md:col-start-3")} role="alert">
            {error}
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}
