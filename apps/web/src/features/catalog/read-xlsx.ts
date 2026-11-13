// Đọc file Excel danh mục của một bộ phận ngay trên trình duyệt (exceljs nạp khi cần – dời từ product-catalog/import-xlsx.ts cũ):
// tìm trang tính + dòng tiêu đề nhận được nhiều cột nhất (10 dòng đầu, có thể có dòng tên báo cáo phía trên), giữ số dòng Excel để báo lỗi,
// bỏ dòng trống. Chưa kiểm gì và KHÔNG cắt bớt – `validateItemRows` (@kb/contracts) kiểm ở bước xem trước (dài quá → TOO_LONG), server kiểm lại.
// Ô số trên Excel mất số 0 đầu và dấu chấm (mã HS 0801.32.00 → 8013200; mã "0012" → 12): chỉ mã HS ô số được bù số 0 (HS luôn có số chữ
// số chẵn); mã hàng thì không đoán được – giao diện khuyên định dạng cột mã/HS là Text.
import { detectItemColumns, type ItemColumnMap, type ItemImportRow } from "@kb/contracts";
import type ExcelJS from "exceljs";

export type ItemSheet = {
  sheetName: string;
  /** Tiêu đề từng cột (chỉ số 0 = cột A); cột không có tiêu đề là "". */
  headers: string[];
  /** Dòng dữ liệu (không tính dòng trống), mỗi ô là chuỗi. */
  rows: string[][];
  /** Ô nào lưu dạng số trên Excel (cùng kích thước `rows`) – để bù số 0 đầu cho mã HS chỉ khi ô là số. */
  numeric: boolean[][];
  /** Số dòng trên Excel của từng dòng dữ liệu (báo lỗi theo dòng người dùng nhìn thấy). */
  rowNumbers: number[];
  /** Cột tự nhận theo tên. */
  detected: ItemColumnMap;
};

const HEADER_SCAN_ROWS = 10;

/** 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

type CellValue = { text: string; numeric: boolean };
const text = (s: string): CellValue => ({ text: s.trim(), numeric: false });

function readCell(cell: ExcelJS.Cell): CellValue {
  const v = cell.value;
  if (v == null) return text("");
  if (v instanceof Date) return text(v.toISOString().slice(0, 10));
  if (typeof v === "number") return { text: String(v), numeric: true };
  if (typeof v === "boolean") return text(String(v));
  if (typeof v === "object") {
    if ("richText" in v) return text(v.richText.map((t) => t.text).join(""));
    if ("result" in v) {
      const res = v.result;
      if (res == null) return text("");
      if (typeof res === "number") return { text: String(res), numeric: true };
      return text(String(res instanceof Date ? res.toISOString().slice(0, 10) : res));
    }
    if ("text" in v) return text(String(v.text));
    return text("");
  }
  return text(String(v));
}

function rowCells(ws: ExcelJS.Worksheet, r: number, width: number): CellValue[] {
  const row = ws.getRow(r);
  return Array.from({ length: width }, (_, i) => readCell(row.getCell(i + 1)));
}

const texts = (cells: readonly CellValue[]) => cells.map((c) => c.text);
const isEmpty = (cells: readonly CellValue[]) => cells.every((c) => !c.text);
const score = (headers: readonly string[]) => Object.keys(detectItemColumns(headers)).length;

/** Đọc file .xlsx; không có dòng nào có dữ liệu → null. */
export async function readItemWorkbook(data: ArrayBuffer): Promise<ItemSheet | null> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  let best: { ws: ExcelJS.Worksheet; headerRow: number; score: number } | null = null;
  for (const ws of wb.worksheets) {
    const width = ws.columnCount;
    if (!ws.rowCount || !width) continue;
    for (let r = 1; r <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); r++) {
      const cells = rowCells(ws, r, width);
      if (isEmpty(cells)) continue;
      const s = score(texts(cells));
      // Chưa có ứng viên → lấy dòng có dữ liệu đầu tiên (người dùng tự ghép cột); sau đó chỉ thay khi nhận được nhiều cột hơn.
      if (!best || s > best.score) best = { ws, headerRow: r, score: s };
    }
  }
  if (!best) return null;
  const { ws, headerRow } = best;
  const width = ws.columnCount;
  const headers = texts(rowCells(ws, headerRow, width));
  const rows: string[][] = [];
  const numeric: boolean[][] = [];
  const rowNumbers: number[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const cells = rowCells(ws, r, width);
    if (isEmpty(cells)) continue;
    rows.push(texts(cells));
    numeric.push(cells.map((c) => c.numeric));
    rowNumbers.push(r);
  }
  return { sheetName: ws.name, headers, rows, numeric, rowNumbers, detected: detectItemColumns(headers) };
}

/** Mã HS ô số mất số 0 đầu (0101 → 101, 08013200 → 8013200): HS luôn có số chữ số chẵn → bù một số 0. Ô chữ giữ nguyên (để kiểm báo sai). */
function fixNumericHs(s: string): string {
  return /^\d+$/.test(s) && s.length % 2 === 1 && s.length >= 3 && s.length <= 9 ? `0${s}` : s;
}

/** Dòng dữ liệu → dòng nhập theo cột đã ghép (trường không ghép hoặc ô trống thì bỏ). Không cắt bớt – dài quá do bước kiểm báo lỗi. */
export function toImportRows(sheet: Pick<ItemSheet, "rows"> & Partial<Pick<ItemSheet, "numeric">>, map: ItemColumnMap): ItemImportRow[] {
  return sheet.rows.map((cells, r) => {
    const get = (field: keyof ItemColumnMap) => {
      const i = map[field];
      return i === undefined ? "" : (cells[i] ?? "").trim();
    };
    const unit = get("unit");
    const hsRaw = get("hs");
    const hs = map.hs !== undefined && sheet.numeric?.[r]?.[map.hs] ? fixNumericHs(hsRaw) : hsRaw;
    const factor = get("factor");
    return { code: get("code"), name: get("name"), ...(unit ? { unit } : {}), ...(hs ? { hs } : {}), ...(factor ? { factor } : {}) };
  });
}

/** Nội dung file đã chọn (FileReader cho trình duyệt/jsdom không có Blob.arrayBuffer). */
export function readFileBuffer(file: Blob): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}
