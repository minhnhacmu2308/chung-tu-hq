"use client";
// Chỉ tiêu nhiều ô con nằm ngang (địa chỉ 4 dòng, tổng trị giá hóa đơn 4 ô…): một nhãn chung "số · tên" kèm dấu bắt buộc / chữ vai trò, nút ⓘ cuối hàng.
// Nhóm 2–3 ô ngắn chỉ chiếm nửa hàng của lưới (phương án D).
import { cn } from "@kb/ui";
import { DECLARATION_CONDITIONS, fieldRole, type ConditionContext, type ConditionId, type LayoutGroup } from "@kb/contracts";
import { groupSpan } from "./compact-rules";
import { fieldTitle } from "./display";
import { FormField, GuideButton, RoleMark } from "./field";
import { groupMissing, isApplicable, type FormValues } from "./form-state";
import { useViewPrefs } from "./view-prefs";

type Props = {
  kind: "IDA" | "EDA";
  group: LayoutGroup;
  values: FormValues;
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
  /** Điều kiện của khối chứa nhóm (ví dụ khối Container – hàng container đường biển). */
  parentCondition?: ConditionId | undefined;
};

export function FormFieldGroup({ kind, group, values, onChange, ctx, showInapplicable, parentCondition }: Props) {
  const { labelsLeft } = useViewPrefs();
  const applicable = isApplicable(group, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || group.fields.every((f) => f.origin === "CUSTOMS");
  const condition = group.condition ? DECLARATION_CONDITIONS[group.condition].label : undefined;
  const first = group.fields[0];
  const effectiveCondition = group.condition ?? parentCondition;
  const anyMissing = group.fill === "any" && applicable && !readOnly && groupMissing(kind, group, values, ctx, parentCondition);
  const span = groupSpan(group) === "full" ? "col-span-full" : labelsLeft ? undefined : "cq-sm:col-span-2";
  const notes = [condition ? (applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`) : null, group.fill === "any" ? "Chỉ cần nhập một ô" : null].filter(Boolean);
  return (
    <fieldset data-missing={anyMissing || undefined} className={cn("flex min-w-0 flex-col gap-1.5 rounded-md border border-border px-3 pb-3 pt-1", span, !applicable && "opacity-60")}>
      <legend className="px-1 text-xs font-medium text-fg-muted">
        {fieldTitle(group.no, group.label)}
        {!readOnly && first && <RoleMark role={fieldRole(kind, first, group.no)} />}
      </legend>
      {!readOnly && notes.length > 0 && <p className="text-xs text-fg-subtle">{notes.join(" · ")}</p>}
      {anyMissing && <p className="text-xs font-medium text-warning-subtle-fg">Còn thiếu</p>}
      <div className="flex flex-wrap items-start gap-3">
        {group.fields.map((f) => (
          <FormField key={f.key} kind={kind} field={f} values={values} onChange={readOnly ? undefined : onChange} ctx={ctx} showInapplicable={showInapplicable} parentNo={group.no} parentCondition={effectiveCondition} compact suppressMissing={group.fill === "any"} />
        ))}
        {!readOnly && <span className="pt-7"><GuideButton kind={kind} no={group.no} /></span>}
      </div>
    </fieldset>
  );
}
