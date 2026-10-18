"use client";
// Một ô chỉ tiêu của bản mẫu tờ khai, dạng gọn (phương án B): nhãn "số · tên" kèm dấu * (bắt buộc) hoặc chữ nhỏ "tình huống";
// nút ⓘ mở hướng dẫn khai (catalog Phụ lục II) kèm nghĩa vai trò (VNACCS tự xác định…). Ô mã có danh mục VNACCS: chỉ hiện mã, tên khi rê chuột,
// tra cứu bằng danh sách thả xuống / popup (CodeInput); chỉ đọc thì hiện "mã · tên". Tùy chọn nhãn bên trái (phương án F). "Còn thiếu", lý do áp dụng.
import { Abbreviation, Button, Checkbox, cn, Field, Input, Popover, PopoverContent, PopoverTrigger, RadioGroup, Textarea } from "@kb/ui";
import type { ReactNode } from "react";
import { codeListFor, DECLARATION_CONDITIONS, fieldGuideNo, fieldRole, type ConditionContext, type ConditionId, type DeclarationFieldRole, type FieldOption, type LayoutField } from "@kb/contracts";
import { Info, Lock } from "lucide-react";
import { useMemo } from "react";
import { useAmendLock } from "./amend-context";
import { CodeInput } from "./code-input";
import { codeScope } from "./code-scope";
import { ROLE_INFO } from "../dossier-detail/steps/declaration-groups";
import { fieldGuide } from "../dossier-detail/steps/field-guide";
import { displayValue } from "./display";
import { choiceControl, isApplicable, missingRequired, toggleChoice, type FormValues } from "./form-state";
import { useCodeName } from "./use-code-list";
import { useViewPrefs } from "./view-prefs";

type Kind = "IDA" | "EDA";

/** Chữ nhỏ cạnh nhãn thay cho huy hiệu vai trò. Bắt buộc → dấu * (trình đọc màn hình nghe "bắt buộc"); theo tình huống → "TH" (bấm xem nghĩa). Không bắt buộc, VNACCS tự xác định,
 * chưa sử dụng → không ghi (nghĩa vai trò xem ở nút ⓘ). */
const ROLE_TAG: Partial<Record<DeclarationFieldRole, string>> = { REFERENCE: "tham khảo" };
/** Vai trò không hiện cạnh nhãn – ghi nghĩa trong hướng dẫn. */
const ROLE_IN_GUIDE = new Set<DeclarationFieldRole>(["ASSIST", "UNUSED"]);

export function RoleMark({ role, star = true }: { role: DeclarationFieldRole; star?: boolean }) {
  if (role === "REQUIRED") {
    return star ? (
      <>
        <span className="ml-0.5 text-danger" aria-hidden="true">*</span>
        <span className="sr-only"> (bắt buộc)</span>
      </>
    ) : null;
  }
  // Theo tình huống: viết tắt "TH" (nhãn khỏi xuống dòng), bấm xem nghĩa đầy đủ.
  if (role === "CONDITIONAL") {
    return (
      <span className="ml-1.5 text-xs font-normal text-fg-subtle">
        <Abbreviation short="TH" full={`Theo tình huống – ${ROLE_INFO.CONDITIONAL.meaning}.`} />
      </span>
    );
  }
  const tag = ROLE_TAG[role];
  return tag ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{tag}</span> : null;
}

/** Nút ⓘ mở hướng dẫn khai của chỉ tiêu (Phụ lục II, ghi chú nếu TT121 sửa đổi). Không có hướng dẫn → không hiện. */
export function GuideButton({ kind, no, role }: { kind: Kind; no: string | undefined; role?: DeclarationFieldRole | undefined }) {
  const guide = fieldGuide(kind, no);
  if (!guide) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-fg-muted" aria-label={`Hướng dẫn khai chỉ tiêu ${guide.no}`}>
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-sm text-sm" showClose>
        <p className="font-medium text-fg">
          {guide.no} · {guide.label}
          {guide.amendedBy121 ? " (sửa đổi theo TT121/2025)" : ""}
        </p>
        {role && ROLE_IN_GUIDE.has(role) && <p className="mt-1 font-medium text-fg">{ROLE_INFO[role].label}: {ROLE_INFO[role].meaning}.</p>}
        <p className="mt-1 text-fg-muted">{guide.note}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Nhãn ô: "số · tên"; tên dài có chữ viết tắt (short-labels) → hiện chữ viết tắt, bấm xem tên đầy đủ. Ô con trong nhóm không lặp số chỉ tiêu. */
export function fieldLabelNode(f: Pick<LayoutField, "no" | "label" | "short" | "full">, withNo = true): ReactNode {
  const name = f.short ? <Abbreviation short={f.short} full={f.full ?? f.label} /> : f.label;
  return withNo && f.no ? <>{f.no} · {name}</> : name;
}
/** Lựa chọn có chữ viết tắt (vd "SXXK") → hiện chữ viết tắt, bấm xem ý nghĩa. */
const optionLabel = (o: FieldOption): ReactNode => (o.short ? <Abbreviation short={o.short} full={o.full ?? o.label} /> : o.label);

/** Bề rộng ô con trong nhóm – xs 112px đủ một dòng cho nhãn ngắn ~15 ký tự (“Công thức chuẩn”). */
const WIDTH: Record<NonNullable<LayoutField["width"]>, string> = { xs: "w-28", sm: "w-40", md: "w-64", lg: "w-full", full: "w-full" };
/** Ô rộng chiếm cả hàng của lưới khối. */
export const spansRow = (f: Pick<LayoutField, "width" | "input">) => f.width === "full" || f.width === "lg" || f.input === "textarea";

export type FormFieldProps = {
  kind: Kind;
  field: LayoutField;
  values: FormValues;
  /** Không truyền → chỉ đọc. */
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
  parentNo?: string | undefined;
  parentCondition?: ConditionId | undefined;
  /** Ô con trong nhóm: không lặp số chỉ tiêu, vai trò, hướng dẫn (nhóm đã hiện). */
  compact?: boolean;
  /** Ô chiếm đủ bề rộng ô chứa (lưới container) thay vì bề rộng cố định theo `width`. */
  fill?: boolean;
  /** Nhóm "chỉ cần một ô" tự báo thiếu ở cấp nhóm – ô con không báo riêng. */
  suppressMissing?: boolean;
};

export function FormField({ kind, field, values, onChange, ctx, showInapplicable, parentNo, parentCondition, compact = false, fill = false, suppressMissing = false }: FormFieldProps) {
  // Khai sửa đổi bổ sung: chỉ tiêu không được sửa hiện chỉ đọc kèm lý do.
  const lock = useAmendLock()(field.key);
  const { labelsLeft } = useViewPrefs();
  // Ô mã có danh mục VNACCS: phạm vi lọc (cơ quan Hải quan, nhập/xuất) và tên của mã.
  const listId = field.input === "code" ? codeListFor(field.codeTable) : undefined;
  const office = values["TK_CH"] ?? "";
  const scope = useMemo(() => (listId ? codeScope(listId, field.key, kind, { TK_CH: office }) : null), [listId, field.key, kind, office]);
  const name = useCodeName(field.codeTable, values[field.key] ?? "", scope);
  const applicable = isApplicable(field, ctx);
  if (!applicable && !showInapplicable) return null;
  const value = values[field.key] ?? "";
  const title = fieldLabelNode(field, !compact);
  const readOnly = field.origin === "CUSTOMS" || !onChange || Boolean(lock);
  // Ô mã có tra cứu trong nhóm: bề rộng theo ô mã + nút tra cứu (CodeInput tự đặt bề rộng ô mã).
  const sizeClass = fill ? "w-full" : compact ? (listId ? undefined : WIDTH[field.width ?? "sm"]) : spansRow(field) ? "col-span-full" : undefined;

  if (readOnly) {
    // Ô Hải quan trả về nền thông tin; ô người khai đã khóa (tờ khai đã đăng ký) nền trung tính.
    const customs = field.origin === "CUSTOMS";
    return (
      <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2", customs ? "bg-info-subtle" : "bg-surface-muted", sizeClass)}>
        <p className={cn("text-xs", customs ? "text-info-subtle-fg" : "text-fg-muted")}>{title}</p>
        <p className={cn("break-words text-sm font-medium", customs ? "text-info-subtle-fg" : "text-fg")}>{[displayValue(field, value), value.trim() && field.codeTable ? name : undefined].filter(Boolean).join(" · ") || "—"}</p>
        {lock && onChange && (
          <p className="flex items-start gap-1 text-xs text-fg-muted">
            <Lock aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0" />
            {lock.reason}
          </p>
        )}
      </div>
    );
  }

  const role = fieldRole(kind, field, parentNo);
  const condition = field.condition ? DECLARATION_CONDITIONS[field.condition].label : undefined;
  const reason = condition ? (applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`) : undefined;
  const missing = !suppressMissing && applicable && missingRequired(kind, field, values, parentNo, parentCondition, ctx);
  const set = (v: string) => onChange?.(field.key, v);
  const guide = compact ? null : <GuideButton kind={kind} no={fieldGuideNo(field, parentNo)} role={role} />;
  const missingNote = missing && <p className="text-xs font-medium text-warning-subtle-fg">Còn thiếu</p>;
  const label = compact ? title : <>{title}<RoleMark role={role} star={false} /></>;

  if (field.input === "choice") {
    const options = (field.options ?? []).map((o) => ({ ...o, label: optionLabel(o) }));
    return (
      <div data-missing={missing || undefined} className={cn("flex min-w-0 flex-col gap-1", !applicable && "opacity-60", sizeClass)}>
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            {choiceControl(kind, field, parentNo) === "radio" ? (
              <RadioGroup label={<>{title}<RoleMark role={role} /></>} description={reason} options={options} value={value || null} onChange={set} />
            ) : (
              <fieldset className="min-w-0">
                <legend className="text-sm font-medium text-fg">{label}</legend>
                {reason && <p className="mt-0.5 text-xs text-fg-subtle">{reason}</p>}
                <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-2">
                  {options.map((o) => (
                    <Checkbox key={o.value} label={o.label} checked={value === o.value} onChange={() => set(toggleChoice(value, o.value))} />
                  ))}
                </div>
              </fieldset>
            )}
          </div>
          {guide}
        </div>
        {missingNote}
      </div>
    );
  }

  const inline = !compact && !listId && Boolean(name) && !spansRow(field);
  const control =
    listId && field.codeTable ? <CodeInput table={field.codeTable} fieldKey={field.key} kind={kind} values={values} value={value} onChange={set} label={field.label} widthClass={compact ? WIDTH[field.width ?? "sm"] : "w-32"} />
    : field.input === "textarea" ? <Textarea className={compact ? undefined : "min-w-0 flex-1"} rows={2} value={value} onChange={(e) => set(e.currentTarget.value)} />
    : <Input className={compact ? undefined : inline ? "w-32 shrink-0" : "min-w-0 flex-1"} type={field.input === "date" ? "date" : field.input === "time" ? "time" : "text"} inputMode={field.input === "number" ? "decimal" : undefined} value={value} onChange={(e) => set(e.currentTarget.value)} />;
  // Ô con trong nhóm hẹp: tên mã để dưới ô. Ô thường: tên mã cạnh ô, nút ⓘ cuối hàng.
  const hint = [compact && !listId && name ? `→ ${name}` : null, reason].filter(Boolean).join(" · ") || undefined;

  return (
    <div data-missing={missing || undefined} className={cn("flex min-w-0 flex-col gap-1", !applicable && "opacity-60", sizeClass)}>
      <Field label={label} hint={hint} required={!compact && role === "REQUIRED"} orientation={labelsLeft && !compact ? "horizontal" : "vertical"}>
        {compact ? control : (
          <div className="flex min-w-0 items-center gap-2">
            {control}
            {inline && <span className="min-w-0 text-xs text-fg-subtle">{name}</span>}
            {guide}
          </div>
        )}
      </Field>
      {missingNote}
    </div>
  );
}
