"use client";
// Khối "Chỉ tiêu khác (không có trên mẫu in)": ô người khai nhập đang áp dụng mà mẫu in không có chỗ, nhóm theo khối Phụ lục II
// (phần tờ khai, rồi "Dòng hàng n" nhóm theo khối của dòng hàng) – bấm được như ô trên trang. Không nằm trong PaperStack → không in.
import { Disclosure, Grid, Stack } from "@kb/ui";
import { useMemo } from "react";
import type { FormValues } from "../declaration-form/form-state";
import { PrintCell, type CellLook } from "./print-cell";
import { fieldLocator, otherFieldGroups, type OtherGroup, type PrintTarget } from "./print-state";

type Props = {
  kind: "IDA" | "EDA";
  decl: FormValues;
  items: FormValues[];
  look: (key: string, line?: number) => CellLook;
  selected: PrintTarget | null;
  /** Phải ổn định (useCallback). */
  onSelect: (key: string, line?: number) => void;
};

export function OtherFields({ kind, decl, items, look, selected, onSelect }: Props) {
  const groups = useMemo(() => otherFieldGroups(kind, decl, items), [kind, decl, items]);
  const all: [OtherGroup, number | undefined][] = [...groups.decl.map((g) => [g, undefined] as [OtherGroup, undefined]), ...groups.items.flatMap((gs, line) => gs.map((g) => [g, line] as [OtherGroup, number]))];
  const count = all.reduce((n, [g]) => n + g.keys.length, 0);
  if (count === 0) return null;
  const loc = fieldLocator(kind);
  const open = all.some(([g, line]) => g.keys.some((k) => ["error", "missing"].includes(look(k, line).state)));

  const group = (g: OtherGroup, line: number | undefined, heading: "h3" | "h4") => {
    const Heading = heading;
    return (
      <Stack key={g.id} gap="xs">
        <Heading className="text-xs font-semibold text-fg-muted">{g.title}</Heading>
        <Grid cols={12} gap="none">
          {g.keys.map((key) => {
            const l = look(key, line);
            return (
              <PrintCell
                key={key}
                kind={kind}
                cellKey={key}
                label={loc.get(key)?.field.label ?? key}
                span={6}
                line={line}
                raw={l.raw}
                state={l.state}
                compareTo={l.compareTo}
                selected={selected?.key === key && selected.line === line}
                onSelect={onSelect}
              />
            );
          })}
        </Grid>
      </Stack>
    );
  };

  return (
    <Disclosure title="Chỉ tiêu khác (không có trên mẫu in)" meta={`${count} ô`} defaultOpen={open}>
      <Stack gap="md">
        {groups.decl.map((g) => group(g, undefined, "h3"))}
        {groups.items.map((gs, line) =>
          gs.length > 0 ? (
            <Stack key={`dong-${line}`} gap="sm">
              <h3 className="text-sm font-semibold text-fg">Dòng hàng {line + 1}</h3>
              {gs.map((g) => group(g, line, "h4"))}
            </Stack>
          ) : null,
        )}
      </Stack>
    </Disclosure>
  );
}
