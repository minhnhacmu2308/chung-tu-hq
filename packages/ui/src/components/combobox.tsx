// Combobox: chọn một hoặc nhiều giá trị có ô tìm kiếm (lọc không dấu tiếng Việt), hỗ trợ tải từ server.
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronsUpDown, Maximize2, Minimize2, X } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { cn } from "../lib/cn.js";
import { intlLocale, useMessages, useUiLocale, type Messages } from "../lib/i18n.js";
import { useFieldControl } from "./field.js";
import { Spinner } from "./spinner.js";

const MESSAGES = {
  vi: {
    placeholder: "Chọn…",
    search: "Tìm kiếm…",
    empty: "Không có kết quả",
    loading: "Đang tải…",
    clear: "Xóa lựa chọn",
    remove: "Bỏ",
    list: "Danh sách lựa chọn",
    selected: "đã chọn",
    more: "Còn {n} kết quả – gõ thêm để thu hẹp",
    expand: "Mở rộng",
    collapse: "Thu gọn",
  },
  en: {
    placeholder: "Select…",
    search: "Search…",
    empty: "No results",
    loading: "Loading…",
    clear: "Clear selection",
    remove: "Remove",
    list: "Options",
    selected: "selected",
    more: "{n} more results – keep typing to narrow down",
    expand: "Expand",
    collapse: "Collapse",
  },
  zh: {
    placeholder: "请选择…",
    search: "搜索…",
    empty: "无结果",
    loading: "加载中…",
    clear: "清除选择",
    remove: "移除",
    list: "选项列表",
    selected: "已选",
    more: "还有 {n} 条结果 – 继续输入以缩小范围",
    expand: "展开",
    collapse: "收起",
  },
} satisfies Messages<"placeholder" | "search" | "empty" | "loading" | "clear" | "remove" | "list" | "selected" | "more" | "expand" | "collapse">;

export type ComboboxOption = { value: string; label: string; description?: string; disabled?: boolean };

/** Chuẩn hóa để so khớp không dấu: "Hải Phòng" → "hai phong", "Đà Nẵng" → "da nang". */
export function foldVietnamese(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Khớp khi mọi từ của chuỗi tìm (không dấu) xuất hiện trong nhãn/mô tả (không dấu). */
export function matchesSearch(option: Pick<ComboboxOption, "label" | "description">, search: string): boolean {
  const hay = foldVietnamese(`${option.label} ${option.description ?? ""}`);
  return foldVietnamese(search)
    .split(" ")
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** Nhãn + mô tả đã bỏ dấu sẵn – tính một lần khi `options` đổi, không phải mỗi lần gõ. */
export type ComboboxSearchIndex = readonly { option: ComboboxOption; hay: string }[];

export function buildSearchIndex(options: readonly ComboboxOption[]): ComboboxSearchIndex {
  return options.map((option) => ({ option, hay: foldVietnamese(`${option.label} ${option.description ?? ""}`) }));
}

/**
 * Lọc trên chỉ mục đã bỏ dấu, giữ thứ tự gốc, lấy tối đa `maxResults` mục.
 * Mục thuộc `pinned` (đang chọn) mà khớp nhưng nằm ngoài giới hạn vẫn được thêm vào cuối.
 * `total` = tổng số mục khớp (để báo "còn n kết quả").
 */
export function searchOptions(
  index: ComboboxSearchIndex,
  search: string,
  maxResults: number,
  pinned?: ReadonlySet<string>,
): { shown: ComboboxOption[]; total: number } {
  const words = foldVietnamese(search).split(" ").filter(Boolean);
  const shown: ComboboxOption[] = [];
  let total = 0;
  for (const { option, hay } of index) {
    if (words.length > 0 && !words.every((w) => hay.includes(w))) continue;
    total++;
    if (shown.length < maxResults || pinned?.has(option.value)) shown.push(option);
  }
  return { shown, total };
}

type BaseProps = {
  options: readonly ComboboxOption[];
  placeholder?: string;
  /** Nội dung khi không có kết quả. */
  emptyText?: ReactNode;
  /** Đang tải danh sách (chế độ server). */
  loading?: boolean;
  /** Có hàm này → lọc phía server: component không tự lọc, gọi hàm mỗi lần đổi chuỗi tìm. */
  onSearchChange?: (search: string) => void;
  /** Số mục hiển thị tối đa (mặc định 100). Còn nhiều hơn → dòng "còn n kết quả – gõ thêm để thu hẹp". */
  maxResults?: number;
  clearable?: boolean;
  /** Nút "Mở rộng" trong danh sách: khung rộng hơn, nhãn/mô tả xuống dòng để đọc hết (mô tả dài như tên đơn vị, hướng dẫn mã). */
  expandable?: boolean;
  disabled?: boolean;
  className?: string;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
};

export type ComboboxProps =
  | (BaseProps & { multiple?: false; value: string | null; onChange: (value: string | null) => void })
  | (BaseProps & { multiple: true; value: readonly string[]; onChange: (value: string[]) => void });

const shell = cn(
  "flex min-h-10 w-full items-center gap-1 rounded-md border border-border bg-surface px-2 text-sm text-fg",
  "focus-within:border-focus focus-within:ring-2 focus-within:ring-focus",
  "has-[[aria-invalid=true]]:border-danger",
);

export function Combobox(props: ComboboxProps) {
  const {
    options,
    placeholder,
    emptyText,
    loading = false,
    onSearchChange,
    maxResults = 100,
    clearable = false,
    expandable = false,
    disabled = false,
    className,
    labels,
  } = props;
  const t = useMessages(MESSAGES, labels);
  const locale = useUiLocale();
  const a11y = useFieldControl(props);
  const listId = useId();
  const moreId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const wrap = expandable && expanded;

  const selected: string[] = props.multiple ? [...props.value] : props.value ? [props.value] : [];
  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selectedOptions = selected.map((v) => byValue.get(v) ?? { value: v, label: v });
  const serverMode = !!onSearchChange;
  // Chỉ mục bỏ dấu tính một lần theo `options`; chỉ dựng khi lọc tại chỗ.
  const index = useMemo(() => (serverMode ? null : buildSearchIndex(options)), [options, serverMode]);
  const selectedKey = selected.join("\u0000");
  const { shown, total } = useMemo(() => {
    const pinned = new Set(selectedKey ? selectedKey.split("\u0000") : []);
    if (!index) {
      // Server đã lọc: không lọc lại, chỉ giới hạn số mục render.
      const shownServer = options.filter((o, i) => i < maxResults || pinned.has(o.value));
      return { shown: shownServer, total: options.length };
    }
    return searchOptions(index, search, maxResults, pinned);
  }, [index, options, search, maxResults, selectedKey]);
  const remaining = total - shown.length;

  const setSearchValue = (s: string) => {
    setSearch(s);
    onSearchChange?.(s);
  };

  const toggle = (value: string) => {
    if (props.multiple) {
      const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
      props.onChange(next);
    } else {
      props.onChange(value === props.value ? null : value);
      setOpen(false);
    }
  };

  const clear = () => {
    if (props.multiple) props.onChange([]);
    else props.onChange(null);
  };

  const triggerText = props.multiple
    ? selected.length === 0
      ? (placeholder ?? t.placeholder)
      : null
    : (selectedOptions[0]?.label ?? placeholder ?? t.placeholder);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSearchValue("");
      }}
    >
      <PopoverPrimitive.Anchor asChild>
        <div data-glass-input="" className={cn(shell, disabled && "cursor-not-allowed opacity-50", className)}>
          {props.multiple && selectedOptions.length > 0 && (
            <ul className="flex flex-wrap items-center gap-1 py-1">
              {selectedOptions.map((o) => (
                <li key={o.value} className="inline-flex items-center gap-1 rounded-sm bg-surface-muted px-1.5 py-0.5 text-xs text-fg">
                  {o.label}
                  <button
                    type="button"
                    disabled={disabled}
                    aria-label={`${t.remove} ${o.label}`}
                    onClick={() => toggle(o.value)}
                    className="rounded-sm text-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <X aria-hidden="true" className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <PopoverPrimitive.Trigger asChild disabled={disabled}>
            <button
              type="button"
              role="combobox"
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? listId : undefined}
              aria-label={props["aria-label"]}
              aria-required={a11y.required}
              id={a11y.id}
              aria-describedby={a11y["aria-describedby"]}
              aria-invalid={a11y["aria-invalid"]}
              className={cn(
                "flex h-9 min-w-0 flex-1 items-center gap-2 bg-transparent px-1 text-left focus-visible:outline-none disabled:cursor-not-allowed",
              )}
            >
              <span className={cn("min-w-0 flex-1 truncate", selected.length === 0 && "text-fg-subtle")}>{triggerText}</span>
              <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-fg-subtle" />
            </button>
          </PopoverPrimitive.Trigger>
          {clearable && selected.length > 0 && !disabled && (
            <button
              type="button"
              aria-label={t.clear}
              onClick={clear}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </div>
      </PopoverPrimitive.Anchor>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          // Chừa 1rem với mép màn hình khi Radix đẩy khung vào trong (danh sách mở rộng trên màn hẹp).
          collisionPadding={16}
          aria-label={t.list}
          data-expanded={expandable ? String(expanded) : undefined}
          data-glass=""
          className={cn(
            "z-50 min-w-56 rounded-lg border border-border bg-surface text-fg shadow-lg motion-safe:animate-pop-in",
            // Mở rộng: tới 36rem nhưng không vượt màn hình (chừa 1rem mỗi bên).
            wrap ? "w-[min(36rem,calc(100vw-2rem))]" : "w-[var(--radix-popover-trigger-width)]",
          )}
        >
          {/* Tự lọc bằng chỉ mục bỏ dấu (nhanh, giới hạn số mục) thay vì để cmdk chấm điểm từng mục. */}
          <Command label={t.list} shouldFilter={false} loop>
            <div className="flex items-center gap-1 border-b border-border p-1.5">
              <Command.Input
                value={search}
                onValueChange={setSearchValue}
                placeholder={t.search}
                className="h-8 w-full min-w-0 rounded-sm bg-transparent px-2 text-sm text-fg placeholder:text-fg-subtle focus-visible:outline-none"
              />
              {expandable && (
                <button
                  type="button"
                  aria-pressed={expanded}
                  aria-label={expanded ? t.collapse : t.expand}
                  title={expanded ? t.collapse : t.expand}
                  onClick={() => setExpanded((e) => !e)}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-fg-subtle hover:bg-surface-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {expanded ? <Minimize2 aria-hidden="true" className="h-4 w-4" /> : <Maximize2 aria-hidden="true" className="h-4 w-4" />}
                </button>
              )}
            </div>
            <Command.List
              id={listId}
              aria-label={t.list}
              aria-describedby={remaining > 0 ? moreId : undefined}
              className={cn("overflow-y-auto p-1", wrap ? "max-h-96" : "max-h-64")}
            >
              {loading && (
                <Command.Loading>
                  <div className="flex items-center gap-2 px-2 py-2 text-sm text-fg-muted">
                    <Spinner size="sm" label={null} />
                    {t.loading}
                  </div>
                </Command.Loading>
              )}
              {!loading && <Command.Empty className="px-2 py-3 text-center text-sm text-fg-muted">{emptyText ?? t.empty}</Command.Empty>}
              {shown.map((o) => {
                const isSelected = selected.includes(o.value);
                return (
                  <Command.Item
                    key={o.value}
                    value={o.value}
                    {...(o.disabled ? { disabled: true } : {})}
                    onSelect={() => toggle(o.value)}
                    data-checked={isSelected || undefined}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm text-fg",
                      "data-[selected=true]:bg-surface-muted data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50",
                    )}
                  >
                    <Check aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0 text-primary", !isSelected && "invisible")} />
                    <span className="flex min-w-0 flex-col">
                      <span className={wrap ? "break-words" : "truncate"}>{o.label}</span>
                      {o.description && <span className={cn("text-xs text-fg-subtle", wrap ? "whitespace-normal break-words" : "truncate")}>{o.description}</span>}
                    </span>
                    {isSelected && <span className="sr-only">({t.selected})</span>}
                  </Command.Item>
                );
              })}
            </Command.List>
            {/* Ngoài listbox (không phải option, không chọn được); trình đọc màn hình đọc khi số lượng đổi. */}
            <p id={moreId} role="status" className={cn("px-3 text-xs text-fg-muted", remaining > 0 && "border-t border-border py-2")}>
              {remaining > 0 ? t.more.replace("{n}", remaining.toLocaleString(intlLocale(locale))) : ""}
            </p>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
