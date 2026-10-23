import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { useFieldControl, useFieldLabelId } from "./field.js";

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

// Class quyết định CHỖ ĐỨNG của control trong bố cục (bề rộng, flex, lưới) phải nằm ở khung bao ngoài;
// class về dáng ô (chiều cao, cỡ chữ, màu) nằm ở nút. Nhờ vậy `className="h-8 sm:w-48"` vẫn chạy như trước.
const LAYOUT_CLASS = /^(?:[a-z0-9-]+:)*(?:w-|min-w-|max-w-|flex-|grow|shrink|basis-|col-span-|self-|justify-self-|order-|m[trblxy]?-)/;

/**
 * Ô chọn một giá trị trong danh sách ngắn (không cần tìm kiếm – cần thì dùng Combobox).
 * Danh sách xổ ra tự vẽ (cùng dáng Combobox/menu) thay cho danh sách mặc định của trình duyệt, nhưng vẫn giữ
 * một <select> ẩn bên dưới: `value`/`onChange(e)`/`name`/`required` dùng y như thẻ select gốc, form gửi đi bình thường.
 * Bàn phím theo mẫu "select-only combobox" của WAI-ARIA: ↑↓ Home End, gõ chữ để nhảy, Enter/Space chọn, Esc đóng.
 */
export function Select({ className, options, placeholder, value, defaultValue, onChange, disabled, ref, ...props }: SelectProps) {
  const a11y = useFieldControl(props);
  const labelId = useFieldLabelId();
  const listId = useId();
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [inner, setInner] = useState(() => String(defaultValue ?? (placeholder !== undefined ? "" : (options[0]?.value ?? ""))));
  const typeahead = useRef({ text: "", at: 0 });

  const items = useMemo<SelectOption[]>(
    () => (placeholder !== undefined ? [{ value: "", label: placeholder }, ...options] : [...options]),
    [options, placeholder],
  );
  const current = value !== undefined ? String(value) : inner;
  const selectedIndex = items.findIndex((o) => o.value === current);
  const selected = items[selectedIndex];
  const showsPlaceholder = placeholder !== undefined && current === "";

  const classes = (className ?? "").split(/\s+/).filter(Boolean);
  const layout = classes.filter((c) => LAYOUT_CLASS.test(c));
  const visual = classes.filter((c) => !LAYOUT_CLASS.test(c));
  const { "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, id: _id, "aria-describedby": _d, "aria-invalid": _i, required: _r, ...rest } = props;

  const enabledFrom = (start: number, step: 1 | -1) => {
    for (let i = start; i >= 0 && i < items.length; i += step) if (!items[i]!.disabled) return i;
    return -1;
  };
  const openList = () => {
    if (disabled) return;
    setActive(selectedIndex >= 0 && !items[selectedIndex]!.disabled ? selectedIndex : enabledFrom(0, 1));
    setOpen(true);
  };
  /** Đổi giá trị qua chính <select> ẩn rồi phát sự kiện change thật → onChange(e) của nơi gọi chạy như thẻ gốc. */
  const commit = (index: number) => {
    const option = items[index];
    setOpen(false);
    if (!option || option.disabled || option.value === current) return;
    const el = nativeRef.current;
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(el, option.value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  /** Gõ chữ: nhảy tới mục bắt đầu bằng chuỗi vừa gõ (gõ liền trong 0,7s thì nối chuỗi), như select gốc. */
  const findTyped = (key: string, from: number) => {
    const now = Date.now();
    const t = typeahead.current;
    t.text = now - t.at < 700 ? t.text + key.toLowerCase() : key.toLowerCase();
    t.at = now;
    const order = [...items.keys()].map((_, k) => (from + (t.text.length > 1 ? 0 : 1) + k) % items.length);
    return order.find((i) => !items[i]!.disabled && items[i]!.label.toLowerCase().startsWith(t.text)) ?? -1;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const typed = e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      } else if (typed) {
        const i = findTyped(e.key, Math.max(selectedIndex, 0));
        if (i >= 0) commit(i);
      }
      return;
    }
    const move = (i: number) => {
      e.preventDefault();
      if (i >= 0) setActive(i);
    };
    if (e.key === "ArrowDown") move(enabledFrom(active + 1, 1));
    else if (e.key === "ArrowUp") move(e.altKey ? -1 : enabledFrom(active - 1, -1));
    else if (e.key === "Home" || e.key === "PageUp") move(enabledFrom(0, 1));
    else if (e.key === "End" || e.key === "PageDown") move(enabledFrom(items.length - 1, -1));
    else if (e.key === "Enter" || e.key === " " || (e.key === "ArrowUp" && e.altKey)) {
      e.preventDefault();
      commit(active);
    } else if (e.key === "Tab") setOpen(false);
    else if (typed) move(findTyped(e.key, Math.max(active, 0)));
  };

  // Mục đang trỏ luôn nằm trong khung cuộn.
  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${listId}-${active}`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, active, listId]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => (next ? openList() : setOpen(false))}>
      <span className={cn("relative block w-full", layout)}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            role="combobox"
            id={a11y.id}
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledby}
            aria-describedby={a11y["aria-describedby"]}
            aria-invalid={a11y["aria-invalid"]}
            aria-required={a11y.required}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
            disabled={disabled}
            onKeyDown={onKeyDown}
            // Space kích hoạt nút lúc nhả phím – chặn để không đóng lại ngay danh sách vừa mở bằng keydown.
            onKeyUp={(e) => e.key === " " && e.preventDefault()}
            data-slot="select-trigger"
            className={cn(
              control,
              "group/select flex h-10 cursor-pointer items-center pl-3 pr-9 text-left data-[state=open]:border-focus data-[state=open]:ring-3 data-[state=open]:ring-focus/25",
              visual,
            )}
          >
            <span className={cn("min-w-0 flex-1 truncate", showsPlaceholder && "text-fg-subtle")}>{selected?.label ?? ""}</span>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle motion-safe:transition-transform group-data-[state=open]/select:rotate-180"
            />
          </button>
        </PopoverPrimitive.Trigger>
        {/* Thẻ select thật, ẩn: giữ giá trị cho form + phát sự kiện change cho onChange. */}
        <select
          ref={(el) => {
            nativeRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
          }}
          aria-hidden="true"
          tabIndex={-1}
          className="sr-only"
          value={current}
          onChange={(e) => {
            if (value === undefined) setInner(e.target.value);
            onChange?.(e);
          }}
          disabled={disabled}
          required={a11y.required}
          {...rest}
        >
          {items.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          role="listbox"
          id={listId}
          align="start"
          sideOffset={6}
          collisionPadding={16}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabel ? undefined : (ariaLabelledby ?? labelId)}
          // Tiêu điểm ở lại trên nút (aria-activedescendant), không nhảy vào danh sách.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          data-slot="select-content"
          className={cn(
            "z-50 max-h-[min(20rem,var(--radix-popover-content-available-height))] min-w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)]",
            "overflow-y-auto overscroll-contain rounded-xl border border-border bg-surface p-1 text-fg shadow-lg outline-none motion-safe:animate-pop-in",
          )}
        >
          {items.map((o, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                data-active={i === active || undefined}
                onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                // Giữ tiêu điểm trên nút khi bấm chuột.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => commit(i)}
                className={cn(
                  "relative flex min-h-9 cursor-pointer select-none items-center gap-2 rounded-md py-1.5 pl-2.5 pr-8 text-sm",
                  "data-active:bg-surface-muted",
                  isSelected && "bg-primary-subtle font-medium text-primary-subtle-fg data-active:bg-primary-subtle",
                  placeholder !== undefined && i === 0 && !isSelected && "text-fg-muted",
                  o.disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="min-w-0 flex-1">{o.label}</span>
                {isSelected && <Check aria-hidden="true" className="absolute right-2.5 h-4 w-4 text-primary" />}
              </div>
            );
          })}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
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
