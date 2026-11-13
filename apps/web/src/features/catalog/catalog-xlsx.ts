// Xuất Excel của danh mục ngay trên trình duyệt (exceljs, nạp khi cần – như bảng danh sách container KVGS):
// (1) danh sách mặt hàng theo bộ mã đang xem (cột mã/tên/ĐVT theo bộ đó; không chọn bộ → mã hiển thị chính),
// (2) bảng đối chiếu mã: mỗi dòng một mã nối + mã ở mọi bộ + hệ số quy đổi. Tiêu đề cột theo ngôn ngữ đang chọn.
import type { CatalogItemListRow, CodeSet, CrossReference } from "@kb/contracts";
import { fill, pickMessages, statusLabel, type UiLocale } from "@kb/ui";
import { CATALOG_MESSAGES } from "./catalog.messages";
import { codeSetStatus } from "./code-set-label";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "Kho (Kho)" / "SKF KOREA LTD (Nhà cung cấp)" – bộ đối tác có thể trùng tên giữa nhà cung cấp và khách hàng. */
export const setTitle = (set: Pick<CodeSet, "name" | "kind">, locale: UiLocale) => `${set.name} (${statusLabel(codeSetStatus(set.kind), locale)})`;

async function toBlob(build: (wb: import("exceljs").Workbook) => void): Promise<Blob> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  build(wb);
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new Blob([buf], { type: XLSX_TYPE });
}

/** Danh sách mặt hàng: có `set` → mã/tên/ĐVT theo bộ đó (mặt hàng chưa có mã trong bộ → để trống mã, tên/ĐVT gốc). */
export function buildItemsXlsx(rows: readonly CatalogItemListRow[], set: Pick<CodeSet, "name" | "kind"> | null, locale: UiLocale): Promise<Blob> {
  const t = pickMessages(CATALOG_MESSAGES, locale);
  const kindLabel = (k: CatalogItemListRow["kind"]) => t[`kind${k}`];
  const title = set ? setTitle(set, locale) : null;
  return toBlob((wb) => {
    const ws = wb.addWorksheet(t.sheetItems.slice(0, 31));
    ws.columns = [
      { header: t.colItemNo, key: "itemNo", width: 14 },
      { header: title ? fill(t.colSetCode, { set: title }) : t.colCode, key: "code", width: 20 },
      { header: title ? fill(t.colSetName, { set: title }) : t.colName, key: "name", width: 50 },
      { header: t.colHs, key: "hs", width: 12 },
      { header: title ? fill(t.colSetUnit, { set: title }) : t.colBaseUnit, key: "unit", width: 10 },
      { header: t.colKind, key: "kind", width: 14 },
      { header: t.colSetCount, key: "sets", width: 12 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of rows) {
      ws.addRow({
        itemNo: r.itemNo,
        code: set ? (r.setCode ?? "") : r.displayCode,
        name: set ? (r.setName ?? r.name) : r.name,
        hs: r.hsCode ?? "",
        unit: set ? (r.setUnit ?? r.baseUnit ?? "") : (r.baseUnit ?? ""),
        kind: kindLabel(r.kind),
        sets: r.codeSetCount,
      });
    }
  });
}

/** Bảng đối chiếu mã: mã nối, tên, HS, ĐVT gốc, mỗi bộ mã một cột (nhiều mã nối bằng ", "), cột quy đổi "1 ĐVT = hệ số". */
export function buildCrossRefXlsx(ref: CrossReference, locale: UiLocale): Promise<Blob> {
  const t = pickMessages(CATALOG_MESSAGES, locale);
  return toBlob((wb) => {
    const ws = wb.addWorksheet(t.sheetCrossRef.slice(0, 31));
    ws.columns = [
      { header: t.colItemNo, key: "itemNo", width: 14 },
      { header: t.colName, key: "name", width: 50 },
      { header: t.colHs, key: "hs", width: 12 },
      { header: t.colBaseUnit, key: "baseUnit", width: 10 },
      ...ref.codeSets.map((s) => ({ header: setTitle(s, locale), key: `set:${s.id}`, width: 20 })),
      { header: t.xlsxFactors, key: "factors", width: 30 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of ref.rows) {
      const row: Record<string, string> = { itemNo: r.itemNo, name: r.name, hs: r.hs ?? "", baseUnit: r.baseUnit ?? "" };
      for (const s of ref.codeSets) row[`set:${s.id}`] = (r.codes[s.id] ?? []).join(", ");
      row.factors = Object.entries(r.factors).map(([unit, factor]) => `1 ${unit} = ${factor} ${r.baseUnit ?? ""}`.trim()).join("; ");
      ws.addRow(row);
    }
  });
}
