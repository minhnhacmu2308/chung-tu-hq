"use client";
// Khối "Chỉ tiêu khác (không có trên mẫu in)": ô người khai nhập đang áp dụng mà mẫu in không có chỗ – bấm được như ô trên trang.
// Không nằm trong PaperStack → không in. Không có ô nào → không vẽ.
import { Disclosure, Grid, Stack } from "@kb/ui";
import type { ReactNode } from "react";
import type { FormValues } from "../declaration-form/form-state";
import { PrintCell, type CellLook } from "./print-cell";
import { fieldLocator, otherFieldCells, type PrintTarget } from "./print-state";

type Props = {
  kind: "IDA" | "EDA";
  decl: FormValues;
  items: FormValues[];
  look: (key: string, line?: number) => CellLook;
  selected: PrintTarget | null;
  onSelect: (t: PrintTarget) => void;
};

export function OtherFields({ kind, decl, items, look, selected, onSelect }: Props) {
  const cells = otherFieldCells(kind, decl, items);
  const count = cells.decl.length + cells.items.reduce((n, keys) => n + keys.length, 0);
  if (count === 0) return null;
  const loc = fieldLocator(kind);
  const needsWork = (key: string, line?: number) => {
    const s = look(key, line).state;
    return s === "error" || s === "missing";
  };
  const open = cells.decl.some((k) => needsWork(k)) || cells.items.some((keys, line) => keys.some((k) => needsWork(k, line)));

  const grid = (keys: string[], line: number | undefined): ReactNode => (
    <Grid cols={{ base: 1, md: 2 }} gap="none">
      {keys.map((key) => (
        <PrintCell
          key={key}
          kind={kind}
          cell={{ key, label: loc.get(key)?.field.label ?? key }}
          look={look(key, line)}
          selected={selected?.key === key && selected.line === line}
          onSelect={() => onSelect(line === undefined ? { key } : { key, line })}
          free
        />
      ))}
    </Grid>
  );

  return (
    <Disclosure title="Chỉ tiêu khác (không có trên mẫu in)" meta={`${count} ô`} defaultOpen={open}>
      <Stack gap="md">
        {cells.decl.length > 0 && grid(cells.decl, undefined)}
        {cells.items.map((keys, line) =>
          keys.length > 0 ? (
            <Stack key={line} gap="xs">
              <h3 className="text-xs font-semibold text-fg-muted">Dòng hàng {line + 1}</h3>
              {grid(keys, line)}
            </Stack>
          ) : null,
        )}
      </Stack>
    </Disclosure>
  );
}
