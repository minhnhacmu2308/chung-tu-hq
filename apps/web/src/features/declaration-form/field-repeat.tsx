"use client";
// Nhóm lặp (5 vận đơn, 5 giấy phép, 5 khoản điều chỉnh, 10 chỉ thị…) dạng bảng (phương án C): nhãn ở tiêu đề cột, mỗi dòng một hàng,
// nút "Thêm dòng". 50 số container: lưới. Bảng hẹp hơn nội dung thì cuộn ngang trong khung, trang không tràn.
import { Button, Checkbox, cn, FieldFrame, Grid, Input } from "@kb/ui";
import { codeListFor, expandRepeat, fieldRole, type ConditionContext, type ConditionId, type LayoutField, type LayoutRepeat } from "@kb/contracts";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import { useAmendLock } from "./amend-context";
import { CodeInput } from "./code-input";
import { DATE_WIDTH, displayValue, fieldTitle, visibleRows } from "./display";
import { fieldLabelNode, FormField, GuideButton, RoleMark } from "./field";
import { isApplicable, missingRequired, toggleChoice, type FormValues } from "./form-state";

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

function Cell({ kind, f, n, values, onChange }: { kind: "IDA" | "EDA"; f: LayoutField; n: number; values: FormValues; onChange: ((key: string, value: string) => void) | undefined }) {
  const lock = useAmendLock()(f.key);
  const value = values[f.key] ?? "";
  const name = `${f.label} dòng ${n}`;
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
    return <CodeInput table={f.codeTable} fieldKey={f.key} kind={kind} values={values} value={value} onChange={(v) => onChange(f.key, v)} label={f.label} ariaLabel={name} widthClass={WIDTH[f.width ?? "sm"]} />;
  }
  if (f.input === "choice") {
    const opt = f.options?.[0];
    return opt ? <Checkbox label={<span className="sr-only">{`${name}: ${opt.label}`}</span>} checked={value === opt.value} onChange={() => onChange(f.key, toggleChoice(value, opt.value))} /> : null;
  }
  return (
    <Input
      aria-label={name}
      className={cn("h-9", f.input === "date" ? DATE_WIDTH : WIDTH[f.width ?? "sm"])}
      type={f.input === "date" ? "date" : f.input === "time" ? "time" : "text"}
      inputMode={f.input === "number" ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(f.key, e.currentTarget.value)}
    />
  );
}

export function FormFieldRepeat({ kind, repeat, values, onChange, ctx, showInapplicable, parentCondition, dimmed = false }: Props) {
  const [extra, setExtra] = useState(0);
  const applicable = isApplicable(repeat, ctx);
  if (!applicable && !showInapplicable) return null;
  const readOnly = !onChange || repeat.fields.every((f) => f.origin === "CUSTOMS");
  const rows = visibleRows(repeat, values, extra, readOnly);
  if (readOnly && rows.length === 0) return null;
  const first = repeat.fields[0];
  const condition = repeat.condition ?? parentCondition;
  const legend = (
    <>
      {fieldTitle(repeat.no, repeat.label)} <span className="font-normal text-fg-subtle">(tối đa {repeat.count})</span>
      {!readOnly && first && repeat.no && <RoleMark role={fieldRole(kind, first, repeat.no)} />}
    </>
  );
  const guide = !readOnly && <GuideButton kind={kind} no={repeat.no} role={first ? fieldRole(kind, first, repeat.no) : undefined} />;
  const footer = !readOnly && (
    <div className="flex flex-wrap items-center gap-2">
      {rows.length < repeat.count && (
        <Button size="sm" variant="ghost" leftIcon={<Plus className="h-4 w-4" />} onClick={() => setExtra((n) => n + 1)}>
          Thêm dòng
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
  // Như bộ đếm sectionProgress: nhóm lặp bắt buộc khi có ít nhất dòng 1 – dòng thêm không tự báo thiếu.
  const firstRowMissing = !readOnly && applicable && (rows[0] ?? []).some((f) => isApplicable(f, ctx) && missingRequired(kind, f, values, repeat.no ?? f.no, condition, ctx));
  return (
    <FieldFrame data-missing={firstRowMissing || undefined} legend={legend} legendAction={guide} className={box}>
      {/* relative: chữ ẩn (sr-only, định vị tuyệt đối) trong ô bảng nằm trong khung cuộn – không thoát ra làm trang tràn ngang. */}
      <div className="relative min-w-0 overflow-x-auto">
        {/* kb-allow-raw: lưới sửa trực tiếp các dòng của nhóm lặp (vận đơn, giấy phép, khoản điều chỉnh…); DataTable chưa hỗ trợ ô sửa được */}
        <table className="text-sm">
          <thead>
            <tr>
              <th scope="col" className="w-8 pb-1 pr-2 text-left text-xs font-medium text-fg-muted">
                <span className="sr-only">Dòng</span>
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
              return (
                <tr key={row[0]!.key}>
                  <td className="pb-1.5 pr-2 align-middle text-xs tabular-nums text-fg-subtle">({n || r + 1})</td>
                  {cols.map(({ f, i }) => (
                    <td key={f.key} className={cn("pb-1.5 pr-2 align-middle", (off || !isApplicable(f, ctx)) && "opacity-60", readOnly && "min-w-24 max-w-md")}>
                      {row[i] && <Cell kind={kind} f={row[i]} n={n || r + 1} values={values} onChange={readOnly ? undefined : onChange} />}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {firstRowMissing && <p className="text-sm font-medium text-warning-subtle-fg">Còn thiếu ở dòng 1</p>}
      {footer}
    </FieldFrame>
  );
}
