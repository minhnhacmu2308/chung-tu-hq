"use client";
// Một ô chỉ tiêu của bản mẫu tờ khai: nhãn "số · tên", vai trò, hướng dẫn khai (catalog Phụ lục II), "Còn thiếu", lý do áp dụng / không áp dụng.
import { Badge, Button, cn, Field, Input, Popover, PopoverContent, PopoverTrigger, RadioGroup, Textarea } from "@kb/ui";
import { DECLARATION_CONDITIONS, fieldGuideNo, fieldRole, type ConditionContext, type ConditionId, type DeclarationFieldRole, type LayoutField } from "@kb/contracts";
import { Info } from "lucide-react";
import { ROLE_INFO } from "../dossier-detail/steps/declaration-groups";
import { fieldGuide } from "../dossier-detail/steps/field-guide";
import { codeLabel, displayValue, fieldTitle } from "./display";
import { isApplicable, missingRequired, type FormValues } from "./form-state";

type Kind = "IDA" | "EDA";

export function RoleBadge({ role }: { role: DeclarationFieldRole }) {
  const info = ROLE_INFO[role];
  return (
    <Badge tone={info.tone} size="sm">
      <span className="sr-only">Vai trò: </span>
      {info.label}
    </Badge>
  );
}

/** Nút mở hướng dẫn khai của chỉ tiêu (Phụ lục II, ghi chú nếu TT121 sửa đổi). Không có hướng dẫn → không hiện. */
export function GuideButton({ kind, no }: { kind: Kind; no: string | undefined }) {
  const guide = fieldGuide(kind, no);
  if (!guide) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="-my-1 h-6 px-1.5 text-xs" leftIcon={<Info className="h-3.5 w-3.5" />} aria-label={`Hướng dẫn khai chỉ tiêu ${guide.no}`}>
          Hướng dẫn
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
  const applicable = isApplicable(field, ctx);
  if (!applicable && !showInapplicable) return null;
  const value = values[field.key] ?? "";
  const title = compact ? field.label : fieldTitle(field.no, field.label);
  const readOnly = field.origin === "CUSTOMS" || !onChange;
  const sizeClass = fill ? "w-full" : compact ? WIDTH[field.width ?? "sm"] : spansRow(field) ? "col-span-full" : undefined;

  if (readOnly) {
    return (
      <div className={cn("flex min-w-0 flex-col gap-0.5 rounded-md bg-info-subtle px-3 py-2", sizeClass)}>
        <p className="text-xs text-info-subtle-fg">{title}</p>
        <p className="break-words text-sm font-medium text-info-subtle-fg">{displayValue(field, value) || "—"}</p>
      </div>
    );
  }

  const condition = field.condition ? DECLARATION_CONDITIONS[field.condition].label : undefined;
  const name = codeLabel(field.codeTable, value);
  const hint = [name ? `→ ${name}` : null, condition ? (applicable ? `Có vì: ${condition}` : `Không áp dụng vì: ${condition}`) : null].filter(Boolean).join(" · ") || undefined;
  const missing = !suppressMissing && applicable && missingRequired(kind, field, values, parentNo, parentCondition, ctx);
  const set = (v: string) => onChange?.(field.key, v);
  if (field.input === "choice") {
    return (
      <div className={cn("flex min-w-0 flex-col gap-1", !applicable && "opacity-60", sizeClass)}>
        <RadioGroup label={title} description={hint} options={field.options ?? []} value={value || null} onChange={set} />
        {!compact && (
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={fieldRole(kind, field, parentNo)} />
            <GuideButton kind={kind} no={fieldGuideNo(field, parentNo)} />
          </div>
        )}
        {missing && <p className="text-xs font-medium text-warning-subtle-fg">Còn thiếu</p>}
      </div>
    );
  }
  const control =
    field.input === "textarea" ? <Textarea rows={2} value={value} onChange={(e) => set(e.currentTarget.value)} />
    : <Input type={field.input === "date" ? "date" : field.input === "time" ? "time" : "text"} inputMode={field.input === "number" ? "decimal" : undefined} value={value} onChange={(e) => set(e.currentTarget.value)} />;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", !applicable && "opacity-60", sizeClass)}>
      <Field label={title} hint={hint}>
        {control}
      </Field>
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role={fieldRole(kind, field, parentNo)} />
          <GuideButton kind={kind} no={fieldGuideNo(field, parentNo)} />
        </div>
      )}
      {missing && <p className="text-xs font-medium text-warning-subtle-fg">Còn thiếu</p>}
    </div>
  );
}
