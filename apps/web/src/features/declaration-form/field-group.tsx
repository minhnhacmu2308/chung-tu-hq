"use client";
// Chỉ tiêu nhiều ô con nằm ngang (địa chỉ 4 dòng, tổng trị giá hóa đơn 4 ô…): một nhãn chung "số · tên", vai trò, hướng dẫn.
import { cn } from "@kb/ui";
import { DECLARATION_CONDITIONS, fieldRole, type ConditionContext, type LayoutGroup } from "@kb/contracts";
import { fieldTitle } from "./display";
import { FormField, GuideButton, RoleBadge } from "./field";
import { isApplicable, type FormValues } from "./form-state";

type Props = {
  kind: "IDA" | "EDA";
  group: LayoutGroup;
  values: FormValues;
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
};

export function FormFieldGroup({ kind, group, values, onChange, ctx, showInapplicable }: Props) {
  const applicable = isApplicable(group, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || group.fields.every((f) => f.origin === "CUSTOMS");
  const condition = group.condition ? DECLARATION_CONDITIONS[group.condition].label : undefined;
  const first = group.fields[0];
  return (
    <fieldset className={cn("col-span-full flex min-w-0 flex-col gap-2 rounded-md border border-border px-3 pb-3 pt-1", !applicable && "opacity-60")}>
      <legend className="px-1 text-xs font-medium text-fg-muted">{fieldTitle(group.no, group.label)}</legend>
      {!readOnly && first && (
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={fieldRole(kind, first, group.no)} />
          <GuideButton kind={kind} no={group.no} />
          {condition && <span className="text-xs text-fg-subtle">{applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`}</span>}
        </div>
      )}
      <div className="flex flex-wrap items-start gap-3">
        {group.fields.map((f) => (
          <FormField key={f.key} kind={kind} field={f} values={values} onChange={readOnly ? undefined : onChange} ctx={ctx} showInapplicable={showInapplicable} parentNo={group.no} parentCondition={group.condition} compact />
        ))}
      </div>
    </fieldset>
  );
}
