"use client";
// Nhóm 8 – Danh sách hàng: bảng các dòng + panel chi tiết dòng (phần người khai nhập sửa được, phần Hải quan tính chỉ đọc).
import { Badge, createDataTableColumnHelper, DataTable, Dialog, DialogContent, fill, Stack, useMessages } from "@kb/ui";
import type { DeclarationLayout } from "@kb/contracts";
import { Package } from "lucide-react";
import { useState, type ReactNode } from "react";
import { BlockView } from "./block-view";
import { displayValue } from "./display";
import { FORM_MESSAGES } from "./form.messages";
import { conditionContext, itemProgress, type FormValues } from "./form-state";

type Row = { index: number; values: FormValues };
const col = createDataTableColumnHelper<Row>();

type Props = {
  layout: DeclarationLayout;
  items: FormValues[];
  /** Không truyền → dòng hàng chỉ đọc (tờ khai đã đăng ký). */
  onItemChange?: ((index: number, key: string, value: string) => void) | undefined;
  /** Thao tác ở đầu panel chi tiết dòng (tờ khai của hồ sơ: sửa số liệu chứng từ ở OCR, chọn mã HS). */
  actions?: ((index: number) => ReactNode) | undefined;
  showInapplicable: boolean;
};

export function ItemsSection({ layout, items, onItemChange, actions, showInapplicable }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const t = useMessages(FORM_MESSAGES);
  const kind = layout.kind;
  const fields = layout.item.declarant.flatMap((b) => b.items).flatMap((it) => (it.kind === "field" ? [it] : it.fields));
  const labelOf = (key: string) => fields.find((f) => f.key === key);
  const columns = col.columns([
    col.display({ id: "stt", header: "#", size: 48, meta: { align: "center" }, cell: (c) => String(c.row.original.index + 1).padStart(2, "0") }),
    ...layout.item.columns.map((key) => {
      const f = labelOf(key);
      return col.display({
        id: key,
        header: f ? `${f.no ? `${f.no} ` : ""}${f.label}` : key,
        ...(key === "HAG_CMN" ? { size: 280, meta: { wrap: true } } : {}),
        cell: (c) => (f ? displayValue(f, c.row.original.values[key] ?? "") : c.row.original.values[key] ?? "") || "—",
      });
    }),
    col.display({
      id: "trang-thai", header: t.status,
      cell: (c) => {
        const missing = itemProgress(kind, layout, c.row.original.values).missing;
        return missing ? <Badge tone="warning">{fill(t.missingCells, { n: missing })}</Badge> : <Badge tone="success">{t.complete}</Badge>;
      },
    }),
  ]);
  const rows = items.map((values, index) => ({ index, values }));
  const current = open === null ? null : items[open];
  return (
    <Stack gap="sm">
      <p className="text-sm text-fg-muted">{fill(onItemChange ? t.itemsIntroEdit : t.itemsIntroView, { n: items.length })}</p>
      <DataTable aria-label={t.itemsAria} columns={columns} data={rows} getRowId={(r) => String(r.index)} onRowClick={(r) => setOpen(r.index)} />
      <Dialog open={current !== null && current !== undefined} onOpenChange={(o) => !o && setOpen(null)} defaultPresentation="panel">
        {current && open !== null && (
          <DialogContent title={`${fill(t.lineN, { n: open + 1 })}${current["HAG_CMD"] ? ` · HS ${current["HAG_CMD"]}` : ""}`} icon={<Package className="h-4 w-4" />} description={t.lineDesc} size="lg">
            <Stack gap="md">
              {actions?.(open)}
              {layout.item.declarant.map((b) => (
                <BlockView key={b.id} kind={kind} block={b} values={current} onChange={onItemChange && ((k, v) => onItemChange(open, k, v))} ctx={conditionContext(kind, current)} showInapplicable={showInapplicable} compactable />
              ))}
              {layout.item.customs.map((b) => (
                <BlockView key={b.id} kind={kind} block={b} values={current} ctx={conditionContext(kind, current)} showInapplicable={showInapplicable} />
              ))}
            </Stack>
          </DialogContent>
        )}
      </Dialog>
    </Stack>
  );
}
