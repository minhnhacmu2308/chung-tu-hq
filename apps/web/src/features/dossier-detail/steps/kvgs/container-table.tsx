"use client";
// Bảng danh sách container (V5ContainerReq): sửa trực tiếp từng ô như bảng hàng hóa của bước đọc chứng từ (ocr/items-table.tsx) –
// DataTable + Input trong ô; kiểm trên dòng (checkContainerList: ISO 6346, seal bắt buộc, trùng) tô ô lỗi kèm chữ; dòng Hải quan
// từ chối (errorList theo dòng) tô nền cảnh báo; ⓘ nguồn OCR (vận đơn, trang). Xóa dòng qua RowActions + hộp xác nhận ở thẻ.
import { cn, createDataTableColumnHelper, DataTable, fill, Input, pickMessages, RowActions, Tooltip, useUiLocale } from "@kb/ui";
import type { ContainerListIssue, ContainerListRow } from "@kb/contracts";
import { Info, Trash2 } from "lucide-react";
import { useMemo, useRef, type ReactNode, type RefObject } from "react";
import { KVGS_MESSAGES } from "./kvgs.messages";

export type EditRow = ContainerListRow & { key: string; n: number };
type Field = "billNo" | "containerNo" | "sealNo" | "note";
type Text = Record<keyof (typeof KVGS_MESSAGES)["vi"], string>;

const WIDTH: Record<Field, string> = { billNo: "min-w-40", containerNo: "w-36", sealNo: "w-32", note: "min-w-48" };
const COL_KEY = { billNo: "colBill", containerNo: "colContainer", sealNo: "colSeal", note: "colNote" } as const satisfies Record<Field, keyof Text>;
const PH_KEY = { billNo: "phBill", containerNo: "phContainer", sealNo: "phSeal", note: "phNote" } as const satisfies Record<Field, keyof Text>;

/** Ô của bảng: id ổn định để thẻ đưa focus tới ô lỗi; mô tả lỗi gắn qua aria-describedby. */
export const cellDomId = (key: string, field: Field) => `kvgs-cell-${key}-${field}`;

type Live = {
  issues: ContainerListIssue[];
  onChange: (key: string, field: Field, value: string) => void;
};

function issueText(t: Text, i: ContainerListIssue): string {
  return t[`issue${i.code}`];
}

function CellEditor({ row, field, live, t }: { row: EditRow; field: Field; live: RefObject<Live>; t: Text }) {
  const issue = live.current.issues.find((i) => i.row === row.n && i.field === field);
  const id = cellDomId(row.key, field);
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        value={row[field]}
        placeholder={t[PH_KEY[field]]}
        aria-label={fill(t.cellAria, { col: t[COL_KEY[field]], n: row.n })}
        aria-invalid={issue ? true : undefined}
        {...(issue ? { "aria-describedby": `${id}-issue` } : {})}
        className={cn("h-8 px-2 text-sm", WIDTH[field], field !== "note" && "font-mono")}
        onChange={(e) => live.current.onChange(row.key, field, e.currentTarget.value)}
      />
      {issue && (
        <p id={`${id}-issue`} className="text-xs text-danger-subtle-fg">
          {issueText(t, issue)}
        </p>
      )}
    </div>
  );
}

const col = createDataTableColumnHelper<EditRow>();

export function ContainerTable({
  rows, editable, issues, errorLines, onChange, onRemove, toolbarActions, emptyAction,
}: {
  rows: EditRow[];
  editable: boolean;
  issues: ContainerListIssue[];
  /** Dòng Hải quan báo lỗi (1-based). */
  errorLines: ReadonlySet<number>;
  onChange: (key: string, field: Field, value: string) => void;
  onRemove: (row: EditRow) => void;
  toolbarActions?: ReactNode;
  emptyAction?: ReactNode;
}) {
  // Bộ nhãn ổn định theo ngôn ngữ: cột chỉ dựng lại khi đổi ngôn ngữ / chế độ sửa – ô đang gõ không bị dựng lại (mất focus).
  const locale = useUiLocale();
  const t = useMemo(() => pickMessages(KVGS_MESSAGES, locale), [locale]);
  const live = useRef<Live>({ issues, onChange });
  live.current = { issues, onChange };
  const removeRef = useRef(onRemove);
  removeRef.current = onRemove;

  const columns = useMemo(() => {
    const cell = (field: Field) =>
      editable
        ? ({ row }: { row: { original: EditRow } }) => <CellEditor row={row.original} field={field} live={live} t={t} />
        : ({ row }: { row: { original: EditRow } }) => <span className={field === "note" ? "text-sm" : "font-mono text-sm"}>{row.original[field]}</span>;
    return col.columns([
      col.accessor("n", {
        header: "#",
        size: 56,
        meta: { hideable: false, cellClassName: "py-2 text-fg-muted tabular-nums" },
        cell: ({ row }) => {
          const r = row.original;
          if (r.source !== "OCR") return r.n;
          const label = r.sourcePage ? fill(t.sourceOcrPage, { page: r.sourcePage }) : t.sourceOcr;
          return (
            <span className="inline-flex items-center gap-1">
              {r.n}
              <Tooltip content={label}>
                <span tabIndex={0} className="inline-flex rounded-sm text-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <Info aria-hidden="true" className="h-3.5 w-3.5" />
                  <span className="sr-only">{label}</span>
                </span>
              </Tooltip>
            </span>
          );
        },
      }),
      col.accessor("billNo", { header: t.colBill, size: 200, meta: { hideable: false, cellClassName: "py-2" }, cell: cell("billNo") }),
      col.accessor("containerNo", { header: t.colContainer, size: 160, meta: { hideable: false, cellClassName: "py-2" }, cell: cell("containerNo") }),
      col.accessor("sealNo", { header: t.colSeal, size: 140, meta: { hideable: false, cellClassName: "py-2" }, cell: cell("sealNo") }),
      col.accessor("note", { header: t.colNote, size: 220, meta: { wrap: true, cellClassName: "py-2" }, cell: cell("note") }),
    ]);
  }, [t, editable]);

  return (
    <DataTable
      aria-label={t.tableCaption}
      caption={t.tableCaption}
      columns={columns}
      data={rows}
      getRowId={(r) => r.key}
      rowLabel={(r) => fill(t.rowLabel, { n: r.n })}
      rowTone={(r) => (errorLines.has(r.n) ? "warning" : undefined)}
      {...(editable
        ? {
            rowActions: (r: EditRow) => (
              <RowActions
                rowLabel={fill(t.rowLabel, { n: r.n })}
                actions={[{ id: "remove", label: t.removeRow, icon: <Trash2 />, tone: "danger", onSelect: () => removeRef.current(r) }]}
              />
            ),
          }
        : {})}
      emptyTitle={t.emptyTable}
      emptyDescription={t.emptyTableDesc}
      {...(emptyAction ? { emptyAction } : {})}
      {...(toolbarActions ? { toolbarActions } : {})}
    />
  );
}
