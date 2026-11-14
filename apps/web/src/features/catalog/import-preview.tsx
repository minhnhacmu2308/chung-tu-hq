"use client";
// Xem trước trước khi nhập (spec §4): số dòng hợp lệ / lỗi, chọn ĐVT Hải quan cho ĐVT lạ trong file, bảng lỗi theo dòng (số dòng Excel).
// Bảng lỗi dùng lại ở tóm tắt sau khi nhập (lỗi server trả về). Mã lỗi luôn hiện bằng câu đã dịch, không hiện mã thô.
import { ITEM_IMPORT_MAX_LENGTH } from "@kb/contracts";
import { Alert, Combobox, createDataTableColumnHelper, DataTable, Field, fill, Grid, pickMessages, Stack, useMessages, useUiLocale } from "@kb/ui";
import { useMemo } from "react";
import { formatNumber } from "@/lib/format";
import { CATALOG_IMPORT_MESSAGES } from "./catalog.messages";
import { fieldLabel } from "./column-mapper";
import { CATALOG_MAPPING_MESSAGES } from "./column-mapping.messages";
import { useUnitOptions } from "./unit-options";

type Messages = (typeof CATALOG_IMPORT_MESSAGES)["vi"];
type MappingMessages = (typeof CATALOG_MAPPING_MESSAGES)["vi"];
/** `group`: bộ mã của lần nhập (Lấy từ chứng từ ra nhiều lần nhập – số dòng trùng nhau giữa các bộ). */
export type ImportErrorRow = { id: string; row: number; field: string; code: string; value: string; group?: string };
export type UnknownUnit = { key: string; unit: string; count: number };

const RATE_FIELDS = new Set(["importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"]);
function formatError(t: Messages, tm: MappingMessages, field: string): string {
  if (field === "hs") return t.errHsFormat;
  if (field === "factor") return t.errFactorFormat;
  if (field === "unit") return t.errUnitFormat;
  if (field === "kind") return tm.errKindFormat;
  if (field === "origin") return tm.errOriginFormat;
  if (RATE_FIELDS.has(field)) return tm.errRateFormat;
  return t.errINVALID_FORMAT;
}

export function rowErrorText(t: Messages, tm: MappingMessages, field: string, code: string): string {
  if (code === "TOO_LONG") return fill(t.errTOO_LONG, { max: field in ITEM_IMPORT_MAX_LENGTH ? ITEM_IMPORT_MAX_LENGTH[field as keyof typeof ITEM_IMPORT_MAX_LENGTH] : "" });
  if (code === "INVALID_FORMAT") return formatError(t, tm, field);
  if (code === "MISSING" || code === "DUPLICATE_IN_FILE" || code === "UNKNOWN_UNIT") return t[`err${code}`];
  return t.errOther;
}

const col = createDataTableColumnHelper<ImportErrorRow>();
function buildColumns(t: Messages, tm: MappingMessages, withGroup: boolean) {
  return col.columns([
    ...(withGroup ? [col.accessor((r) => r.group ?? "", { id: "group", header: t.colSet, size: 220, meta: { wrap: true } })] : []),
    col.accessor("row", { header: t.colRow, size: 80, meta: { sticky: !withGroup } }),
    col.accessor((r) => fieldLabel(tm, r.field), { id: "field", header: t.colField, size: 160 }),
    col.accessor((r) => rowErrorText(t, tm, r.field, r.code), { id: "error", header: t.colError, size: 280, meta: { wrap: true } }),
    col.accessor("value", { header: t.colValue, size: 240, meta: { wrap: true }, cell: (c) => <span className="break-all text-fg">{c.getValue()}</span> }),
  ]);
}

export function ImportErrorTable({ rows }: { rows: readonly ImportErrorRow[] }) {
  const t = useMessages(CATALOG_IMPORT_MESSAGES);
  const locale = useUiLocale();
  const withGroup = rows.some((r) => r.group);
  const columns = useMemo(() => buildColumns(pickMessages(CATALOG_IMPORT_MESSAGES, locale), pickMessages(CATALOG_MAPPING_MESSAGES, locale), withGroup), [locale, withGroup]);
  return <DataTable aria-label={t.errorsLabel} columns={columns} data={rows} getRowId={(r) => r.id} searchable pagination={{ mode: "client", initialPageSize: 10 }} />;
}

export function ImportPreview({
  ok, bad, unknownUnits, unitMap, onUnitMap, errors,
}: {
  ok: number;
  bad: number;
  unknownUnits: readonly UnknownUnit[];
  unitMap: Readonly<Record<string, string>>;
  onUnitMap: (key: string, code: string | null) => void;
  errors: readonly ImportErrorRow[];
}) {
  const t = useMessages(CATALOG_IMPORT_MESSAGES);
  const units = useUnitOptions();
  return (
    <Stack gap="md">
      {bad ? (
        <Alert tone="warning">{fill(t.previewSummary, { ok: formatNumber(ok), bad: formatNumber(bad) })}</Alert>
      ) : (
        <Alert tone="success">{fill(t.previewAllOk, { n: formatNumber(ok) })}</Alert>
      )}
      {unknownUnits.length > 0 && (
        <Stack gap="sm">
          <p className="font-medium text-fg">{t.unitsTitle}</p>
          <p className="text-sm text-fg-muted">{t.unitsHint}</p>
          <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="md">
            {unknownUnits.map((u) => (
              <Field key={u.key} label={fill(t.unitFor, { unit: u.unit, n: u.count })}>
                <Combobox options={units} value={unitMap[u.key] ?? null} onChange={(v) => onUnitMap(u.key, v)} placeholder={t.unitPlaceholder} clearable />
              </Field>
            ))}
          </Grid>
        </Stack>
      )}
      {errors.length > 0 && <ImportErrorTable rows={errors} />}
    </Stack>
  );
}
