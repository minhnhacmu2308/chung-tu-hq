// DatePicker / DateRangePicker. Giá trị là chuỗi ISO "YYYY-MM-DD" (ngày nghiệp vụ) – không bao giờ dùng toISOString
// để tránh lệch múi giờ. Hiển thị dd/MM/yyyy (vi) hoặc MM/dd/yyyy (en).
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { format, isValid, parse } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useId, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { DayPicker, type ClassNames, type ChevronProps, type DateRange } from "react-day-picker";
import { enUS, vi } from "react-day-picker/locale";
import { cn } from "../lib/cn.js";
import { useMessages, useUiLocale, type Messages, type UiLocale } from "../lib/i18n.js";
import { useFieldControl, useFieldLabelId } from "./field.js";

const MESSAGES = {
  vi: {
    placeholder: "dd/mm/yyyy",
    rangePlaceholder: "Chọn khoảng ngày",
    openCalendar: "Mở lịch",
    clear: "Xóa ngày",
    invalid: "Ngày không hợp lệ (dd/mm/yyyy)",
    outOfRange: "Ngày nằm ngoài khoảng cho phép",
    from: "Từ ngày",
    to: "Đến ngày",
    order: "Từ ngày phải trước hoặc bằng Đến ngày",
  },
  en: {
    placeholder: "mm/dd/yyyy",
    rangePlaceholder: "Pick a date range",
    openCalendar: "Open calendar",
    clear: "Clear date",
    invalid: "Invalid date (mm/dd/yyyy)",
    outOfRange: "Date is outside the allowed range",
    from: "From",
    to: "To",
    order: "Start date must be on or before end date",
  },
} satisfies Messages<"placeholder" | "rangePlaceholder" | "openCalendar" | "clear" | "invalid" | "outOfRange" | "from" | "to" | "order">;

const FORMAT: Record<UiLocale, { display: string; parse: string }> = {
  vi: { display: "dd/MM/yyyy", parse: "d/M/yyyy" },
  en: { display: "MM/dd/yyyy", parse: "M/d/yyyy" },
};
const DAY_LOCALE = { vi, en: enUS } as const;

/* ---------------- Chuyển đổi ISO ↔ Date (giờ địa phương, 00:00) ---------------- */

export function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Từ chối ngày "tràn" như 2024-02-31
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : undefined;
}

export function dateToIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Định dạng ISO để hiển thị theo ngôn ngữ giao diện. */
export function formatIsoDate(iso: string | null | undefined, locale: UiLocale): string {
  const d = isoToDate(iso);
  return d ? format(d, FORMAT[locale].display) : "";
}

/** Đọc ngày người dùng gõ theo định dạng của ngôn ngữ (chấp nhận / . - làm dấu phân cách). Trả ISO hoặc null. */
export function parseTypedDate(text: string, locale: UiLocale): string | null {
  const t = text.trim().replace(/[.\-\s]+/g, "/");
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return null;
  const d = parse(t, FORMAT[locale].parse, new Date(2000, 0, 1));
  return isValid(d) ? dateToIso(d) : null;
}

/* ---------------- Lịch (style bằng token) ---------------- */

const CALENDAR_CLASSES: Partial<ClassNames> = {
  root: "p-3 text-sm text-fg",
  months: "relative flex flex-col gap-4 sm:flex-row",
  month: "flex flex-col gap-2",
  month_caption: "flex h-8 items-center justify-center",
  caption_label: "text-sm font-medium text-fg",
  nav: "absolute inset-x-0 top-0 z-10 flex items-center justify-between",
  button_previous:
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40",
  button_next:
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-40",
  month_grid: "w-full border-collapse",
  weekdays: "",
  weekday: "h-8 w-9 text-center text-xs font-normal text-fg-subtle",
  week: "",
  day: "h-9 w-9 p-0 text-center",
  day_button:
    "inline-flex h-9 w-9 items-center justify-center rounded-md text-sm text-fg hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
  today: "[&>button]:font-semibold [&>button]:text-primary",
  selected: "[&>button]:bg-primary [&>button]:text-primary-fg [&>button]:hover:bg-primary-hover",
  outside: "[&>button]:text-fg-subtle",
  disabled: "[&>button]:pointer-events-none [&>button]:opacity-40",
  hidden: "invisible",
  range_start: "[&>button]:bg-primary [&>button]:text-primary-fg",
  range_end: "[&>button]:bg-primary [&>button]:text-primary-fg",
  range_middle: "[&>button]:rounded-none [&>button]:bg-primary-subtle [&>button]:text-primary-subtle-fg",
};

function CalendarChevron({ orientation, className }: ChevronProps) {
  const Icon = orientation === "right" ? ChevronRight : ChevronLeft;
  return <Icon aria-hidden="true" className={cn("h-4 w-4", className)} />;
}

function bounds(min?: string, max?: string) {
  const minD = isoToDate(min);
  const maxD = isoToDate(max);
  const disabled = [...(minD ? [{ before: minD }] : []), ...(maxD ? [{ after: maxD }] : [])];
  return { minD, maxD, disabled };
}

const shell = cn(
  "flex h-10 w-full items-center gap-1 rounded-md border border-border bg-surface pl-3 pr-1 text-sm text-fg",
  "focus-within:border-focus focus-within:ring-2 focus-within:ring-focus",
  "has-[[aria-invalid=true]]:border-danger",
);
const iconBtn =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed";
const popover = "z-50 rounded-lg border border-border bg-surface shadow-lg motion-safe:animate-pop-in";

type CommonProps = {
  /** Ngày nhỏ nhất cho phép, ISO. */
  min?: string;
  /** Ngày lớn nhất cho phép, ISO. */
  max?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
  name?: string;
};

/* ---------------- DatePicker ---------------- */

export type DatePickerProps = CommonProps & {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
};

export function DatePicker({
  value,
  onChange,
  min,
  max,
  clearable = true,
  disabled = false,
  placeholder,
  className,
  labels,
  name,
  ...rest
}: DatePickerProps) {
  const locale = useUiLocale();
  const t = useMessages(MESSAGES, labels);
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => formatIsoDate(value, locale));
  const [error, setError] = useState<string | null>(null);
  const { minD, maxD, disabled: disabledDays } = bounds(min, max);

  // Đồng bộ ô nhập khi giá trị/ngôn ngữ đổi từ ngoài.
  useEffect(() => {
    setDraft(formatIsoDate(value, locale));
    setError(null);
  }, [value, locale]);

  const a11y = useFieldControl({
    ...rest,
    "aria-describedby": [rest["aria-describedby"], error ? errorId : undefined].filter(Boolean).join(" ") || undefined,
    "aria-invalid": rest["aria-invalid"] || !!error,
  });

  const commitDraft = () => {
    if (!draft.trim()) {
      setError(null);
      if (value !== null) onChange(null);
      return;
    }
    const iso = parseTypedDate(draft, locale);
    if (!iso) return setError(t.invalid);
    const d = isoToDate(iso)!;
    if ((minD && d < minD) || (maxD && d > maxD)) return setError(t.outOfRange);
    setError(null);
    if (iso !== value) onChange(iso);
    else setDraft(formatIsoDate(iso, locale));
  };

  const selected = isoToDate(value);

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div className={cn(shell, disabled && "cursor-not-allowed opacity-50")}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              name={name}
              disabled={disabled}
              value={draft}
              placeholder={placeholder ?? t.placeholder}
              aria-label={rest["aria-label"]}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraft();
                } else if (e.key === "ArrowDown" && e.altKey) {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed"
              {...a11y}
            />
            {clearable && value && !disabled && (
              <button type="button" aria-label={t.clear} className={iconBtn} onClick={() => onChange(null)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <PopoverPrimitive.Trigger asChild disabled={disabled}>
              <button type="button" aria-label={t.openCalendar} aria-haspopup="dialog" aria-expanded={open} className={iconBtn}>
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
              </button>
            </PopoverPrimitive.Trigger>
          </div>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="start" sideOffset={4} className={popover} aria-label={t.openCalendar}>
            <DayPicker
              mode="single"
              selected={selected}
              onSelect={(d) => {
                onChange(d ? dateToIso(d) : null);
                setOpen(false);
              }}
              defaultMonth={selected ?? minD ?? new Date()}
              {...(minD ? { startMonth: minD } : {})}
              {...(maxD ? { endMonth: maxD } : {})}
              disabled={disabledDays}
              locale={DAY_LOCALE[locale]}
              weekStartsOn={locale === "vi" ? 1 : 0}
              autoFocus
              classNames={CALENDAR_CLASSES}
              components={{ Chevron: CalendarChevron }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger-subtle-fg">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------- DateRangePicker ---------------- */

export type IsoDateRange = { from: string | null; to: string | null };

export type DateRangePickerProps = CommonProps & {
  value: IsoDateRange;
  onChange: (value: IsoDateRange) => void;
  /** Gợi ý định dạng trong 2 ô nhập (mặc định dd/mm/yyyy hoặc mm/dd/yyyy theo ngôn ngữ). */
  placeholder?: string;
  /** Số tháng hiển thị cạnh nhau (mặc định 2). */
  numberOfMonths?: number;
};

type RangeEnd = "from" | "to";

/**
 * Hai ô nhập "Từ ngày" / "Đến ngày" (gõ tay theo định dạng ngôn ngữ) + nút mở lịch chọn khoảng.
 * Ô "Từ ngày" nhận nhãn của Field; mỗi ô có tên riêng, lỗi gắn vào đúng ô qua aria-describedby.
 */
export function DateRangePicker({
  value,
  onChange,
  min,
  max,
  clearable = true,
  disabled = false,
  placeholder,
  numberOfMonths = 2,
  className,
  labels,
  name,
  ...rest
}: DateRangePickerProps) {
  const locale = useUiLocale();
  const t = useMessages(MESSAGES, labels);
  const baseId = useId();
  const [open, setOpen] = useState(false);
  // Đã bấm ngày đầu trong lần mở lịch này → cú bấm sau là ngày cuối (kể cả cùng ngày = khoảng 1 ngày).
  const [pickingEnd, setPickingEnd] = useState(false);
  const [drafts, setDrafts] = useState<Record<RangeEnd, string>>(() => ({
    from: formatIsoDate(value.from, locale),
    to: formatIsoDate(value.to, locale),
  }));
  const [error, setError] = useState<{ end: RangeEnd; message: string } | null>(null);
  const { minD, maxD, disabled: disabledDays } = bounds(min, max);
  const field = useFieldControl(rest);
  const fieldLabelId = useFieldLabelId();
  const fromInputId = field.id ?? `${baseId}-from`;
  const from = isoToDate(value.from);
  const to = isoToDate(value.to);
  const hasValue = !!(value.from || value.to);

  // Đồng bộ 2 ô nhập khi giá trị (từ lịch hoặc từ ngoài) / ngôn ngữ đổi.
  useEffect(() => {
    setDrafts({ from: formatIsoDate(value.from, locale), to: formatIsoDate(value.to, locale) });
    setError(null);
  }, [value.from, value.to, locale]);

  const commit = (end: RangeEnd) => {
    const text = drafts[end];
    let iso: string | null = null;
    if (text.trim()) {
      iso = parseTypedDate(text, locale);
      if (!iso) return setError({ end, message: t.invalid });
      const d = isoToDate(iso)!;
      if ((minD && d < minD) || (maxD && d > maxD)) return setError({ end, message: t.outOfRange });
    }
    const next = { ...value, [end]: iso };
    // ISO "YYYY-MM-DD" so sánh chuỗi đúng thứ tự ngày.
    if (next.from && next.to && next.from > next.to) return setError({ end, message: t.order });
    setError(null);
    if (next.from !== value.from || next.to !== value.to) onChange(next);
    else setDrafts((s) => ({ ...s, [end]: formatIsoDate(iso, locale) }));
  };

  const changeOpen = (o: boolean) => {
    setOpen(o);
    // Mở lịch khi đã có "Từ ngày" nhưng chưa có "Đến ngày" → cú bấm đầu chọn ngày cuối.
    if (o) setPickingEnd(!!value.from && !value.to);
  };

  const pick = (day: Date) => {
    const iso = dateToIso(day);
    if (!pickingEnd || !value.from) {
      setPickingEnd(true);
      onChange({ from: iso, to: null });
      return;
    }
    const [a, b] = value.from <= iso ? [value.from, iso] : [iso, value.from];
    setPickingEnd(false);
    onChange({ from: a, to: b });
    setOpen(false);
  };

  const errorId = `${baseId}-error`;
  const inputProps = (end: RangeEnd) => {
    const invalid = field["aria-invalid"] || error?.end === end || undefined;
    const describedBy = [field["aria-describedby"], error?.end === end ? errorId : undefined].filter(Boolean).join(" ") || undefined;
    const textId = `${baseId}-${end}-text`;
    // Tên truy cập: có aria-label → "<nhãn> – Từ ngày"; ô "Từ ngày" trong Field → "<nhãn Field> Từ ngày"
    // (aria-labelledby tự tham chiếu để giữ <label for>); còn lại → "Từ ngày" / "Đến ngày".
    const naming = rest["aria-label"]
      ? { "aria-label": `${rest["aria-label"]} – ${t[end]}` }
      : end === "from"
        ? { "aria-labelledby": `${fromInputId} ${textId}` }
        : { "aria-labelledby": [fieldLabelId, textId].filter(Boolean).join(" ") }; // "Kỳ báo cáo Đến ngày"
    return {
      type: "text",
      inputMode: "numeric" as const,
      autoComplete: "off",
      disabled,
      required: field.required,
      ...(name ? { name: `${name}.${end}` } : {}),
      id: end === "from" ? fromInputId : `${baseId}-to`,
      value: drafts[end],
      placeholder: placeholder ?? t.placeholder,
      "aria-invalid": invalid,
      "aria-describedby": describedBy,
      ...naming,
      onChange: (e: ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setDrafts((s) => ({ ...s, [end]: v }));
      },
      onBlur: () => commit(end),
      onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(end);
        } else if (e.key === "ArrowDown" && e.altKey) {
          e.preventDefault();
          changeOpen(true);
        }
      },
      className:
        "h-full w-0 min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none disabled:cursor-not-allowed",
    };
  };

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
        <PopoverPrimitive.Anchor asChild>
          <div className={cn(shell, disabled && "cursor-not-allowed opacity-50")}>
            <span id={`${baseId}-from-text`} className="sr-only">
              {t.from}
            </span>
            <span id={`${baseId}-to-text`} className="sr-only">
              {t.to}
            </span>
            <input {...inputProps("from")} />
            <span aria-hidden="true" className="px-1 text-fg-subtle">
              –
            </span>
            <input {...inputProps("to")} />
            {clearable && hasValue && !disabled && (
              <button type="button" aria-label={t.clear} className={iconBtn} onClick={() => onChange({ from: null, to: null })}>
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
            <PopoverPrimitive.Trigger asChild disabled={disabled}>
              <button type="button" aria-label={t.openCalendar} aria-haspopup="dialog" aria-expanded={open} className={iconBtn}>
                <CalendarDays aria-hidden="true" className="h-4 w-4" />
              </button>
            </PopoverPrimitive.Trigger>
          </div>
        </PopoverPrimitive.Anchor>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="start" sideOffset={4} className={popover} aria-label={t.openCalendar}>
            <DayPicker
              mode="range"
              selected={from || to ? ({ from, to } satisfies DateRange) : undefined}
              // Tự xử lý theo ngày được bấm: v10 không phân biệt "cú bấm đầu" với "khoảng 1 ngày".
              onSelect={(_r, day) => pick(day)}
              numberOfMonths={numberOfMonths}
              defaultMonth={from ?? minD ?? new Date()}
              {...(minD ? { startMonth: minD } : {})}
              {...(maxD ? { endMonth: maxD } : {})}
              disabled={disabledDays}
              locale={DAY_LOCALE[locale]}
              weekStartsOn={locale === "vi" ? 1 : 0}
              autoFocus
              classNames={CALENDAR_CLASSES}
              components={{ Chevron: CalendarChevron }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger-subtle-fg">
          {t[error.end]}: {error.message}
        </p>
      )}
    </div>
  );
}
