// Bảng dữ liệu: sắp xếp phía client, chọn dòng, hành động theo dòng, loading/rỗng, header dính, phân trang.
// Tùy chọn (mặc định tắt): tìm kiếm không dấu, lọc theo cột (meta.filter), ẩn/hiện cột, kéo đổi độ rộng cột,
// dạng thẻ (`renderCard` → nút chuyển Bảng ↔ Thẻ; thẻ dùng chung tìm kiếm, lọc, sắp xếp, chọn, phân trang).
// Dùng @tanstack/react-table v9 (useTable + tableFeatures). Cột khai báo bằng createDataTableColumnHelper<T>().
import {
  columnFilteringFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  functionalUpdate,
  globalFilteringFeature,
  metaHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type FilterFn,
  type PaginationState,
  type RowData,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Filter, FilterX, LayoutGrid, Rows3, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../lib/cn.js";
import { useMessages, type Messages } from "../lib/i18n.js";
import { Button } from "./button.js";
import { SegmentedControl } from "./choice.js";
import { EmptyState, Skeleton } from "./feedback.js";
import { Input, Select } from "./inputs.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger,
} from "./menu.js";
import { Pagination } from "./pagination.js";

const MESSAGES = {
  vi: {
    selectAll: "Chọn tất cả",
    selectRow: "Chọn dòng {label}",
    actions: "Thao tác",
    emptyTitle: "Không có dữ liệu",
    loading: "Đang tải dữ liệu",
    search: "Tìm trong bảng",
    searchPlaceholder: "Tìm kiếm…",
    filterBy: "Lọc theo {label}",
    filterAll: "Tất cả",
    clearFilters: "Xóa bộ lọc",
    filteredCount: "Hiển thị {shown}/{total} dòng",
    noResultsTitle: "Không có kết quả phù hợp",
    noResultsDescription: "Thử từ khóa khác hoặc xóa bộ lọc.",
    columns: "Cột",
    columnsLabel: "Hiện cột",
    resizeColumn: "Đổi độ rộng cột {label}",
    view: "Kiểu hiển thị",
    viewTable: "Bảng",
    viewCards: "Thẻ",
    sortBy: "Sắp xếp theo",
    sortDefault: "Sắp xếp mặc định",
    filters: "Bộ lọc",
    filtersActive: "Bộ lọc ({n})",
    selectedCount: "Đã chọn {n}",
    selectionToolbar: "Thao tác với các dòng đã chọn",
    clearSelection: "Bỏ chọn",
    sortAsc: "Tăng dần",
    sortDesc: "Giảm dần",
    sortDirection: "Đổi chiều sắp xếp",
  },
  en: {
    selectAll: "Select all",
    selectRow: "Select row {label}",
    actions: "Actions",
    emptyTitle: "No data",
    loading: "Loading data",
    search: "Search table",
    searchPlaceholder: "Search…",
    filterBy: "Filter by {label}",
    filterAll: "All",
    clearFilters: "Clear filters",
    filteredCount: "Showing {shown} of {total} rows",
    noResultsTitle: "No matching results",
    noResultsDescription: "Try another keyword or clear the filters.",
    columns: "Columns",
    columnsLabel: "Visible columns",
    resizeColumn: "Resize column {label}",
    view: "View",
    viewTable: "Table",
    viewCards: "Cards",
    sortBy: "Sort by",
    sortDefault: "Default order",
    filters: "Filters",
    filtersActive: "Filters ({n})",
    selectedCount: "{n} selected",
    selectionToolbar: "Actions for selected rows",
    clearSelection: "Clear selection",
    sortAsc: "Ascending",
    sortDesc: "Descending",
    sortDirection: "Toggle sort direction",
  },
  zh: {
    selectAll: "全选",
    selectRow: "选择行 {label}",
    actions: "操作",
    emptyTitle: "暂无数据",
    loading: "正在加载数据",
    search: "在表格中搜索",
    searchPlaceholder: "搜索…",
    filterBy: "按{label}筛选",
    filterAll: "全部",
    clearFilters: "清除筛选",
    filteredCount: "显示 {shown}/{total} 行",
    noResultsTitle: "没有匹配的结果",
    noResultsDescription: "请尝试其他关键词或清除筛选。",
    columns: "列",
    columnsLabel: "显示列",
    resizeColumn: "调整列宽 {label}",
    view: "显示方式",
    viewTable: "表格",
    viewCards: "卡片",
    sortBy: "排序方式",
    sortDefault: "默认排序",
    filters: "筛选",
    filtersActive: "筛选（{n}）",
    selectedCount: "已选 {n} 项",
    selectionToolbar: "所选行的操作",
    clearSelection: "取消选择",
    sortAsc: "升序",
    sortDesc: "降序",
    sortDirection: "切换排序方向",
  },
} satisfies Messages<
  | "selectAll"
  | "selectRow"
  | "actions"
  | "emptyTitle"
  | "loading"
  | "search"
  | "searchPlaceholder"
  | "filterBy"
  | "filterAll"
  | "clearFilters"
  | "filteredCount"
  | "noResultsTitle"
  | "noResultsDescription"
  | "columns"
  | "columnsLabel"
  | "resizeColumn"
  | "view"
  | "viewTable"
  | "viewCards"
  | "sortBy"
  | "sortDefault"
  | "sortAsc"
  | "sortDesc"
  | "sortDirection"
  | "filters"
  | "filtersActive"
  | "selectedCount"
  | "selectionToolbar"
  | "clearSelection"
>;

/** Thông tin hiển thị theo cột (đặt trong `meta` của column). */
export type DataTableColumnMeta = {
  /** Canh lề: "end" cho cột số/tiền. */
  align?: "start" | "center" | "end";
  headerClassName?: string;
  cellClassName?: string;
  /** Cho phép xuống dòng (vd tên đối tác, mô tả hàng). Mặc định KHÔNG xuống dòng + bảng cuộn ngang. */
  wrap?: boolean;
  /** Tên cột dùng cho menu "Cột", nhãn ô lọc, nhãn tay kéo. Mặc định = `header` nếu là chuỗi, ngược lại = id. */
  label?: string;
  /** Bật lọc theo cột (trong hộp lọc mở từ nút phễu cạnh ô tìm kiếm): "text" = chứa chuỗi (không dấu), "select" = bằng một giá trị. */
  filter?: "text" | "select";
  /** Lựa chọn cho `filter: "select"`. Mặc định lấy các giá trị khác nhau của cột. */
  filterOptions?: readonly { value: string; label: string }[];
  /** `false` = không cho ẩn cột này trong menu "Cột". */
  hideable?: boolean;
  /**
   * Cột đứng yên khi bảng cuộn ngang: `true`/"start" = dính mép trái (cột định danh như mã hồ sơ),
   * "end" = dính mép phải (cột thao tác – luôn nhìn thấy dù bảng rộng). Mỗi phía chỉ nên có MỘT cột.
   */
  sticky?: boolean | "start" | "end";
  /** `false` = không cho kéo đổi độ rộng cột này (khi bảng bật `resizable`). Độ rộng: `size`/`minSize`/`maxSize` của cột. */
  resizable?: boolean;
};

/** Bỏ dấu tiếng Việt + chữ thường: "Đà Nẵng" → "da nang". */
function fold(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase();
}

/** Giá trị lọc của cột "select" (tách khỏi chuỗi của cột "text"). */
type SelectFilterValue = { equals: string };
const isSelectFilter = (v: unknown): v is SelectFilterValue => typeof v === "object" && v !== null && "equals" in v;

// Một hàm lọc dùng chung cho tìm kiếm toàn bảng và lọc theo cột.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hàm lọc đăng ký cho mọi kiểu dòng
const foldFilter: FilterFn<any, any> = (row, columnId, filterValue) => {
  const raw: unknown = row.getValue(columnId);
  if (isSelectFilter(filterValue)) return String(raw ?? "") === filterValue.equals;
  const needle = fold(filterValue).trim();
  return needle === "" || fold(raw).includes(needle);
};
foldFilter.autoRemove = (v: unknown) => (isSelectFilter(v) ? v.equals === "" : v == null || String(v).trim() === "");

export const dataTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, datetime: sortFn_datetime, basic: sortFn_basic },
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { fold: foldFilter },
  columnVisibilityFeature,
  columnSizingFeature,
  rowSelectionFeature,
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  columnMeta: metaHelper<DataTableColumnMeta>(),
});

export type DataTableFeatures = typeof dataTableFeatures;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- giữ kiểu giá trị riêng từng cột (theo tài liệu table v9)
export type DataTableColumn<TData extends RowData> = ColumnDef<DataTableFeatures, TData, any>;
export type { ColumnSizingState as DataTableColumnSizing, ColumnVisibilityState as DataTableColumnVisibility };

/** Trình tạo cột có suy luận kiểu: `const col = createDataTableColumnHelper<HoSo>()`. */
export function createDataTableColumnHelper<TData extends RowData>() {
  return createColumnHelper<DataTableFeatures, TData>();
}

export type DataTablePagination =
  | false
  /** Phân trang phía client, bảng tự quản lý. */
  | { mode?: "client"; initialPageSize?: number; pageSizeOptions?: readonly number[] }
  /** Điều khiển từ ngoài (vd phân trang phía server: truyền `rowCount` và dữ liệu của đúng trang hiện tại). */
  | {
      mode: "controlled";
      pageIndex: number;
      pageSize: number;
      onChange: (next: { pageIndex: number; pageSize: number }) => void;
      /** Có `rowCount` = dữ liệu đã được phân trang sẵn (server). */
      rowCount?: number;
      pageSizeOptions?: readonly number[];
    };

export type DataTableView = "table" | "cards";
/** Phần bảng tự dựng cho từng thẻ: ô chọn (khi `selectable`) và thao tác (`rowActions`) – đặt vào `RecordCard` qua `select` / `actions`. */
export type DataTableCardParts = { select: ReactNode | null; actions: ReactNode | null; selected: boolean };

export type DataTableProps<TData extends RowData> = {
  columns: readonly DataTableColumn<TData>[];
  data: readonly TData[];
  getRowId: (row: TData) => string;
  /** Tên bảng cho trình đọc màn hình (bắt buộc nếu không có caption). */
  "aria-label"?: string;
  /** Tiêu đề bảng; mặc định chỉ dành cho trình đọc màn hình. */
  caption?: ReactNode;
  showCaption?: boolean;
  /** Bật cột checkbox chọn dòng. */
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
  /**
   * Thao tác hàng loạt: chọn ≥ 1 dòng → thanh nổi ở giữa đáy màn hình ("Đã chọn n" + các nút này + "Bỏ chọn").
   * `clear()` bỏ chọn (vd sau khi xóa xong).
   */
  selectionActions?: (rows: TData[], clear: () => void) => ReactNode;
  /** Tên dòng để đọc nhãn checkbox "Chọn dòng …". Mặc định là id. */
  rowLabel?: (row: TData) => string;
  /** Hành động ở cuối mỗi dòng (vd menu "…"). */
  rowActions?: (row: TData) => ReactNode;
  /** Bấm/Enter trên dòng. */
  onRowClick?: (row: TData) => void;
  loading?: boolean;
  loadingRows?: number;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  /**
   * Dữ liệu đã bị lọc từ NGOÀI bảng (tab/nút chọn nhóm, khoảng ngày…). Khi true và không còn dòng nào,
   * bảng hiện "Không có kết quả phù hợp" thay cho trạng thái "chưa có dữ liệu".
   */
  filtered?: boolean;
  /** Bỏ bộ lọc bên ngoài – gọi khi bấm "Xóa bộ lọc" (cùng với xóa ô tìm kiếm/lọc cột của bảng). */
  onClearFilters?: () => void;
  initialSorting?: SortingState;
  pagination?: DataTablePagination;
  stickyHeader?: boolean;
  /** Ô tìm kiếm toàn bảng trên thanh công cụ (không phân biệt dấu tiếng Việt, trên các cột chuỗi/số). */
  searchable?: boolean;
  /** Nút "Cột" để ẩn/hiện cột. */
  columnToggle?: boolean;
  /** Ẩn/hiện cột điều khiển từ ngoài (vd lưu theo người dùng): `{ partner: false }`. */
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: (next: ColumnVisibilityState) => void;
  /** Tay kéo đổi độ rộng cột (bảng chuyển sang table-layout: fixed). */
  resizable?: boolean;
  /** Độ rộng cột (px) điều khiển từ ngoài: `{ code: 180 }`. */
  columnSizing?: ColumnSizingState;
  onColumnSizingChange?: (next: ColumnSizingState) => void;
  /** Nội dung thêm ở cuối thanh công cụ (vd nút "Tạo hồ sơ"). */
  toolbarActions?: ReactNode;
  labels?: Partial<Record<keyof (typeof MESSAGES)["vi"], string>>;
  /** Class cho khung cuộn (vd max-h-96 để header dính có tác dụng). */
  className?: string;
  /**
   * Dạng thẻ: nội dung một thẻ (thường là `RecordCard` nhận `parts.select` + `parts.actions`). Có prop này → thanh công cụ
   * có nút chuyển Bảng ↔ Thẻ; dạng thẻ dùng chung tìm kiếm, lọc theo cột, sắp xếp (chọn cột), chọn dòng, phân trang.
   */
  renderCard?: (row: TData, parts: DataTableCardParts) => ReactNode;
  /** Kiểu hiển thị điều khiển từ ngoài. */
  view?: DataTableView;
  defaultView?: DataTableView;
  onViewChange?: (view: DataTableView) => void;
  /** Nhớ kiểu hiển thị người dùng chọn trong trình duyệt (localStorage) theo khóa này, vd "dossiers". */
  viewStorageKey?: string;
};

const ALIGN = { start: "text-left", center: "text-center", end: "text-right" } as const;
/** Class cho ô/tiêu đề của cột dính trái hoặc phải. */
function stickyCell(sticky: boolean | "start" | "end" | undefined, z: string) {
  if (!sticky) return undefined;
  return sticky === "end" ? cn("sticky-col-edge-end sticky right-0", z) : cn("sticky-col-edge sticky left-0", z);
}

const INTERACTIVE = "button, a, input, select, textarea, label, [role='menuitem'], [role='button'], [role='separator']";
const RESIZE_STEP = 10;

const fill = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

/** Điều khiển trạng thái: có prop từ ngoài thì dùng prop, không thì tự giữ. */
function useControllable<T>(value: T | undefined, onChange: ((next: T) => void) | undefined, initial: T) {
  const [inner, setInner] = useState<T>(initial);
  const current = value ?? inner;
  const set = (next: T) => {
    if (value === undefined) setInner(next);
    onChange?.(next);
  };
  return [current, set] as const;
}

/** Checkbox gốc có trạng thái "một phần" (indeterminate). */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  label,
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (e: unknown) => void;
  label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="kb-checkbox"
    />
  );
}

/** Tay kéo ở mép phải tiêu đề: kéo chuột/cảm ứng, mũi tên trái/phải khi có focus, nhấp đúp = độ rộng mặc định. */
function ResizeHandle({
  label,
  size,
  min,
  max,
  onResize,
  onReset,
}: {
  label: string;
  size: number;
  min: number;
  max: number;
  onResize: (size: number) => void;
  onReset: () => void;
}) {
  const drag = useRef<{ x: number; size: number } | null>(null);
  const clamp = (n: number) => Math.round(Math.min(max, Math.max(min, n)));
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, size };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) onResize(clamp(drag.current.size + e.clientX - drag.current.x));
  };
  const stop = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? RESIZE_STEP * 5 : RESIZE_STEP;
    const next =
      e.key === "ArrowLeft" ? size - step : e.key === "ArrowRight" ? size + step : e.key === "Home" ? min : null;
    if (next === null) return;
    e.preventDefault();
    onResize(clamp(next));
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={size}
      aria-valuemin={min}
      aria-valuemax={max < Number.MAX_SAFE_INTEGER ? max : undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none",
        "hover:bg-border-strong focus-visible:bg-focus focus-visible:outline-none",
      )}
    />
  );
}

export function DataTable<TData extends RowData>({
  columns,
  data,
  getRowId,
  "aria-label": ariaLabel,
  caption,
  showCaption = false,
  selectable = false,
  onSelectionChange,
  selectionActions,
  rowLabel,
  rowActions,
  onRowClick,
  loading = false,
  loadingRows = 5,
  emptyTitle,
  emptyDescription,
  emptyAction,
  filtered: filteredOutside = false,
  onClearFilters,
  initialSorting = [],
  pagination = { mode: "client" },
  stickyHeader = true,
  searchable = false,
  columnToggle = false,
  columnVisibility: visibilityProp,
  onColumnVisibilityChange,
  resizable = false,
  columnSizing: sizingProp,
  onColumnSizingChange,
  toolbarActions,
  labels,
  className,
  renderCard,
  view: viewProp,
  defaultView = "table",
  onViewChange,
  viewStorageKey,
}: DataTableProps<TData>) {
  const t = useMessages(MESSAGES, labels);
  const [viewState, setViewState] = useControllable(viewProp, onViewChange, defaultView);
  // Hộp lọc theo cột (nút phễu cạnh ô tìm kiếm) – dùng chung cho dạng bảng và thẻ.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view: DataTableView = renderCard ? viewState : "table";
  const storageKey = viewStorageKey ? `kb-table-view:${viewStorageKey}` : null;
  // Đọc lựa chọn đã nhớ sau khi gắn (không đọc lúc dựng → khớp HTML dựng ở máy chủ). Trình duyệt chặn bộ nhớ → bỏ qua.
  useEffect(() => {
    if (!storageKey || viewProp !== undefined) return;
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved === "table" || saved === "cards") setViewState(saved);
    } catch {
      /* bỏ qua */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const changeView = (v: DataTableView) => {
    setViewState(v);
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, v);
    } catch {
      /* bỏ qua */
    }
  };

  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useControllable(visibilityProp, onColumnVisibilityChange, {});
  const [columnSizing, setColumnSizing] = useControllable(sizingProp, onColumnSizingChange, {});
  const controlled = pagination !== false && pagination.mode === "controlled" ? pagination : null;
  const [innerPage, setInnerPage] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pagination !== false && pagination.mode !== "controlled" ? (pagination.initialPageSize ?? 20) : 20,
  });
  const pageState: PaginationState =
    pagination === false
      ? { pageIndex: 0, pageSize: Math.max(1, data.length) }
      : controlled
        ? { pageIndex: controlled.pageIndex, pageSize: controlled.pageSize }
        : innerPage;

  // Đổi bộ lọc → về trang đầu
  const toFirstPage = () => {
    if (pageState.pageIndex === 0 || pagination === false) return;
    if (controlled) controlled.onChange({ pageIndex: 0, pageSize: pageState.pageSize });
    else setInnerPage((p) => ({ ...p, pageIndex: 0 }));
  };

  const allColumns = useMemo(() => {
    const helper = createDataTableColumnHelper<TData>();
    const list: DataTableColumn<TData>[] = [];
    if (selectable) {
      list.push(
        helper.display({
          id: "__select",
          enableSorting: false,
          enableHiding: false,
          size: 44,
          minSize: 44,
          header: ({ table }) => (
            <IndeterminateCheckbox
              label={t.selectAll}
              checked={table.getIsAllRowsSelected()}
              indeterminate={table.getIsSomeRowsSelected()}
              onChange={table.getToggleAllRowsSelectedHandler()}
            />
          ),
          cell: ({ row }) => (
            <IndeterminateCheckbox
              label={fill(t.selectRow, { label: rowLabel ? rowLabel(row.original) : row.id })}
              checked={row.getIsSelected()}
              indeterminate={false}
              onChange={row.getToggleSelectedHandler()}
            />
          ),
          meta: { cellClassName: "w-10", headerClassName: "w-10", resizable: false },
        }),
      );
    }
    list.push(...columns);
    if (rowActions) {
      list.push(
        helper.display({
          id: "__actions",
          enableSorting: false,
          enableHiding: false,
          // Không chừa cột: ô rộng 0 dính mép phải, cụm nút nổi đè lên cuối dòng khi rê chuột / Tab vào dòng.
          size: 0,
          minSize: 0,
          header: () => <span className="sr-only">{t.actions}</span>,
          cell: ({ row }) => (
            <div
              data-slot="row-actions-overlay"
              className={cn(
                "absolute right-2 top-1/2 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 shadow-md",
                "pointer-events-none opacity-0 transition-opacity duration-150",
                "group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                // Menu "…" đang mở: giữ cụm nút dù chuột đã rời dòng. Cảm ứng (không có hover): luôn hiện (RowActions chỉ còn nút "…").
                "has-[[data-state=open]]:pointer-events-auto has-[[data-state=open]]:opacity-100",
                "[@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100",
              )}
            >
              {rowActions(row.original)}
            </div>
          ),
          meta: { align: "end", resizable: false, headerClassName: "w-0 p-0", cellClassName: "sticky right-0 w-0 p-0 overflow-visible" },
        }),
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, selectable, rowActions, rowLabel, t.selectAll, t.selectRow, t.actions]);

  const table = useTable({
    features: dataTableFeatures,
    columns: allColumns,
    data,
    getRowId: (row) => getRowId(row),
    enableRowSelection: selectable,
    defaultColumn: { filterFn: "fold" },
    globalFilterFn: "fold",
    state: { sorting, rowSelection, pagination: pageState, globalFilter, columnFilters, columnVisibility, columnSizing },
    onSortingChange: (u) => setSorting((prev) => functionalUpdate(u, prev)),
    onRowSelectionChange: (u) => setRowSelection((prev) => functionalUpdate(u, prev)),
    onPaginationChange: (u) => {
      const next = functionalUpdate(u, pageState);
      if (controlled) controlled.onChange(next);
      else setInnerPage(next);
    },
    onGlobalFilterChange: (u) => {
      setGlobalFilter(String(functionalUpdate(u, globalFilter) ?? ""));
      toFirstPage();
    },
    onColumnFiltersChange: (u) => {
      setColumnFilters(functionalUpdate(u, columnFilters));
      toFirstPage();
    },
    onColumnVisibilityChange: (u) => setColumnVisibility(functionalUpdate(u, columnVisibility)),
    onColumnSizingChange: (u) => setColumnSizing(functionalUpdate(u, columnSizing)),
    ...(controlled?.rowCount !== undefined ? { manualPagination: true, rowCount: controlled.rowCount } : {}),
    autoResetPageIndex: false,
  });

  // Báo danh sách id đang chọn ra ngoài
  const selectedKey = Object.keys(rowSelection).filter((k) => rowSelection[k]).join("|");
  const onSel = useRef(onSelectionChange);
  onSel.current = onSelectionChange;
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    onSel.current?.(selectedKey ? selectedKey.split("|") : []);
  }, [selectedKey]);

  const rows = table.getRowModel().rows;
  // Dòng đang chọn còn trong dữ liệu (dòng đã xóa khỏi `data` không tính) – cho thanh thao tác hàng loạt.
  const selectedRows = useMemo(
    () => (selectedKey && selectionActions ? data.filter((d) => rowSelection[getRowId(d)]) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedKey, data, !!selectionActions],
  );
  // Bề rộng phần nhìn thấy của khung cuộn: ô trống/không kết quả bám theo nó (dính trái) để không bị cắt
  // giữa bảng rộng hơn màn hình (mobile, nhiều cột).
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState<number>();
  const isEmpty = !loading && rows.length === 0;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isEmpty || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isEmpty]);
  const leafColumns = table.getVisibleLeafColumns();
  const colCount = leafColumns.length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const totalRows = controlled?.rowCount ?? filteredCount;
  const clickable = !!onRowClick;

  const columnLabel = (column: (typeof leafColumns)[number]) => {
    const def = column.columnDef;
    return def.meta?.label ?? (typeof def.header === "string" ? def.header : column.id);
  };
  const filterColumns = leafColumns.filter((c) => c.columnDef.meta?.filter && c.getCanFilter());
  const hasFilterRow = filterColumns.length > 0;
  const isFiltered = globalFilter.trim() !== "" || columnFilters.length > 0;
  const showToolbar = searchable || columnToggle || hasFilterRow || !!toolbarActions || !!renderCard;
  const clearFilters = () => {
    setGlobalFilter("");
    setColumnFilters([]);
    toFirstPage();
    onClearFilters?.();
  };
  // Hết dòng vì bộ lọc (trong bảng, hoặc bên ngoài) chứ không phải vì chưa có dữ liệu.
  const noResults = (isFiltered && data.length > 0) || filteredOutside;
  // Nút "Xóa bộ lọc" trong ô trống chỉ có ý nghĩa khi xóa được thứ gì đó.
  const canClear = isFiltered || !!onClearFilters;
  const hideableColumns = table.getAllLeafColumns().filter((c) => !c.id.startsWith("__"));

  // Giá trị cho ô lọc "select": options truyền vào, hoặc các giá trị khác nhau của cột
  const selectOptions = (column: (typeof leafColumns)[number]) => {
    const given = column.columnDef.meta?.filterOptions;
    if (given) return given;
    const seen = new Set<string>();
    for (const row of table.getPreFilteredRowModel().flatRows) {
      const v: unknown = row.getValue(column.id);
      if (v != null && v !== "") seen.add(String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b, "vi")).map((v) => ({ value: v, label: v }));
  };

  const activate = (row: TData, e: MouseEvent | KeyboardEvent) => {
    // Bỏ qua khi thao tác trên phần tử tương tác bên trong dòng (checkbox, nút hành động…)
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    onRowClick?.(row);
  };

  const cardParts = (row: (typeof rows)[number]): DataTableCardParts => ({
    selected: row.getIsSelected(),
    select: selectable ? (
      <IndeterminateCheckbox
        label={fill(t.selectRow, { label: rowLabel ? rowLabel(row.original) : row.id })}
        checked={row.getIsSelected()}
        indeterminate={false}
        onChange={row.getToggleSelectedHandler()}
      />
    ) : null,
    actions: rowActions ? rowActions(row.original) : null,
  });

  // Ô lọc của một cột – trong hộp lọc mở từ nút phễu cạnh ô tìm kiếm (dùng chung cho dạng bảng và thẻ).
  const filterControl = (column: (typeof leafColumns)[number], withLabel: boolean) => {
    const kind = column.columnDef.meta?.filter;
    const label = fill(t.filterBy, { label: columnLabel(column) });
    const value: unknown = column.getFilterValue();
    const control =
      kind === "select" ? (
        <Select
          aria-label={label}
          placeholder={t.filterAll}
          options={selectOptions(column)}
          value={isSelectFilter(value) ? value.equals : ""}
          onChange={(e) => column.setFilterValue(e.target.value ? { equals: e.target.value } : undefined)}
          className="h-8 min-w-24 text-sm"
        />
      ) : kind === "text" ? (
        <Input type="search" aria-label={label} value={typeof value === "string" ? value : ""} onChange={(e) => column.setFilterValue(e.target.value)} className="h-8" />
      ) : null;
    if (!withLabel || !control) return control;
    return (
      <div key={column.id} className="flex min-w-0 flex-col gap-1">
        <span aria-hidden="true" className="text-xs text-fg-muted">{columnLabel(column)}</span>
        {control}
      </div>
    );
  };

  // Sắp xếp ở dạng thẻ (không có tiêu đề cột để bấm): chọn cột + đổi chiều.
  const sortableColumns = leafColumns.filter((c) => c.getCanSort() && !c.id.startsWith("__"));
  const sortedBy = sorting[0];
  const sortControls = (
    <div className="flex items-center gap-1">
      <Select
        aria-label={t.sortBy}
        options={[{ value: "", label: t.sortDefault }, ...sortableColumns.map((c) => ({ value: c.id, label: columnLabel(c) }))]}
        value={sortedBy?.id ?? ""}
        onChange={(e) => setSorting(e.target.value ? [{ id: e.target.value, desc: sortedBy?.desc ?? false }] : [])}
        className="h-9 min-w-36 text-sm"
      />
      {sortedBy && (
        <Button
          variant="secondary"
          size="icon-sm"
          aria-label={`${t.sortDirection}: ${sortedBy.desc ? t.sortDesc : t.sortAsc}`}
          title={sortedBy.desc ? t.sortDesc : t.sortAsc}
          onClick={() => setSorting([{ id: sortedBy.id, desc: !sortedBy.desc }])}
        >
          {sortedBy.desc ? <ArrowDown aria-hidden="true" className="h-4 w-4" /> : <ArrowUp aria-hidden="true" className="h-4 w-4" />}
        </Button>
      )}
    </div>
  );

  const clearButton = (
    <Button variant="ghost" size="sm" leftIcon={<FilterX aria-hidden="true" className="h-4 w-4" />} onClick={clearFilters}>
      {t.clearFilters}
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchable && (
            <div className="relative w-full cq-sm:w-64">
              <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle" />
              <Input
                type="search"
                aria-label={t.search}
                placeholder={t.searchPlaceholder}
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                className="h-9 pl-8"
              />
            </div>
          )}
          {hasFilterRow && (
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant={columnFilters.length ? "primary" : "secondary"}
                  size={columnFilters.length ? "sm" : "icon"}
                  aria-label={columnFilters.length ? fill(t.filtersActive, { n: columnFilters.length }) : t.filters}
                  title={t.filters}
                  className={columnFilters.length ? "h-9" : "h-9 w-9"}
                  leftIcon={columnFilters.length ? <Filter aria-hidden="true" className="h-4 w-4" /> : undefined}
                >
                  {columnFilters.length ? columnFilters.length : <Filter aria-hidden="true" className="h-4 w-4" />}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" aria-label={t.filters} className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3">
                <p className="text-sm font-semibold">{t.filters}</p>
                <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">{filterColumns.map((c) => filterControl(c, true))}</div>
              </PopoverContent>
            </Popover>
          )}
          {isFiltered && clearButton}
          <p role="status" className="text-sm text-fg-muted">
            {isFiltered && !loading ? fill(t.filteredCount, { shown: filteredCount, total: data.length }) : null}
          </p>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {view === "cards" && sortableColumns.length > 0 && sortControls}
            {/* Menu không modal: bảng vẫn truy cập được (cả với trình đọc màn hình) trong lúc bật/tắt cột */}
            {columnToggle && view === "table" && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" leftIcon={<Columns3 aria-hidden="true" className="h-4 w-4" />}>
                    {t.columns}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{t.columnsLabel}</DropdownMenuLabel>
                  {hideableColumns.map((column) => {
                    const canHide = column.getCanHide() && column.columnDef.meta?.hideable !== false;
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        checked={column.getIsVisible()}
                        disabled={!canHide}
                        onCheckedChange={(v) => column.toggleVisibility(v === true)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        {columnLabel(column)}
                      </DropdownMenuCheckboxItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {renderCard && (
              <SegmentedControl<DataTableView>
                label={t.view}
                hideLabel
                value={view}
                onChange={changeView}
                options={[
                  { value: "table", label: t.viewTable, icon: <Rows3 className="h-4 w-4" /> },
                  { value: "cards", label: t.viewCards, icon: <LayoutGrid className="h-4 w-4" /> },
                ]}
              />
            )}
            {toolbarActions}
          </div>
        </div>
      )}

      {view === "cards" ? (
        <div>
          {loading ? (
            <ul aria-label={ariaLabel} aria-busy="true" className="grid grid-cols-1 gap-3 cq-md:grid-cols-2 cq-xl:grid-cols-3">
              {Array.from({ length: Math.min(loadingRows, 6) }, (_, i) => (
                <li key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-2/3" />
                </li>
              ))}
            </ul>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface">
              {noResults ? (
                <EmptyState illustration="no-results" illustrationSize="sm" title={t.noResultsTitle} description={t.noResultsDescription} action={canClear ? clearButton : undefined} />
              ) : (
                <EmptyState illustration="empty" illustrationSize="sm" title={emptyTitle ?? t.emptyTitle} description={emptyDescription} action={emptyAction} />
              )}
            </div>
          ) : (
            <ul aria-label={ariaLabel} className="grid grid-cols-1 gap-3 cq-md:grid-cols-2 cq-xl:grid-cols-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  data-selected={row.getIsSelected() || undefined}
                  aria-label={rowLabel ? rowLabel(row.original) : row.id}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? (e) => activate(row.original, e) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
                            e.preventDefault();
                            onRowClick?.(row.original);
                          }
                        }
                      : undefined
                  }
                  className={cn("group min-w-0 rounded-lg", clickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus")}
                >
                  {renderCard!(row.original, cardParts(row))}
                </li>
              ))}
            </ul>
          )}
          {loading && <span className="sr-only" role="status">{t.loading}</span>}
        </div>
      ) : (

      <div ref={scrollRef} className={cn("overflow-auto rounded-lg border border-border bg-surface", className)}>
        <table
          className={cn("border-collapse text-sm", resizable ? "min-w-full table-fixed" : "w-full")}
          style={resizable ? { width: table.getTotalSize() } : undefined}
          aria-label={caption ? undefined : ariaLabel}
          aria-busy={loading || undefined}
        >
          {caption && <caption className={cn("px-4 py-3 text-left font-semibold text-fg", !showCaption && "sr-only")}>{caption}</caption>}
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const column = header.column;
                  const meta = column.columnDef.meta;
                  const canSort = column.getCanSort();
                  const sorted = column.getIsSorted();
                  const canResize = resizable && !header.isPlaceholder && header.subHeaders.length === 0 && meta?.resizable !== false;
                  return (
                    <th
                      key={header.id}
                      colSpan={header.colSpan}
                      scope="col"
                      aria-sort={canSort ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
                      style={resizable ? { width: header.getSize() } : undefined}
                      className={cn(
                        "whitespace-nowrap border-b border-border bg-surface-muted px-3 py-2.5 text-xs font-semibold text-fg-muted",
                        ALIGN[meta?.align ?? "start"],
                        stickyHeader ? "sticky top-0 z-10" : resizable && "relative",
                        stickyCell(meta?.sticky, "z-20"),
                        resizable && "overflow-hidden text-ellipsis",
                        meta?.headerClassName,
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-sm hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                            meta?.align === "end" && "flex-row-reverse",
                            sorted && "text-fg",
                          )}
                        >
                          <table.FlexRender header={header} />
                          {sorted === "asc" ? (
                            <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
                          ) : sorted === "desc" ? (
                            <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronsUpDown aria-hidden="true" className="h-3.5 w-3.5 text-fg-subtle" />
                          )}
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                      {canResize && (
                        <ResizeHandle
                          label={fill(t.resizeColumn, { label: columnLabel(column) })}
                          size={column.getSize()}
                          min={column.columnDef.minSize ?? 20}
                          max={column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER}
                          onResize={(size) => table.setColumnSizing((prev) => ({ ...prev, [column.id]: size }))}
                          onReset={() => column.resetSize()}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: loadingRows }, (_, r) => (
                <tr key={`sk-${r}`} className="border-b border-border last:border-b-0">
                  {Array.from({ length: colCount }, (_, c) => (
                    <td key={c} className="px-3 py-3">
                      <Skeleton className="h-4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="p-0">
                  <div className="sticky left-0" style={viewWidth ? { width: viewWidth } : undefined}>
                    {noResults ? (
                      <EmptyState illustration="no-results" illustrationSize="sm" title={t.noResultsTitle} description={t.noResultsDescription} action={canClear ? clearButton : undefined} />
                    ) : (
                      <EmptyState illustration="empty" illustrationSize="sm" title={emptyTitle ?? t.emptyTitle} description={emptyDescription} action={emptyAction} />
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  data-selected={row.getIsSelected() || undefined}
                  aria-selected={selectable ? row.getIsSelected() : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? (e) => activate(row.original, e) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
                            e.preventDefault();
                            onRowClick?.(row.original);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    "group border-b border-border last:border-b-0 hover:bg-surface-muted",
                    "data-[selected]:bg-primary-subtle data-[selected]:hover:bg-primary-subtle",
                    clickable && "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
                  )}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-3 py-3 text-fg",
                          !meta?.wrap && "whitespace-nowrap",
                          resizable && !meta?.wrap && "overflow-hidden text-ellipsis",
                          ALIGN[meta?.align ?? "start"],
                          meta?.align === "end" && "tabular-nums",
                          // Ô dính cần nền đặc (để nội dung cuộn chui xuống dưới) và phải theo màu hover/chọn của dòng.
                          meta?.sticky && cn(stickyCell(meta.sticky, "z-[1]"), "bg-surface group-hover:bg-surface-muted group-data-[selected]:bg-primary-subtle"),
                          meta?.cellClassName,
                        )}
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
        {loading && <span className="sr-only" role="status">{t.loading}</span>}
      </div>
      )}

      {pagination !== false && !loading && totalRows > 0 && (
        <Pagination
          pageIndex={pageState.pageIndex}
          pageSize={pageState.pageSize}
          rowCount={totalRows}
          onPageChange={(i) => table.setPageIndex(i)}
          onPageSizeChange={(s) => table.setPageSize(s)}
          {...(pagination.pageSizeOptions ? { pageSizeOptions: pagination.pageSizeOptions } : {})}
        />
      )}
      {selectable && selectionActions && selectedRows.length > 0 && typeof document !== "undefined" &&
        createPortal(
          // Nổi ở giữa đáy màn hình, trên mọi thứ của trang (z-50; popup mở sau nằm đè lên vì đứng sau trong DOM).
          <div
            role="toolbar"
            aria-label={t.selectionToolbar}
            data-slot="selection-bar"
            className="fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface py-2 pl-4 pr-2 text-fg shadow-lg motion-safe:animate-pop-in"
          >
            <span className="text-sm font-medium tabular-nums">{fill(t.selectedCount, { n: selectedRows.length })}</span>
            <span aria-hidden="true" className="h-5 w-px bg-border" />
            {selectionActions(selectedRows, () => table.resetRowSelection(true))}
            <Button variant="ghost" size="icon-sm" aria-label={t.clearSelection} title={t.clearSelection} onClick={() => table.resetRowSelection(true)} className="h-8 w-8">
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>,
          document.body,
        )}
    </div>
  );
}
