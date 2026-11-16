"use client";
// Nhóm lặp (5 vận đơn, 5 giấy phép, 5 khoản điều chỉnh, 10 chỉ thị…) dạng bảng (phương án C): nhãn ở tiêu đề cột, mỗi dòng một hàng,
// nút "Thêm dòng". 50 số container: lưới. Bảng hẹp hơn nội dung thì cuộn ngang trong khung, trang không tràn.
import { Button, Checkbox, cn, FieldFrame, fill, Grid, Input, pickMessages, useMessages, useUiLocale } from "@kb/ui";
import { codeListFor, expandRepeat, fieldRole, normalizeOtherTaxes, otherTaxIssues, otherTaxKeys, type ConditionContext, type ConditionId, type LayoutField, type LayoutRepeat } from "@kb/contracts";
import { CheckCircle2, Lock, Plus } from "lucide-react";
import { useId, useState } from "react";
import { useAmendLock } from "./amend-context";
import { CodeInput } from "./code-input";
import { useFieldChecks } from "./field-checks";
import { DATE_WIDTH, displayValue, fieldTitle, visibleRows } from "./display";
import { fieldLabelNode, FormField, GuideButton, RoleMark } from "./field";
import { FORM_MESSAGES } from "./form.messages";
import { OTHER_TAX_MESSAGES, otherTaxGroupLabel } from "./other-tax.messages";
import { isApplicable, missingRequired, toggleChoice, type FormValues } from "./form-state";
import { reasonText } from "@/lib/reason-codes";

type Props = {
  kind: "IDA" | "EDA";
  repeat: LayoutRepeat;
  values: FormValues;
  onChange?: ((key: string, value: string) => void) | undefined;
  ctx: ConditionContext;
  showInapplicable: boolean;
  /** Điều kiện của khối chứa nhóm lặp. */
  parentCondition?: ConditionId | undefined;
  /** Khối chứa nhóm lặp đang không áp dụng – ô nhập mờ. */
  dimmed?: boolean;
};

/** 50 số container: lưới thay vì bảng. */
const isGrid = (r: LayoutRepeat) => r.fields.length === 1 && r.count > 10;
const WIDTH: Record<NonNullable<LayoutField["width"]>, string> = { xs: "w-24", sm: "w-40", md: "w-56", lg: "w-64", full: "w-64" };

function Cell({ kind, f, n, values, onChange, rowLabel, describedBy }: { kind: "IDA" | "EDA"; f: LayoutField; n: number; values: FormValues; onChange: ((key: string, value: string) => void) | undefined; rowLabel?: string | undefined; describedBy?: string | undefined }) {
  const lock = useAmendLock()(f.key);
  const t = useMessages(FORM_MESSAGES);
  const locale = useUiLocale();
  const value = values[f.key] ?? "";
  const name = rowLabel ? fill(pickMessages(OTHER_TAX_MESSAGES, locale).rowAria, { label: f.label, group: rowLabel }) : fill(t.rowName, { label: f.label, n });
  if (!onChange || lock || f.origin === "CUSTOMS") {
    return (
      <span className="flex items-start gap-1 break-words text-sm text-fg">
        {lock?.reason && onChange && (
          <>
            <Lock aria-hidden="true" className="mt-1 h-3 w-3 shrink-0 text-fg-muted" />
            <span className="sr-only">{lock.reason}: </span>
          </>
        )}
        {displayValue(f, value) || "—"}
      </span>
    );
  }
  // Ô mã có danh mục VNACCS trong bảng: cùng cách tra cứu như ô thường.
  if (f.input === "code" && f.codeTable && codeListFor(f.codeTable)) {
    return <CodeInput table={f.codeTable} fieldKey={f.key} kind={kind} values={values} value={value} onChange={(v) => onChange(f.key, v)} label={f.label} ariaLabel={name} describedBy={describedBy} widthClass={WIDTH[f.width ?? "sm"]} />;
  }
  if (f.input === "choice") {
    const opt = f.options?.[0];
    return opt ? <Checkbox label={<span className="sr-only">{`${name}: ${opt.label}`}</span>} checked={value === opt.value} onChange={() => onChange(f.key, toggleChoice(value, opt.value))} /> : null;
  }
  return (
    <Input
      aria-label={name}
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      className={cn("h-9", f.input === "date" ? DATE_WIDTH : WIDTH[f.width ?? "sm"])}
      type={f.input === "date" ? "date" : f.input === "time" ? "time" : "text"}
      inputMode={f.input === "number" ? "decimal" : undefined}
      placeholder={f.input === "number" ? t.enterNumber : t.enterShort}
      value={value}
      onChange={(e) => onChange(f.key, e.currentTarget.value)}
    />
  );
}

export function FormFieldRepeat({ kind, repeat, values, onChange, ctx, showInapplicable, parentCondition, dimmed = false }: Props) {
  const [extra, setExtra] = useState(0);
  const t = useMessages(FORM_MESSAGES);
  const ot = useMessages(OTHER_TAX_MESSAGES);
  const locale = useUiLocale();
  const checks = useFieldChecks();
  // Mọi hook gọi trước các lần return sớm bên dưới (quy tắc hook: số hook không đổi giữa các lần render khi readOnly / số dòng đổi).
  const noteBase = useId();
  const applicable = isApplicable(repeat, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || repeat.fields.every((f) => f.origin === "CUSTOMS");
  const rows = visibleRows(repeat, values, extra, readOnly);
  if (readOnly && rows.length === 0) return null;
  const first = repeat.fields[0];
  // Số dòng cố định theo loại (thuế và thu khác): nhãn dòng = tên loại thuế, không thêm dòng, mỗi dòng báo lỗi / cảnh báo riêng.
  const fixed = repeat.fixedRows === true;
  const groupLabel = (n: number): string | undefined => (fixed ? otherTaxGroupLabel(ot, repeat.rowKeys?.[n - 1]) : undefined);
  const condition = repeat.condition ?? parentCondition;
  const legend = (
    <>
      {fieldTitle(repeat.no, repeat.label)} {!fixed && <span className="font-normal text-fg-subtle">{fill(t.maxN, { n: repeat.count })}</span>}
      {!readOnly && first && repeat.no && <RoleMark role={fieldRole(kind, first, repeat.no)} />}
    </>
  );
  const guide = !readOnly && <GuideButton kind={kind} no={repeat.no} role={first ? fieldRole(kind, first, repeat.no) : undefined} />;
  const footer = !readOnly && (
    <div className="flex flex-wrap items-center gap-2">
      {!fixed && rows.length < repeat.count && (
        <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setExtra((n) => n + 1)}>
          {t.addRow}
        </Button>
      )}
    </div>
  );
  const box = "col-span-full gap-2 pb-2";
  // Không áp dụng: chỉ làm mờ ô nhập, tên cột / nhãn giữ đủ tương phản.
  const off = dimmed || !applicable;

  if (isGrid(repeat)) {
    const all = expandRepeat(repeat);
    const indexOf = (key: string) => all.findIndex((r) => r[0]?.key === key) + 1;
    return (
      <FieldFrame legend={legend} legendAction={guide} className={box}>
        <Grid cols={{ base: 2, md: 4 }} gap="sm">
          {rows.map((row) =>
            row.map((f) => (
              <FormField key={f.key} kind={kind} field={f} values={values} onChange={readOnly ? undefined : onChange} ctx={ctx} showInapplicable={showInapplicable} parentNo={repeat.no ?? f.no} parentCondition={condition} compact fill suppressMissing={indexOf(f.key) > 1} dimmed={off} />
            )),
          )}
        </Grid>
        {footer}
      </FieldFrame>
    );
  }

  // Cột theo ô mẫu của nhóm lặp; ô có điều kiện (số HAWB khi hàng không có HAWB) chỉ thành cột khi đang áp dụng.
  const cols = repeat.fields.map((f, i) => ({ f, i })).filter(({ f }) => isApplicable(f, ctx) || showInapplicable);
  // Như quy tắc ô bắt buộc (@kb/contracts required.ts): nhóm lặp bắt buộc khi có ít nhất dòng 1 – dòng thêm không tự báo thiếu.
  const firstRowMissing = !readOnly && applicable && !fixed && (rows[0] ?? []).some((f) => isApplicable(f, ctx) && missingRequired(kind, f, values, repeat.no ?? f.no, condition, ctx));
  // Dòng cố định: lỗi chặn (otherTaxIssues), cảnh báo ô tự điền (checks) và "còn thiếu" của loại GTGT hiện dưới đúng dòng.
  const issues = fixed ? otherTaxIssues(values) : [];
  const gtgt = repeat.rowKeys?.indexOf("GTGT") ?? -1;
  // Giá trị chuẩn hóa theo loại thuế (mã ở ô lệch → về đúng dòng loại) – như compact-rules / backend.
  const normalized = fixed ? normalizeOtherTaxes(values) : values;
  const vatMissing = fixed && !readOnly && applicable && kind === "IDA" && gtgt >= 0 && !(normalized[otherTaxKeys(gtgt + 1).tx] ?? "").trim();
  const rowNotes = (n: number): { id: string; text: string; tone: "danger" | "warning"; onConfirm?: (() => void) | undefined; code?: string }[] => [
    ...issues.filter((i) => i.group === n).map((i) => ({ id: `danger-${i.reason}`, text: reasonText(i.reason, undefined, undefined, locale), tone: "danger" as const })),
    ...checks.filter((c) => Number(c.key.slice(-1)) === n).map((c) => ({ id: `warning-${c.reason}`, text: reasonText(c.reason, undefined, undefined, locale), tone: "warning" as const, onConfirm: readOnly ? undefined : c.onConfirm, code: (normalized[c.key] ?? "").trim() })),
    ...(vatMissing && n === gtgt + 1 ? [{ id: "warning-missing", text: t.missing, tone: "warning" as const }] : []),
  ];
  return (
    <FieldFrame data-missing={firstRowMissing || vatMissing || undefined} legend={legend} legendAction={guide} className={box}>
      {/* relative: chữ ẩn (sr-only, định vị tuyệt đối) trong ô bảng nằm trong khung cuộn – không thoát ra làm trang tràn ngang. */}
      {/* Chỉ đọc (không có ô nhập để Tab tới): khung cuộn nhận focus để cuộn ngang bằng bàn phím. */}
      <div className="relative min-w-0 overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus" {...(readOnly ? { tabIndex: 0, role: "group", "aria-label": fill(t.scrollHint, { label: repeat.label }) } : {})}>
        {/* kb-allow-raw: lưới sửa trực tiếp các dòng của nhóm lặp (vận đơn, giấy phép, khoản điều chỉnh…); DataTable chưa hỗ trợ ô sửa được */}
        <table className="text-sm">
          <thead>
            <tr>
              <th scope="col" className={cn("pb-1 pr-2 text-left text-xs font-medium text-fg-muted", fixed ? "w-48 min-w-40" : "w-8")}>
                {fixed ? ot.groupHeader : <span className="sr-only">{t.rowHeader}</span>}
              </th>
              {cols.map(({ f }) => (
                <th key={f.key} scope="col" className="pb-1 pr-2 text-left text-xs font-medium text-fg-muted">
                  {fieldLabelNode(f, false)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const n = expandRepeat(repeat).findIndex((x) => x[0]?.key === row[0]?.key) + 1;
              const label = groupLabel(n || r + 1);
              const notes = fixed ? rowNotes(n || r + 1) : [];
              const noteId = notes.length > 0 ? `${noteBase}-${n || r + 1}` : undefined;
              return (
                <tr key={row[0]!.key}>
                    {label ? <th scope="row" className="max-w-48 pb-1.5 pr-2 text-left align-middle text-xs font-medium text-fg">{label}</th> : <td className="pb-1.5 pr-2 align-middle text-xs tabular-nums text-fg-subtle">({n || r + 1})</td>}
                    {cols.map(({ f, i }) => (
                      <td key={f.key} className={cn("pb-1.5 pr-2 align-middle", (off || !isApplicable(f, ctx)) && "opacity-60", readOnly && "min-w-24 max-w-md")}>
                        {row[i] && <Cell kind={kind} f={row[i]} n={n || r + 1} values={values} onChange={readOnly ? undefined : onChange} rowLabel={label} describedBy={noteId} />}
                      </td>
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Ghi chú theo dòng nằm NGOÀI khung cuộn ngang (không bị cắt ở màn hẹp, nút Xác nhận luôn thấy được), mỗi dòng một khối kèm nhãn loại thuế. */}
      {fixed &&
        rows.map((row, r) => {
          const n = expandRepeat(repeat).findIndex((x) => x[0]?.key === row[0]?.key) + 1;
          const notes = rowNotes(n || r + 1);
          if (notes.length === 0) return null;
          return (
            <div key={row[0]!.key} id={`${noteBase}-${n || r + 1}`} className="flex flex-col gap-1">
              {notes.map((note) => (
                <div key={note.id} className="flex flex-wrap items-center gap-2">
                  <p className={cn("text-sm font-medium", note.tone === "danger" ? "text-danger-subtle-fg" : "text-warning-subtle-fg")}>
                    <span className="text-fg">{groupLabel(n || r + 1)}: </span>
                    {note.text}
                  </p>
                  {/* Mã tự điền đúng → người khai xác nhận giữ nguyên mã (lưu như giá trị người khai, hết cảnh báo). */}
                  {note.onConfirm && note.code && (
                    <Button type="button" size="sm" variant="secondary" leftIcon={<CheckCircle2 className="h-4 w-4" />} aria-label={fill(ot.confirmAria, { code: note.code })} onClick={note.onConfirm}>
                      {ot.confirm}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      {firstRowMissing && <p className="text-sm font-medium text-warning-subtle-fg">{t.missingRow1}</p>}
      {footer}
    </FieldFrame>
  );
}
