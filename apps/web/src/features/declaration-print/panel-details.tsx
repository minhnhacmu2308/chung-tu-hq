"use client";
// Thân panel sửa ô: lý do ô có trên tờ khai + hướng dẫn khai, lỗi Hải quan của chỉ tiêu, căn cứ chỉ đọc, nguồn giá trị (loại chứng từ),
// nút "Xem ở bước OCR" / "Chọn mã HS" cho ô không sửa trên tờ khai, và ô nhập (FormField) cho mọi ô cùng nhóm.
import { Alert, Button, Stack } from "@kb/ui";
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
  onHs: (item: LineItem) => void;
};

/** Nguồn giá trị: chỉ tiêu tờ khai lưu kèm loại chứng từ (`DeclarationField.source`); người khai sửa tay → "Người khai nhập". */
function sourceLabel(kind: Kind, decl: Declaration, key: string, item: LineItem | undefined): string | null {
  const f = item ? decl.fields.find((x) => x.code === itemFieldCode(item.id, key)) : decl.fields.find((x) => formKeysOf(kind, x.code).includes(key));
  if (!f) return null;
  if (f.source === "USER") return "Người khai nhập";
  return (DOC_KIND_LABELS as Record<string, string>)[f.source] ?? null;
}

export function PanelDetails({ kind, spot, item, decl, values, onChange, lockOf, errors, readOnlyReason, onOcr, onHs }: Props) {
  const field = spot.field;
  const ctx = conditionContext(kind, values);
  const condition = field.condition ?? spot.parentCondition ?? spot.blockCondition;
  const lock = lockOf(field.key);
  const itemClass = isItemFieldKey(kind, field.key) ? itemFieldClass(kind, field.key) : null;
  const fromDocs = field.origin !== "CUSTOMS" && (itemClass === "DOC" || itemClass === "DERIVED" || (!itemClass && !readOnlyReason && lock === DERIVED_LOCK));
  const source = sourceLabel(kind, decl, field.key, item);

  return (
    <Stack gap="md">
      <Stack direction="row" gap="xs" align="start">
        <p className="min-w-0 flex-1 text-sm text-fg-muted">
          {condition ? `Có trên tờ khai vì: ${DECLARATION_CONDITIONS[condition].label}` : field.origin === "CUSTOMS" ? "Hải quan trả về" : "Chỉ tiêu của tờ khai"}
          {source && ` · Nguồn: ${source}`}
        </p>
        <GuideButton kind={kind} no={fieldGuideNo(field, spot.parentNo)} role={fieldRole(kind, field, spot.parentNo)} label={field.label} />
      </Stack>

      {errors.map((e, i) => (
        <Alert key={`${e.code}-${i}`} tone="danger" title={`${e.code} · ${e.message}`}>
          {e.solution}
        </Alert>
      ))}

      {readOnlyReason ? (
        <Alert tone="info" title="Chỉ đọc">{readOnlyReason}</Alert>
      ) : (
        lock === DERIVED_LOCK && fromDocs && <Alert tone="info" title="Tính từ chứng từ">Sửa số liệu ở bước OCR rồi dựng lại tờ khai.</Alert>
      )}

      {(fromDocs || (itemClass === "HS" && item && !readOnlyReason)) && (
        <Stack direction="row" gap="sm" wrap>
          {fromDocs && (
            <Button size="sm" variant="secondary" leftIcon={<FileSearch className="h-4 w-4" />} onClick={onOcr}>
              Xem ở bước OCR
            </Button>
          )}
          {itemClass === "HS" && item && !readOnlyReason && (
            <Button size="sm" variant="secondary" leftIcon={<Search className="h-4 w-4" />} onClick={() => onHs(item)}>
              Chọn mã HS
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
