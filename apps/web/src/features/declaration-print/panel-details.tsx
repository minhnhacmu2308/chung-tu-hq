"use client";
// Thân panel sửa ô: lý do ô có trên tờ khai + hướng dẫn khai, lỗi Hải quan của chỉ tiêu, căn cứ chỉ đọc, nguồn giá trị (loại chứng từ),
// nút "Xem ở bước OCR" / "Chọn mã HS" cho ô không sửa trên tờ khai, và ô nhập (FormField) cho mọi ô cùng nhóm.
import { Alert, Button, fill, Stack, useMessages } from "@kb/ui";
import {
  DECLARATION_CONDITIONS, DERIVED_LOCK, fieldGuideNo, fieldRole, formKeysOf, isItemFieldKey, itemFieldClass, itemFieldCode,
  type Declaration, type LineItem,
} from "@kb/contracts";
import { FileSearch, Search } from "lucide-react";
import { DOC_KIND_LABELS } from "@/mocks/types";
import { AmendLockProvider, type FieldLockLookup } from "../declaration-form/amend-context";
import { FormField, GuideButton } from "../declaration-form/field";
import { conditionContext, type FormValues } from "../declaration-form/form-state";
import type { FieldError } from "../dossier-detail/steps/customs-errors";
import type { FieldSpot } from "./print-state";
import { PRINT_MESSAGES } from "./print.messages";

type Kind = "IDA" | "EDA";

type Props = {
  kind: Kind;
  spot: FieldSpot;
  /** Dòng hàng của ô (ô dòng hàng); undefined = ô chung của tờ khai. */
  item: LineItem | undefined;
  decl: Declaration;
  /** Giá trị đang hiện (bản gốc + Hải quan + phần đang sửa) của tờ khai hoặc của dòng hàng. */
  values: FormValues;
  /** Không truyền → chỉ đọc. */
  onChange: ((key: string, value: string) => void) | undefined;
  lockOf: FieldLockLookup;
  /** Lỗi Hải quan của chỉ tiêu của ô. */
  errors: FieldError[];
  /** Lý do cả panel chỉ đọc (VIEWER / tờ khai chỉ đọc); null = sửa được theo từng ô. */
  readOnlyReason: string | null;
  onOcr: () => void;
  /** Đang lưu → khóa nút sang bước OCR (không rời trang giữa chừng). */
  busy?: boolean;
  onHs: (item: LineItem) => void;
};

/** Nguồn giá trị: chỉ tiêu tờ khai lưu kèm loại chứng từ (`DeclarationField.source`); người khai sửa tay → "Người khai nhập". */
function sourceLabel(kind: Kind, decl: Declaration, key: string, item: LineItem | undefined, labels: { user: string; docKinds: Partial<Record<string, string>> }): string | null {
  const f = item ? decl.fields.find((x) => x.code === itemFieldCode(item.id, key)) : decl.fields.find((x) => formKeysOf(kind, x.code).includes(key));
  if (!f) return null;
  if (f.source === "USER") return labels.user;
  return labels.docKinds[f.source] ?? null;
}

export function PanelDetails({ kind, spot, item, decl, values, onChange, lockOf, errors, readOnlyReason, onOcr, busy = false, onHs }: Props) {
  const t = useMessages(PRINT_MESSAGES);
  const docKinds = useMessages(DOC_KIND_LABELS);
  const field = spot.field;
  const ctx = conditionContext(kind, values);
  const condition = field.condition ?? spot.parentCondition ?? spot.blockCondition;
  const lock = lockOf(field.key);
  const itemClass = isItemFieldKey(kind, field.key) ? itemFieldClass(kind, field.key) : null;
  const fromDocs = field.origin !== "CUSTOMS" && (itemClass === "DOC" || itemClass === "DERIVED" || (!itemClass && !readOnlyReason && lock === DERIVED_LOCK));
  const source = sourceLabel(kind, decl, field.key, item, { user: t.userEntered, docKinds });

  return (
    <Stack gap="md">
      <Stack direction="row" gap="xs" align="start">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          {condition ? fill(t.presentOnDecl, { c: DECLARATION_CONDITIONS[condition].label }) : field.origin === "CUSTOMS" ? t.customsReturned : t.declField}
          {source && fill(t.source, { s: source })}
        </p>
        <GuideButton kind={kind} no={fieldGuideNo(field, spot.parentNo)} role={fieldRole(kind, field, spot.parentNo)} label={field.label} />
      </Stack>

      {errors.map((e, i) => (
        <Alert key={`${e.code}-${i}`} tone="danger" title={`${e.code} · ${e.message}`}>
          {e.solution}
        </Alert>
      ))}

      {readOnlyReason ? (
        <Alert tone="info" title={t.readOnly}>{readOnlyReason}</Alert>
      ) : (
        lock === DERIVED_LOCK && fromDocs && <Alert tone="info" title={t.fromDocs}>{t.fromDocsBody}</Alert>
      )}

      {(fromDocs || (itemClass === "HS" && item && !readOnlyReason)) && (
        <Stack direction="row" gap="sm" wrap>
          {fromDocs && (
            <Button size="sm" variant="secondary" leftIcon={<FileSearch className="h-4 w-4" />} disabled={busy} onClick={onOcr}>
              {t.viewOcr}
            </Button>
          )}
          {itemClass === "HS" && item && !readOnlyReason && (
            <Button size="sm" variant="secondary" leftIcon={<Search className="h-4 w-4" />} onClick={() => onHs(item)}>
              {t.pickHs}
            </Button>
          )}
        </Stack>
      )}

      <AmendLockProvider kind={kind} values={values} active={false} override={lockOf}>
        <Stack gap="sm">
          {spot.group.map((f) => (
            // data-panel-field: panel đặt focus vào đúng ô người dùng chọn trong nhóm.
            <div key={f.key} data-panel-field={f.key} className="contents">
              <FormField
                kind={kind}
                field={f}
                values={values}
                onChange={onChange}
                ctx={ctx}
                showInapplicable
                parentNo={spot.parentNo}
                parentCondition={spot.parentCondition ?? spot.blockCondition}
                fill
              />
            </div>
          ))}
        </Stack>
      </AmendLockProvider>
    </Stack>
  );
}
