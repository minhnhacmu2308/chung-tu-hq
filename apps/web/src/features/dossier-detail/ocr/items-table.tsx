"use client";
// Danh sách hàng hóa trên chứng từ: mỗi dòng 3 trường (mô tả, số lượng, thành tiền), sửa trực tiếp như trường thường.
import { Button, cn, Input, Tooltip } from "@kb/ui";
import { Check, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSuspect } from "@/api/ocr";
import { formatMoney } from "@/lib/format";
import type { ExtractedField } from "@/mocks/types";
import { fieldDomId } from "./field-row";

type Cell = "description" | "quantity" | "amount";
const COLS: { key: Cell; label: string; className: string }[] = [
  { key: "description", label: "Mô tả hàng hóa", className: "min-w-48" },
  { key: "quantity", label: "Số lượng", className: "w-28 min-w-24" },
  { key: "amount", label: "Thành tiền (USD)", className: "w-28 min-w-24" },
];

function CellInput({
  field,
  onSave,
  onActivate,
}: {
  field: ExtractedField;
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
      className={cn("h-8 text-sm", field.key.endsWith("amount") && "text-right tabular-nums")}
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

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <caption className="sr-only">Danh sách hàng hóa</caption>
          <thead className="bg-surface-muted text-left text-xs text-fg-muted">
            <tr>
              <th scope="col" className="w-10 px-2 py-2 font-medium">#</th>
              {COLS.map((c) => (
                <th key={c.key} scope="col" className={cn("px-2 py-2 font-medium", c.className, c.key === "amount" && "text-right")}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className="w-12 px-2 py-2 font-medium">
                <span className="sr-only">Trạng thái</span>
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
                      {f ? <CellInput field={f} onSave={onSave} onActivate={onActivate} /> : null}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {suspectCell ? (
                      <Tooltip content="Xác nhận dòng này đúng">
                        <Button size="icon" variant="secondary" className="h-8 w-8" aria-label={`Xác nhận dòng ${n} đúng`} onClick={() => onConfirm(suspectCell.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                      </Tooltip>
                    ) : (
                      <span className="flex justify-center text-success-subtle-fg" title={cells.some((f) => f?.status === "USER_CONFIRMED") ? "Đã xác nhận" : "Đã đối chiếu"}>
                        <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                        <span className="sr-only">{cells.some((f) => f?.status === "USER_CONFIRMED") ? "Đã xác nhận" : "Đã đối chiếu"}</span>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border-strong">
              <td colSpan={3} className="px-2 py-2 text-right text-xs text-fg-muted">
                Cộng {lines.length} dòng
              </td>
              <td className="px-2 py-2 text-right font-semibold tabular-nums">{formatMoney(String(total))}</td>
              <td />
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
