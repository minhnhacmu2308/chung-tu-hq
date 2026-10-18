"use client";
// Một ô chỉ tiêu của bản mẫu tờ khai, dạng gọn (phương án B): nhãn "số · tên" kèm dấu * (bắt buộc) hoặc chữ nhỏ "tình huống" / "tự xác định";
// tên mã hiện ngay bên phải ô mã; nút ⓘ mở hướng dẫn khai (catalog Phụ lục II). Tùy chọn nhãn bên trái (phương án F). "Còn thiếu", lý do áp dụng.
import { Button, Checkbox, cn, Field, Input, Popover, PopoverContent, PopoverTrigger, RadioGroup, Textarea } from "@kb/ui";
import { DECLARATION_CONDITIONS, fieldGuideNo, fieldRole, type ConditionContext, type ConditionId, type DeclarationFieldRole, type LayoutField } from "@kb/contracts";
import { Info, Lock } from "lucide-react";
import { useAmendLock } from "./amend-context";
import { fieldGuide } from "../dossier-detail/steps/field-guide";
import { codeLabel, displayValue, fieldTitle } from "./display";
import { choiceControl, isApplicable, missingRequired, toggleChoice, type FormValues } from "./form-state";
import { useViewPrefs } from "./view-prefs";

type Kind = "IDA" | "EDA";

/** Chữ nhỏ cạnh nhãn thay cho huy hiệu vai trò. Bắt buộc → dấu * (trình đọc màn hình nghe "bắt buộc"). Không bắt buộc → không ghi gì. */
const ROLE_TAG: Partial<Record<DeclarationFieldRole, string>> = { CONDITIONAL: "tình huống", ASSIST: "tự xác định", UNUSED: "chưa dùng", REFERENCE: "tham khảo" };

export function RoleMark({ role, star = true }: { role: DeclarationFieldRole; star?: boolean }) {
  if (role === "REQUIRED") {
    return star ? (
      <>
        <span className="ml-0.5 text-danger" aria-hidden="true">*</span>
        <span className="sr-only"> (bắt buộc)</span>
      </>
    ) : null;
  }
  const tag = ROLE_TAG[role];
  return tag ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{tag}</span> : null;
}

/** Nút ⓘ mở hướng dẫn khai của chỉ tiêu (Phụ lục II, ghi chú nếu TT121 sửa đổi). Không có hướng dẫn → không hiện. */
export function GuideButton({ kind, no }: { kind: Kind; no: string | undefined }) {
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
        <p className="mt-1 text-fg-muted">{guide.note}</p>
      </PopoverContent>
    </Popover>
  );
}

const WIDTH: Record<NonNullable<LayoutField["width"]>, string> = { xs: "w-24", sm: "w-40", md: "w-64", lg: "w-full", full: "w-full" };
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
  const applicable = isApplicable(field, ctx);
  if (!applicable && !showInapplicable) return null;
  const value = values[field.key] ?? "";
  const title = compact ? field.label : fieldTitle(field.no, field.label);
  const readOnly = field.origin === "CUSTOMS" || !onChange || Boolean(lock);
  const sizeClass = fill ? "w-full" : compact ? WIDTH[field.width ?? "sm"] : spansRow(field) ? "col-span-full" : undefined;

  if (readOnly) {
    // Ô Hải quan trả về nền thông tin; ô người khai đã khóa (tờ khai đã đăng ký) nền trung tính.
    const customs = field.origin === "CUSTOMS";
    return (
      <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-md px-3 py-2", customs ? "bg-info-subtle" : "bg-surface-muted", sizeClass)}>
        <p className={cn("text-xs", customs ? "text-info-subtle-fg" : "text-fg-muted")}>{title}</p>
        <p className={cn("break-words text-sm font-medium", customs ? "text-info-subtle-fg" : "text-fg")}>{displayValue(field, value) || "—"}</p>
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
  const name = codeLabel(field.codeTable, value);
  const missing = !suppressMissing && applicable && missingRequired(kind, field, values, parentNo, parentCondition, ctx);
  const set = (v: string) => onChange?.(field.key, v);
  const guide = compact ? null : <GuideButton kind={kind} no={fieldGuideNo(field, parentNo)} />;
  const missingNote = missing && <p className="text-xs font-medium text-warning-subtle-fg">Còn thiếu</p>;
  const label = compact ? title : <>{title}<RoleMark role={role} star={false} /></>;

  if (field.input === "choice") {
    const options = field.options ?? [];
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

  const inline = !compact && Boolean(name) && !spansRow(field);
  const control =
    field.input === "textarea" ? <Textarea className={compact ? undefined : "min-w-0 flex-1"} rows={2} value={value} onChange={(e) => set(e.currentTarget.value)} />
    : <Input className={compact ? undefined : inline ? "w-32 shrink-0" : "min-w-0 flex-1"} type={field.input === "date" ? "date" : field.input === "time" ? "time" : "text"} inputMode={field.input === "number" ? "decimal" : undefined} value={value} onChange={(e) => set(e.currentTarget.value)} />;
  // Ô con trong nhóm hẹp: tên mã để dưới ô. Ô thường: tên mã cạnh ô, nút ⓘ cuối hàng.
  const hint = [compact && name ? `→ ${name}` : null, reason].filter(Boolean).join(" · ") || undefined;

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
