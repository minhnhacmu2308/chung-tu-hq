"use client";
// Danh sách hàng hóa trên chứng từ (có thể tới hàng trăm dòng): bảng chung DataTable – tìm kiếm, lọc nhanh "Cần kiểm tra",
// chọn nhiều dòng để xác nhận một lần, phân trang (bấm vị trí trên chứng từ → tự sang trang chứa dòng đó), header dính. Mỗi ô sửa trực tiếp như trường thường (ô nào chứng từ
// không có thì để trống); Enter lưu và xuống ô cùng cột ở dòng dưới như bảng tính. Rê vào dòng → tô vị trí trên chứng từ.
// Sửa xong, dòng hàng của tờ khai nháp cập nhật theo.
import {
  Alert, Button, cn, Combobox, createDataTableColumnHelper, DataTable, fill, Input, SegmentedControl, Textarea, Tooltip, useMessages, type ComboboxOption,
} from "@kb/ui";
import { identicalLineGroups } from "@kb/contracts";
import { Check, CheckCheck, CheckCircle2, Merge, Split } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { isSuspect } from "@/api/ocr";
import { useCodeLists } from "@/features/declaration-form/use-code-list";
import { formatMoney } from "@/lib/format";
import { fromMinor, toMinor } from "@/lib/decimal";
import type { ExtractedField } from "@/mocks/types";
import { fieldDomId } from "./field-row";
import { ITEMS_TABLE_MESSAGES } from "./ocr.messages";

type Cell = "description" | "quantity" | "unit" | "unit_price" | "amount" | "origin";
const CELLS: readonly Cell[] = ["description", "quantity", "unit", "unit_price", "amount", "origin"];

/** Một dòng hàng: giá trị chuỗi theo cột (cho tìm kiếm) + trường gốc của từng ô. */
type Line = Record<Cell, string> & {
  id: string;
  n: number;
  cells: Partial<Record<Cell, ExtractedField>>;
  /** Các ô AI chưa chắc / lệch – cần người xác nhận. */
  suspects: ExtractedField[];
  confirmed: boolean;
};

/**
 * Bề rộng đặt trên ô nhập (trình duyệt bỏ qua bề rộng của ô bảng): ô số cố định, mô tả tối thiểu 16rem và nhận hết chỗ còn lại;
 * khung hẹp thì bảng cuộn ngang thay vì bóp mô tả.
 */
const MIN_WIDTH: Record<Cell, string> = {
  description: "min-w-64",
  quantity: "w-28",
  unit: "w-20",
  unit_price: "w-28",
  amount: "w-32",
  origin: "w-40",
};

/** Ô xuất xứ của dòng hàng trống (hóa đơn không ghi) – bắt buộc chọn trước khi sang bước sau. */
export const isMissingOrigin = (f: ExtractedField) => /^item\.\d+\.origin$/.test(f.key) && !f.value.trim();

const col = createDataTableColumnHelper<Line>();
const inputId = (f: ExtractedField) => `${fieldDomId(f.id)}-input`;

function CellInput({
  field,
  multiline,
  numeric,
  onSave,
  onActivate,
  onNext,
}: {
  field: ExtractedField;
  multiline?: boolean;
  numeric?: boolean;
  onSave: (id: string, value: string) => void;
  onActivate: (id: string | null) => void;
  /** Enter: sang ô cùng cột ở dòng dưới. */
  onNext: () => void;
}) {
  const width = MIN_WIDTH[field.key.split(".")[2] as Cell];
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  const commit = () => value.trim() !== field.value && onSave(field.id, value);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // Shift+Enter trong ô mô tả = xuống dòng trong ô.
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    commit();
    onNext();
  };
  const common = {
    id: inputId(field),
    "aria-label": field.label,
    value,
    onBlur: commit,
    onFocus: () => onActivate(field.id),
    onKeyDown,
  };
  return multiline ? (
    // Cao theo nội dung (mô tả dài tự xuống dòng, không bị cắt), tối thiểu một dòng.
    <Textarea {...common} rows={1} className={cn("field-sizing-content min-h-8 resize-none px-2 py-1.5 text-sm", width)} onChange={(e) => setValue(e.target.value)} />
  ) : (
    <Input {...common} className={cn("h-8 px-2 text-sm", width, numeric && "text-right tabular-nums")} onChange={(e) => setValue(e.target.value)} />
  );
}

/** Tham chiếu tới dữ liệu / hàm mới nhất – cột của bảng giữ nguyên giữa các lần lưu, ô đang gõ không bị dựng lại (mất focus). */
type Live = {
  rows: Line[];
  onSave: (id: string, value: string) => void;
  onActivate: (id: string | null) => void;
  countries: ComboboxOption[];
  choose: string;
};

/** Xuất xứ chọn từ danh mục nước (COUNTRY); giá trị cũ ngoài danh mục vẫn hiện để không mất. */
function OriginCell({ line, live }: { line: Line; live: RefObject<Live> }) {
  const f = line.cells.origin;
  if (!f) return null;
  const { countries, choose } = live.current;
  const options = f.value && !countries.some((o) => o.value === f.value) ? [{ value: f.value, label: f.value }, ...countries] : countries;
  return (
    <div id={fieldDomId(f.id)} className={MIN_WIDTH.origin} onFocus={() => live.current.onActivate(f.id)}>
      <Combobox
        id={inputId(f)}
        aria-label={f.label}
        aria-invalid={!f.value.trim()}
        required
        options={options}
        value={f.value || null}
        onChange={(v) => v && v !== f.value && live.current.onSave(f.id, v)}
        placeholder={choose}
      />
    </div>
  );
}

function EditorCell({ line, c, live, multiline, numeric }: { line: Line; c: Cell; live: RefObject<Live>; multiline?: boolean; numeric?: boolean }) {
  const f = line.cells[c];
  if (!f) return null;
  const next = () => {
    const rows = live.current.rows;
    const i = rows.findIndex((l) => l.id === line.id);
    const below = rows.slice(i + 1).find((l) => l.cells[c])?.cells[c];
    if (below) document.getElementById(inputId(below))?.focus();
  };
  return (
    <div id={fieldDomId(f.id)}>
      <CellInput
        field={f}
        {...(multiline ? { multiline } : {})}
        {...(numeric ? { numeric } : {})}
        onSave={(id, v) => live.current.onSave(id, v)}
        onActivate={(id) => live.current.onActivate(id)}
        onNext={next}
      />
    </div>
  );
}

/** Gộp dòng hàng giống nhau (cờ của hồ sơ): `merged` = đã gộp; đổi cờ → máy chủ dựng lại dòng hàng. */
export type LineMerge = { merged: boolean; busy: boolean; onChange: (merged: boolean) => void };

export function ItemsTable({
  fields,
  activeId,
  onActivate,
  onSave,
  onConfirm,
  merge,
}: {
  fields: ExtractedField[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onSave: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
  merge?: LineMerge;
}) {
  const t = useMessages(ITEMS_TABLE_MESSAGES);
  const [show, setShow] = useState<"all" | "suspect">("all");
  const codes = useCodeLists(["COUNTRY"] as const);
  const countries = useMemo(() => (codes.lists.COUNTRY ?? []).filter((e) => !e.inactive).map((e) => ({ value: e.code, label: `${e.code} – ${e.name}` })), [codes.lists.COUNTRY]);

  const lines = useMemo<Line[]>(() => {
    const byLine = new Map<number, Partial<Record<Cell, ExtractedField>>>();
    for (const f of fields) {
      const [, n, c] = f.key.split(".");
      if (!CELLS.includes(c as Cell)) continue;
      const cells = byLine.get(Number(n)) ?? {};
      cells[c as Cell] = f;
      byLine.set(Number(n), cells);
    }
    return [...byLine.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, cells]) => {
        const list = CELLS.flatMap((c) => (cells[c] ? [cells[c]] : []));
        return {
          id: String(n),
          n,
          cells,
          suspects: list.filter((f) => isSuspect(f.status)),
          confirmed: list.some((f) => f.status === "USER_CONFIRMED"),
          ...(Object.fromEntries(CELLS.map((c) => [c, cells[c]?.value ?? ""])) as Record<Cell, string>),
        };
      });
  }, [fields]);

  const suspectCount = lines.filter((l) => l.suspects.length > 0).length;
  // Nhóm dòng cùng tên, ĐVT, đơn giá, xuất xứ (và HS trên invoice) – đề xuất gộp thành một dòng (cùng quy tắc với máy chủ).
  const groups = useMemo(() => {
    const extra = (k: string) => new Map(fields.filter((f) => f.key.endsWith(`.${k}`) && /^item\.\d+\./.test(f.key)).map((f) => [f.key.split(".")[1], f.value]));
    const hs = extra("hs_on_invoice");
    const part = extra("part_no");
    return identicalLineGroups(lines.map((l) => ({ lineNo: l.n, description: l.description, unit: l.unit, unitPrice: l.unit_price, origin: l.origin, hs: hs.get(String(l.n)) ?? null, partNo: part.get(String(l.n)) ?? null })));
  }, [fields, lines]);
  // Hết dòng cần kiểm tra thì quay về "Tất cả" (không để bảng trống).
  const mode = suspectCount === 0 ? "all" : show;
  const rows = mode === "suspect" ? lines.filter((l) => l.suspects.length > 0) : lines;
  const total = fromMinor(lines.reduce((sum, l) => sum + toMinor(l.amount || "0"), 0));
  const notes = fields.filter((f) => isSuspect(f.status) && f.note);

  const confirmLines = (picked: Line[]) => picked.forEach((l) => l.suspects.forEach((f) => onConfirm(f.id)));

  const live = useRef<Live>({ rows, onSave, onActivate, countries, choose: t.chooseOrigin });
  live.current = { rows, onSave, onActivate, countries, choose: t.chooseOrigin };
  const confirmRef = useRef(confirmLines);
  confirmRef.current = confirmLines;

  const columns = useMemo(() => {
    const editor = (c: Cell, opts: { multiline?: boolean; numeric?: boolean } = {}) =>
      ({ row }: { row: { original: Line } }) => <EditorCell line={row.original} c={c} live={live} {...opts} />;
    return col.columns([
      col.accessor("n", { header: "#", size: 48, meta: { hideable: false, cellClassName: "py-2 text-fg-muted tabular-nums" } }),
      col.accessor("description", { header: t.description, size: 320, minSize: 220, meta: { wrap: true, hideable: false, cellClassName: "py-2" }, cell: editor("description", { multiline: true }) }),
      col.accessor("quantity", { header: t.quantity, size: 104, meta: { align: "end", cellClassName: "py-2" }, cell: editor("quantity", { numeric: true }) }),
      col.accessor("unit", { header: t.unit, size: 80, meta: { cellClassName: "py-2" }, cell: editor("unit") }),
      col.accessor("unit_price", { header: t.unitPrice, size: 120, meta: { align: "end", cellClassName: "py-2" }, cell: editor("unit_price", { numeric: true }) }),
      col.accessor("amount", { header: t.amount, size: 136, meta: { align: "end", cellClassName: "py-2" }, cell: editor("amount", { numeric: true }) }),
      col.accessor("origin", { header: t.origin, size: 184, meta: { cellClassName: "py-2" }, cell: ({ row }) => <OriginCell line={row.original} live={live} /> }),
      col.display({
        id: "status",
        header: () => <span className="sr-only">{t.status}</span>,
        size: 56,
        meta: { label: t.status, hideable: false, align: "center", cellClassName: "py-2" },
        cell: ({ row }) => {
          const l = row.original;
          if (l.suspects.length > 0) {
            return (
              <Tooltip content={t.confirmRow}>
                <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={fill(t.confirmRowN, { n: l.n })} onClick={() => confirmRef.current([l])}>
                  <Check className="h-4 w-4" />
                </Button>
              </Tooltip>
            );
          }
          const label = l.confirmed ? t.confirmed : t.checked;
          return (
            <span className="inline-flex text-success-subtle-fg" title={label}>
              <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only">{label}</span>
            </span>
          );
        },
      }),
    ]);
  }, [t]);

  return (
    <div className="flex flex-col gap-2">
      {merge && groups.length > 0 && !merge.merged && (
        <Alert
          tone="info"
          title={fill(t.mergeTitle, { n: groups.length })}
          action={
            <Button size="sm" leftIcon={<Merge className="h-4 w-4" />} loading={merge.busy} onClick={() => merge.onChange(true)}>
              {t.mergeAction}
            </Button>
          }
        >
          {groups.map((g) => fill(t.mergeGroup, { lines: g.join(", ") })).join(" · ")}
        </Alert>
      )}
      {merge?.merged && (
        <Alert
          tone="info"
          title={t.mergedTitle}
          action={
            <Button size="sm" variant="secondary" leftIcon={<Split className="h-4 w-4" />} loading={merge.busy} onClick={() => merge.onChange(false)}>
              {t.splitAction}
            </Button>
          }
        >
          {t.mergedDesc}
        </Alert>
      )}
      <DataTable
        aria-label={t.caption}
        caption={t.caption}
        columns={columns}
        data={rows}
        getRowId={(l) => l.id}
        rowLabel={(l) => fill(t.lineN, { n: l.n })}
        searchable
        columnToggle
        selectable={suspectCount > 0}
        selectionActions={(picked, clear) => {
          const todo = picked.filter((l) => l.suspects.length > 0);
          return (
            <Button size="sm" leftIcon={<CheckCheck className="h-4 w-4" />} disabled={todo.length === 0} onClick={() => { confirmLines(todo); clear(); }}>
              {fill(t.confirmLines, { n: todo.length })}
            </Button>
          );
        }}
        rowTone={(l) => (CELLS.some((c) => l.cells[c]?.id === activeId) ? "active" : l.suspects.length > 0 || (l.cells.origin && isMissingOrigin(l.cells.origin)) ? "warning" : undefined)}
        onRowHover={(l) => onActivate(l ? ((l.suspects[0] ?? l.cells.description ?? l.cells.amount)?.id ?? null) : null)}
        pagination={{ initialPageSize: 20, pageSizeOptions: [20, 50, 100] }}
        revealRowId={lines.find((l) => CELLS.some((c) => l.cells[c]?.id === activeId))?.id ?? null}
        className="max-h-176"
        emptyTitle={t.empty}
        labels={{ searchPlaceholder: t.search }}
        toolbarActions={
          suspectCount > 0 ? (
            <SegmentedControl
              label={t.show}
              hideLabel
              value={mode}
              onChange={setShow}
              options={[
                { value: "all", label: fill(t.showAll, { n: lines.length }) },
                { value: "suspect", label: fill(t.showSuspect, { n: suspectCount }) },
              ]}
            />
          ) : undefined
        }
      />
      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-1 px-1 text-sm">
        <span className="text-xs text-fg-muted">{fill(t.total, { n: lines.length })}</span>
        <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
      </div>
      {notes.map((f) => (
        <p key={f.id} className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{f.label}:</span> {f.note}
        </p>
      ))}
    </div>
  );
}
