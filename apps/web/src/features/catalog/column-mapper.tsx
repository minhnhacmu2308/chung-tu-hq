"use client";
// Ghép cột của file Excel vào các trường nhập (mã, tên, ĐVT, HS, hệ số quy đổi). Mỗi cột chỉ cho một trường: chọn cột đang dùng ở trường khác
// thì trường kia bỏ ghép. Mã và tên bắt buộc.
import type { ItemColumnMap, ItemImportField } from "@kb/contracts";
import { Field, fill, Grid, Select, useMessages } from "@kb/ui";
import { CATALOG_IMPORT_MESSAGES } from "./catalog.messages";
import { columnLetter } from "./read-xlsx";

type Messages = (typeof CATALOG_IMPORT_MESSAGES)["vi"];
export const IMPORT_FIELDS: readonly ItemImportField[] = ["code", "name", "unit", "hs", "factor"];
const LABEL = { code: "fieldCode", name: "fieldName", unit: "fieldUnit", hs: "fieldHs", factor: "fieldFactor" } as const satisfies Record<ItemImportField, keyof Messages>;
export const fieldLabel = (t: Messages, field: string) => (field in LABEL ? t[LABEL[field as ItemImportField]] : field);

export function ColumnMapper({ headers, map, onChange }: { headers: readonly string[]; map: ItemColumnMap; onChange: (next: ItemColumnMap) => void }) {
  const t = useMessages(CATALOG_IMPORT_MESSAGES);
  const options = [
    { value: "", label: t.colNone },
    ...headers.map((h, i) => ({ value: String(i), label: h ? fill(t.colOption, { col: columnLetter(i), header: h }) : fill(t.colOptionEmpty, { col: columnLetter(i) }) })),
  ];
  const set = (field: ItemImportField, value: string) => {
    const next: ItemColumnMap = {};
    for (const f of IMPORT_FIELDS) if (f !== field && map[f] !== undefined && String(map[f]) !== value) next[f] = map[f]!;
    if (value !== "") next[field] = Number(value);
    onChange(next);
  };
  return (
    <Grid cols={{ base: 1, md: 2, xl: 3 }} gap="md">
      {IMPORT_FIELDS.map((f) => (
        <Field key={f} label={t[LABEL[f]]} required={f === "code" || f === "name"}>
          <Select options={options} value={map[f] === undefined ? "" : String(map[f])} onChange={(e) => set(f, e.target.value)} />
        </Field>
      ))}
    </Grid>
  );
}
