"use client";
// Danh sách hàng hóa trên chứng từ: mỗi dòng mô tả, số lượng, ĐVT, đơn giá, thành tiền, xuất xứ – sửa trực tiếp như trường thường
// (ô nào chứng từ không có thì để trống). Sửa xong, dòng hàng của tờ khai nháp cập nhật theo.
import { Button, cn, fill, Input, Tooltip, useMessages } from "@kb/ui";
import { Check, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSuspect } from "@/api/ocr";
import { formatMoney } from "@/lib/format";
import type { ExtractedField } from "@/mocks/types";
import { fieldDomId } from "./field-row";
import { ITEMS_TABLE_MESSAGES } from "./ocr.messages";

type Cell = "description" | "quantity" | "unit" | "unit_price" | "amount" | "origin";
// Bề rộng tối thiểu đặt trên ô nhập (trình duyệt bỏ qua min-width của ô bảng): khung hẹp thì bảng cuộn ngang, không cắt mất giá trị.
const COLS: { key: Cell; label: "description" | "quantity" | "unit" | "unitPrice" | "amount" | "origin"; input: string; numeric?: boolean }[] = [
  { key: "description", label: "description", input: "min-w-36" },
  { key: "quantity", label: "quantity", input: "min-w-20" },
  { key: "unit", label: "unit", input: "min-w-14" },
  { key: "unit_price", label: "unitPrice", input: "min-w-20", numeric: true },
  { key: "amount", label: "amount", input: "min-w-24", numeric: true },
  { key: "origin", label: "origin", input: "min-w-12" },
];
const AMOUNT_COL = COLS.findIndex((c) => c.key === "amount");

function CellInput({
  field,
  className,
  onSave,
  onActivate,
}: {
  field: ExtractedField;
  className: string;
  onSave: (id: string, value: string) => void;
  onActivate: (id: string | null) => void;
}) {
  const [value, setValue] = useState(field.value);
  useEffect(() => setValue(field.value), [field.value]);
  const commit = () => value.trim() !== field.value && onSave(field.id, value);
  return (
    <Input
      id={`${fieldDomId(field.id)}-input`}
      aria-label={field.label}
      value={value}
      className={cn("h-8 px-2 text-sm", className, /\.(amount|unit_price)$/.test(field.key) && "text-right tabular-nums")}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onFocus={() => onActivate(field.id)}
      onKeyDown={(e) => e.key === "Enter" && commit()}
    />
  );
}

export function ItemsTable({
  fields,
  activeId,
  onActivate,
  onSave,
  onConfirm,
}: {
  fields: ExtractedField[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onSave: (id: string, value: string) => void;
  onConfirm: (id: string) => void;
}) {
  const lines = [...new Set(fields.map((f) => Number(f.key.split(".")[1])))].sort((a, b) => a - b);
  const get = (n: number, c: Cell) => fields.find((f) => f.key === `item.${n}.${c}`);
  const total = lines.reduce((sum, n) => sum + Number(get(n, "amount")?.value ?? 0), 0);
  const notes = fields.filter((f) => isSuspect(f.status) && f.note);
  const t = useMessages(ITEMS_TABLE_MESSAGES);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-x-auto rounded-md border border-border">
        {/* kb-allow-raw: lưới sửa trực tiếp từng ô + tô vị trí trên chứng từ khi rê vào ô; DataTable chưa hỗ trợ ô sửa được */}
        <table className="w-full text-sm">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="bg-surface-muted text-left text-xs text-fg-muted">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 font-medium">#</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className={cn("px-2 py-2 font-medium", c.numeric && "text-right")}>
                  {t[c.label]}
                </th>
              ))}
              <th scope="col" className="w-12 px-2 py-2 font-medium">
                <span className="sr-only">{t.status}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((n) => {
              const cells = COLS.map((c) => get(n, c.key));
              const suspectCell = cells.find((f) => f && isSuspect(f.status));
              const rowActive = cells.some((f) => f?.id === activeId);
              return (
                <tr
                  key={n}
                  className={cn(rowActive ? "bg-primary-subtle" : suspectCell ? "bg-warning-subtle" : undefined)}
                  onMouseEnter={() => onActivate((suspectCell ?? cells[0])?.id ?? null)}
                  onMouseLeave={() => onActivate(null)}
                >
                  <td className="px-2 py-1.5 text-fg-muted tabular-nums">{n}</td>
                  {cells.map((f, i) => (
                    <td key={COLS[i]!.key} id={f ? fieldDomId(f.id) : undefined} className="px-2 py-1.5">
                      {f ? <CellInput field={f} className={COLS[i]!.input} onSave={onSave} onActivate={onActivate} /> : null}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {suspectCell ? (
                      <Tooltip content={t.confirmRow}>
                        <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={fill(t.confirmRowN, { n })} onClick={() => onConfirm(suspectCell.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    ) : (
                      <span className="flex justify-center text-success-subtle-fg" title={cells.some((f) => f?.status === "USER_CONFIRMED") ? t.confirmed : t.checked}>
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">{cells.some((f) => f?.status === "USER_CONFIRMED") ? t.confirmed : t.checked}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <td colSpan={AMOUNT_COL + 1} className="px-2 py-2 text-right text-xs text-fg-muted">
                {fill(t.total, { n: lines.length })}
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatMoney(String(total))}</td>
              <td colSpan={COLS.length - AMOUNT_COL} />
            </tr>
          </tfoot>
        </table>
      </div>
      {notes.map((f) => (
        <p key={f.id} className="text-xs text-fg-muted">
          <span className="font-medium text-fg">{f.label}:</span> {f.note}
        </p>
      ))}
    </div>
  );
}
