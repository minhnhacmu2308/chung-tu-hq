"use client";
// Nhóm lặp (5 vận đơn, 5 giấy phép, 5 khoản điều chỉnh, 10 chỉ thị, 50 container…): dòng có dữ liệu + dòng trống, nút "Thêm dòng".
import { Button, cn, Grid } from "@kb/ui";
import { expandRepeat, fieldRole, type ConditionContext, type LayoutRepeat } from "@kb/contracts";
import { Plus } from "lucide-react";
import { useState } from "react";
import { fieldTitle, visibleRows } from "./display";
import { FormField, GuideButton, RoleBadge } from "./field";
import { isApplicable, type FormValues } from "./form-state";

type Props = {
  kind: "IDA" | "EDA";
  repeat: LayoutRepeat;
  values: FormValues;
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
};

/** 50 số container: lưới thay vì từng dòng. */
const isGrid = (r: LayoutRepeat) => r.fields.length === 1 && r.count > 10;

export function FormFieldRepeat({ kind, repeat, values, onChange, ctx, showInapplicable }: Props) {
  const [extra, setExtra] = useState(0);
  const applicable = isApplicable(repeat, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || repeat.fields.every((f) => f.origin === "CUSTOMS");
  const rows = visibleRows(repeat, values, extra, readOnly);
  if (readOnly && rows.length === 0) return null;
  const all = expandRepeat(repeat);
  const indexOf = (key: string) => all.findIndex((r) => r[0]?.key === key) + 1;
  const first = repeat.fields[0];
  const field = (f: (typeof rows)[number][number]) => (
    <FormField key={f.key} kind={kind} field={f} values={values} onChange={readOnly ? undefined : onChange} ctx={ctx} showInapplicable={showInapplicable} parentNo={repeat.no ?? f.no} parentCondition={repeat.condition} compact={!f.no} />
  );
  return (
    <fieldset className={cn("col-span-full flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 pb-3 pt-1", !applicable && "opacity-60")}>
      <legend className="px-1 text-xs font-medium text-fg-muted">
        {fieldTitle(repeat.no, repeat.label)} <span className="font-normal text-fg-subtle">(tối đa {repeat.count})</span>
      </legend>
      {!readOnly && first && repeat.no && (
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={fieldRole(kind, first, repeat.no)} />
          <GuideButton kind={kind} no={repeat.no} />
        </div>
      )}
      {isGrid(repeat) ? (
        <Grid cols={{ base: 2, md: 4 }} gap="sm">
          {rows.map((row) => row.map(field))}
        </Grid>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row[0]!.key} className="flex flex-wrap items-start gap-3">
              <span className="w-6 pt-7 text-xs tabular-nums text-fg-subtle" aria-hidden="true">
                ({indexOf(row[0]!.key)})
              </span>
              {row.map(field)}
            </li>
          ))}
        </ol>
      )}
      {!readOnly && rows.length < repeat.count && (
        <Button size="sm" variant="ghost" className="self-start" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setExtra((n) => n + 1)}>
          Thêm dòng
        </Button>
      )}
    </fieldset>
  );
}
