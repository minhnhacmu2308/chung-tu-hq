"use client";
// Chỉ tiêu nhiều ô con nằm ngang (địa chỉ 4 dòng, tổng trị giá hóa đơn 4 ô…): một nhãn chung "số · tên" kèm dấu bắt buộc / chữ vai trò, nút ⓘ cuối hàng.
// Nhóm 2–3 ô ngắn chỉ chiếm nửa hàng của lưới (phương án D).
import { cn, FieldFrame, fill, useMessages, useUiLocale } from "@kb/ui";
import { DECLARATION_CONDITIONS, fieldRole, type ConditionContext, type ConditionId, type LayoutGroup } from "@kb/contracts";
import { groupSpan } from "./compact-rules";
import { fieldTitle, groupGuideReason } from "./display";
import { FormField, GuideButton, RoleMark } from "./field";
import { FORM_MESSAGES } from "./form.messages";
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
  /** Khối chứa nhóm đang không áp dụng – ô nhập mờ. */
  dimmed?: boolean;
};

export function FormFieldGroup({ kind, group, values, onChange, ctx, showInapplicable, parentCondition, dimmed = false }: Props) {
  const { labelsLeft } = useViewPrefs();
  const t = useMessages(FORM_MESSAGES);
  const locale = useUiLocale();
  const applicable = isApplicable(group, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || group.fields.every((f) => f.origin === "CUSTOMS");
  const condition = group.condition ? DECLARATION_CONDITIONS[group.condition].label : undefined;
  const first = group.fields[0];
  const effectiveCondition = group.condition ?? parentCondition;
  const anyMissing = group.fill === "any" && applicable && !readOnly && groupMissing(kind, group, values, ctx, parentCondition);
  const span = groupSpan(group) === "full" ? "col-span-full" : labelsLeft ? undefined : "cq-sm:col-span-2";
  // "Có vì: …" của nhóm và ô con (hô hiệu khi đường biển…) nằm trong hướng dẫn ⓘ; "Không áp dụng vì" và "Chỉ cần nhập một ô" vẫn ghi dưới nhãn.
  const reasonInGuide = groupGuideReason(group, ctx, locale);
  const notes = [condition && !applicable ? fill(t.notApplicableBecause, { c: condition }) : null, group.fill === "any" ? t.onlyOne : null].filter(Boolean);
  return (
    <FieldFrame
      data-missing={anyMissing || undefined}
      className={cn(span)}
      legend={<>{fieldTitle(group.no, group.label)}{!readOnly && first && <RoleMark role={fieldRole(kind, first, group.no)} />}</>}
      legendAction={!readOnly && <GuideButton kind={kind} no={group.no} role={first ? fieldRole(kind, first, group.no) : undefined} reason={reasonInGuide} label={group.label} />}
    >
      {!readOnly && notes.length > 0 && <p className="text-xs text-fg-subtle">{notes.join(" · ")}</p>}
      {anyMissing && <p className="text-sm font-medium text-warning-subtle-fg">{t.missing}</p>}
      <div className="flex flex-wrap items-start gap-3">
        {group.fields.map((f) => (
          <FormField key={f.key} kind={kind} field={f} values={values} onChange={readOnly ? undefined : onChange} ctx={ctx} showInapplicable={showInapplicable} parentNo={group.no} parentCondition={effectiveCondition} compact suppressMissing={group.fill === "any"} dimmed={dimmed || !applicable} />
        ))}
      </div>
    </FieldFrame>
  );
}
