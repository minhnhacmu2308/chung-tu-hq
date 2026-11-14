// Xuất Excel của danh mục ngay trên trình duyệt (exceljs, nạp khi cần – như bảng danh sách container KVGS):
// (1) danh sách mặt hàng theo bộ mã đang xem (cột mã/tên/ĐVT theo bộ đó; không chọn bộ → mã hiển thị chính),
// (2) bảng đối chiếu mã: mỗi dòng một mã nối + mã ở mọi bộ + hệ số quy đổi, (3) file đối chiếu cho một bộ để bộ phận điền mã rồi nhập lại.
// Tiêu đề cột theo ngôn ngữ đang chọn.
import { itemUnitKey, type CatalogItemListRow, type CodeSet, type CrossReference } from "@kb/contracts";
import { fill, pickMessages, statusLabel, type UiLocale } from "@kb/ui";
import { CATALOG_MESSAGES } from "./catalog.messages";
import { codeSetStatus } from "./code-set-label";
import { MAPPING_TEMPLATE_MESSAGES } from "./mapping-template.messages";

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

// ---------- file đối chiếu mã (tab Nhập dữ liệu → "Tải file đối chiếu") ----------

/** Một dòng của file đối chiếu: Mã nối + cột tham khảo (bộ nguồn gốc) + cột bộ phận điền (mã/tên/ĐVT/quy đổi của bộ đích). */
export type MappingTemplateRow = { linkCode: string; refCode: string; refName: string; refHs: string; refUnit: string; code: string; name: string; unit: string; factor: string };
/** Mã/tên/ĐVT hiện có của mặt hàng ở bộ đích (theo mã nối). */
export type TargetAliasInfo = { name: string | null; unit: string | null };

/**
 * Dòng file đối chiếu cho bộ `targetSetId`: mỗi mặt hàng một dòng (đã có nhiều mã ở bộ đích → mỗi mã một dòng). Mặt hàng đã có mã ở bộ đích →
 * điền sẵn mã/tên/ĐVT của bộ đó + hệ số đã có; chưa có → trống mã, tên = tên mặt hàng (bộ phận sửa nếu gọi khác).
 */
export function mappingTemplateRows(ref: CrossReference, sourceSetId: string | null, targetSetId: string, target: ReadonlyMap<string, TargetAliasInfo>): MappingTemplateRow[] {
  const out: MappingTemplateRow[] = [];
  for (const r of ref.rows) {
    const base = {
      linkCode: r.itemNo, refCode: sourceSetId ? (r.codes[sourceSetId] ?? []).join(", ") : "", refName: r.name, refHs: r.hs ?? "", refUnit: r.baseUnit ?? "",
    };
    const codes = r.codes[targetSetId] ?? [];
    if (!codes.length) {
      out.push({ ...base, code: "", name: r.name, unit: "", factor: "" });
      continue;
    }
    const info = target.get(r.itemNo);
    const unit = info?.unit ?? "";
    const differs = !!unit && !!r.baseUnit && itemUnitKey(unit) !== itemUnitKey(r.baseUnit);
    const factor = differs ? (Object.entries(r.factors).find(([u]) => itemUnitKey(u) === itemUnitKey(unit))?.[1] ?? "") : "";
    for (const code of codes) out.push({ ...base, code, name: info?.name ?? r.name, unit, factor });
  }
  return out;
}

/** Excel file đối chiếu: trang "Đối chiếu" (cột mã dạng Text để không mất số 0 đầu) + trang "Hướng dẫn". */
export function buildMappingTemplateXlsx(rows: readonly MappingTemplateRow[], names: { set: string; source: string }, locale: UiLocale): Promise<Blob> {
  const t = pickMessages(MAPPING_TEMPLATE_MESSAGES, locale);
  return toBlob((wb) => {
    const ws = wb.addWorksheet(t.sheet.slice(0, 31));
    ws.columns = [
      { header: t.colLink, key: "linkCode", width: 14 },
      { header: fill(t.colRefCode, { source: names.source }), key: "refCode", width: 20 },
      { header: t.colRefName, key: "refName", width: 40 },
      { header: t.colRefHs, key: "refHs", width: 12 },
      { header: t.colRefUnit, key: "refUnit", width: 10 },
      { header: t.colCode, key: "code", width: 20 },
      { header: t.colName, key: "name", width: 40 },
      { header: t.colUnit, key: "unit", width: 10 },
      { header: t.colFactor, key: "factor", width: 12 },
    ];
    for (const k of ["linkCode", "refCode", "refHs", "code"]) ws.getColumn(k).numFmt = "@";
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of rows) ws.addRow(r);
    const guide = wb.addWorksheet(t.guideSheet.slice(0, 31));
    guide.getColumn(1).width = 120;
    for (const line of [t.guide1, t.guide2, t.guide3, t.guide4, t.guide5]) guide.addRow([fill(line, names)]);
  });
}
