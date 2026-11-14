"use client";
// Bước Ghép cột khi nhập file (spec 2026-11-14 §4): mỗi cột của file → một trong 17 trường hệ thống (ITEM_IMPORT_FIELDS) hoặc "Bỏ qua".
// Cột đã đoán theo tên (hoặc theo lần ghép trước của bộ – column-map.ts); mỗi trường chỉ gán một cột (trường đang dùng ở cột khác hiện mờ);
// Mã + Tên bắt buộc. Bộ nhận không phải bộ nguồn gốc → các trường thông tin mặt hàng không gán được, cột đã gán sẽ bỏ qua (không gửi đi) + Alert.
// Xem trước 5 dòng đầu theo ghép cột.
import { ITEM_IMPORT_FIELDS, type ItemColumnMap, type ItemImportField, type ItemImportRow } from "@kb/contracts";
import { Alert, createDataTableColumnHelper, DataTable, Field, fill, Grid, pickMessages, Select, Stack, useMessages, useUiLocale } from "@kb/ui";
import { useMemo } from "react";
import { assignColumn, fieldOfColumn, ignoredFields, isItemOnlyField, missingRequired } from "./column-map";
import { CATALOG_MAPPING_MESSAGES } from "./column-mapping.messages";
import { columnLetter } from "./read-xlsx";

type Messages = (typeof CATALOG_MAPPING_MESSAGES)["vi"];

/** Nhãn đã dịch của trường hệ thống; trường lạ → giữ nguyên. */
export const fieldLabel = (t: Messages, field: string) => ((ITEM_IMPORT_FIELDS as readonly string[]).includes(field) ? t[`f_${field as ItemImportField}`] : field);
const columnTitle = (t: Messages, headers: readonly string[], i: number) =>
  headers[i] ? fill(t.column, { col: columnLetter(i), header: headers[i]! }) : fill(t.columnEmpty, { col: columnLetter(i) });

export function ColumnMapper({
  headers, map, onChange, isSource, setName, sourceName, remembered,
}: {
  headers: readonly string[];
  map: ItemColumnMap;
  onChange: (next: ItemColumnMap) => void;
  /** Bộ nhận dữ liệu là bộ nguồn gốc (mới áp thông tin mặt hàng). */
  isSource: boolean;
  setName: string;
  sourceName: string | null;
  /** Đã dùng lại ghép cột lần trước của bộ. */
  remembered: boolean;
}) {
  const t = useMessages(CATALOG_MAPPING_MESSAGES);
  const ignored = ignoredFields(map, isSource);
  const missing = missingRequired(map);
  const optionsFor = (col: number) => [
    { value: "", label: t.skip },
    ...ITEM_IMPORT_FIELDS.map((f) => {
      const usedAt = map[f];
      const label = fieldLabel(t, f);
      if (usedAt !== undefined && usedAt !== col) return { value: f, label: fill(t.usedBy, { field: label, col: columnLetter(usedAt) }), disabled: true };
      if (!isSource && isItemOnlyField(f) && usedAt !== col) return { value: f, label: fill(t.itemOnly, { field: label }), disabled: true };
      return { value: f, label };
    }),
  ];
  return (
    <Stack gap="md">
      <p className="text-sm text-fg-muted">{t.hint}</p>
      <p className="text-sm text-fg-muted">{t.linkHint}</p>
      {remembered && <Alert tone="info">{t.remembered}</Alert>}
      {!isSource && (
        <Alert tone="warning" title={fill(t.nonSourceTitle, { set: setName })}>
          {ignored.length
            ? fill(t.nonSourceBody, { fields: ignored.map((f) => fieldLabel(t, f)).join(", "), source: sourceName ?? t.noSource })
            : fill(t.nonSourceItemOnly, { source: sourceName ?? t.noSource })}
        </Alert>
      )}
      <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="md">
        {headers.map((_, i) => {
          const field = fieldOfColumn(map, i);
          const skipped = !!field && !isSource && isItemOnlyField(field);
          return (
            <Field key={i} label={columnTitle(t, headers, i)} {...(skipped ? { hint: t.ignored } : {})}>
              <Select options={optionsFor(i)} value={field ?? ""} onChange={(e) => onChange(assignColumn(map, i, e.target.value as ItemImportField | ""))} />
            </Field>
          );
        })}
      </Grid>
      {missing.length > 0 && <Alert tone="warning">{fill(t.required, { fields: missing.map((f) => fieldLabel(t, f)).join(", ") })}</Alert>}
    </Stack>
  );
}

type PreviewRow = { id: string; excelRow: number; row: ItemImportRow };
const col = createDataTableColumnHelper<PreviewRow>();

/** Xem trước 5 dòng đầu theo ghép cột (chỉ các trường sẽ gửi đi, theo thứ tự trường hệ thống). */
export function MappedRowsPreview({ rows, rowNumbers, map }: { rows: readonly ItemImportRow[]; rowNumbers: readonly number[]; map: ItemColumnMap }) {
  const t = useMessages(CATALOG_MAPPING_MESSAGES);
  const locale = useUiLocale();
  const fields = ITEM_IMPORT_FIELDS.filter((f) => map[f] !== undefined);
  const key = fields.join(",");
  const columns = useMemo(() => {
    const m = pickMessages(CATALOG_MAPPING_MESSAGES, locale);
    return col.columns([
      col.accessor("excelRow", { header: m.colRow, size: 70, meta: { sticky: true, hideable: false } }),
      ...key.split(",").filter(Boolean).map((f) =>
        col.accessor((r) => r.row[f as ItemImportField] ?? "", {
          id: f, header: fieldLabel(m, f), size: f === "name" || f === "description" ? 240 : 140, meta: { wrap: true },
          cell: (c) => <span className="break-words text-fg">{c.getValue()}</span>,
        }),
      ),
    ]);
  }, [locale, key]);
  const data = rows.slice(0, 5).map((row, i) => ({ id: String(i), excelRow: rowNumbers[i] ?? i + 1, row }));
  return <DataTable aria-label={t.previewLabel} columns={columns} data={data} getRowId={(r) => r.id} pagination={false} />;
}
