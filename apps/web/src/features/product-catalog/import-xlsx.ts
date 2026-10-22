// Đọc bảng kê dòng hàng đã khai (Excel xuất từ phần mềm khai báo: mỗi dòng = một dòng hàng của một tờ khai, có cột
// "Tên hàng", "Mã HS"…) và gộp thành danh sách mặt hàng để import vào danh mục. Chạy trong trình duyệt (cả mock lẫn http):
// server chỉ nhận mặt hàng đã gộp (ImportProductCatalogInputSchema) → request nhỏ, gửi theo lô.
import { codeFromProductName, ProductImportItemSchema, productKey, type ProductImportItem } from "@kb/contracts";
import type ExcelJS from "exceljs";

/** Trường cần lấy → các tên cột chấp nhận (so sánh sau khi bỏ dấu, chữ thường, bỏ ký tự đặc biệt). */
const COLUMNS = {
  name: ["ten hang", "ten hang hoa", "mo ta hang hoa", "description"],
  hsCode: ["ma hs", "hs code", "ma so hang hoa"],
  code: ["ma hang", "ma san pham", "sku"],
  unit: ["dvt sl1", "dvt", "don vi tinh", "unit"],
  origin: ["xuat xu", "nuoc xuat xu", "origin"],
  tariffSchedule: ["bieu thue nhap khau", "ma bieu thue", "bieu thue"],
  importDutyRate: ["thue suat nk", "thue suat nhap khau"],
  vatRate: ["thue suat vat", "thue suat gtgt"],
  declarationNo: ["so tk", "so to khai"],
  declarationDate: ["ngay dk", "ngay dang ky"],
  typeCode: ["ma loai hinh"],
} as const;
type Column = keyof typeof COLUMNS;
const REQUIRED: Column[] = ["name", "hsCode"];

export type ImportIssue = { row: number; reason: "missingName" | "invalidHs" };
export type ParsedCatalog = {
  items: ProductImportItem[];
  /** Số dòng hàng đọc được (không tính dòng trống). */
  rows: number;
  issues: ImportIssue[];
  /** Mặt hàng có nhiều mã HS khác nhau trong file (lấy mã ở tờ khai mới nhất). */
  conflicts: { name: string; hsCodes: string[] }[];
  /** Cột bắt buộc không tìm thấy → không đọc được file. */
  missingColumns: Column[];
};

/** Bỏ dấu tiếng Việt + ký tự đặc biệt: "Thuế suất NK(%)" → "thue suat nk". */
export function normalizeHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\u0111\u0110]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Ô định dạng % (0.18 hiển thị "18%") → 18
    if (/%/.test(cell.numFmt ?? "")) return String(Math.round(v * 1e6) / 1e4);
    return String(v);
  }
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("result" in v) return v.result == null ? "" : String(v.result instanceof Date ? v.result.toISOString().slice(0, 10) : v.result);
    if ("text" in v) return String(v.text);
  }
  return String(v).trim();
}

/** "27/03/2026" | "2026-03-27" → "2026-03-27"; sai → null. */
function isoDate(s: string): string | null {
  const t = s.trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** "18%" | "18" | "7,5" → "18" / "7.5"; rỗng hoặc sai → null. */
function rate(s: string): string | null {
  const t = s.replace(/%/g, "").replace(",", ".").trim();
  return /^\d+(\.\d+)?$/.test(t) ? String(Number(t)) : null;
}

/** Mã HS số (mất số 0 đầu khi Excel lưu dạng số) → 8 chữ số; sai → null. */
function hs(s: string): string | null {
  const d = s.replace(/[.\s]/g, "");
  if (!/^\d{7,8}$/.test(d)) return null;
  return d.padStart(8, "0");
}

const nullIfEmpty = (s: string, max: number) => (s.trim() ? s.trim().slice(0, max) : null);

/** Đọc sheet đầu tiên có đủ cột bắt buộc. */
export async function parseCatalogWorkbook(data: ArrayBuffer): Promise<ParsedCatalog> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  let best: ParsedCatalog | null = null;
  for (const ws of wb.worksheets) {
    const parsed = parseSheet(ws);
    if (!parsed.missingColumns.length) return parsed;
    if (!best || parsed.missingColumns.length < best.missingColumns.length) best = parsed;
  }
  return best ?? { items: [], rows: 0, issues: [], conflicts: [], missingColumns: [...REQUIRED] };
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedCatalog {
  // Tìm dòng tiêu đề trong 10 dòng đầu (có thể có dòng tiêu đề báo cáo phía trên).
  let headerRow = 0;
  let index: Partial<Record<Column, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const found: Partial<Record<Column, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const h = normalizeHeader(cellText(cell));
      for (const [key, aliases] of Object.entries(COLUMNS) as [Column, readonly string[]][]) {
        if (found[key] === undefined && aliases.includes(h)) found[key] = col;
      }
    });
    if (Object.keys(found).length > Object.keys(index).length) {
      index = found;
      headerRow = r;
    }
  }
  const missingColumns = REQUIRED.filter((c) => index[c] === undefined);
  if (missingColumns.length) return { items: [], rows: 0, issues: [], conflicts: [], missingColumns };

  const headers: string[] = [];
  ws.getRow(headerRow).eachCell((cell, col) => (headers[col] = cellText(cell).trim()));

  type Acc = { item: ProductImportItem; hsCodes: Set<string>; lines: Set<string> };
  const groups = new Map<string, Acc>();
  const issues: ImportIssue[] = [];
  let rows = 0;
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (c: Column) => (index[c] ? cellText(row.getCell(index[c]!)) : "");
    if (!row.hasValues || headers.every((_, col) => !cellText(row.getCell(col)))) continue;
    rows++;
    const name = get("name").trim();
    if (!name) {
      issues.push({ row: r, reason: "missingName" });
      continue;
    }
    const hsCode = hs(get("hsCode"));
    if (!hsCode) {
      issues.push({ row: r, reason: "invalidHs" });
      continue;
    }
    const code = nullIfEmpty(get("code"), 50) ?? codeFromProductName(name);
    const date = isoDate(get("declarationDate"));
    const raw: Record<string, string> = {};
    headers.forEach((h, col) => {
      if (h) raw[h.slice(0, 100)] = cellText(row.getCell(col)).slice(0, 2000);
    });
    const origin = get("origin").trim().toUpperCase();
    const item: ProductImportItem = {
      code,
      name: name.slice(0, 1000),
      hsCode,
      unit: nullIfEmpty(get("unit"), 10),
      origin: /^[A-Z]{2}$/.test(origin) ? origin : null,
      tariffSchedule: nullIfEmpty(get("tariffSchedule"), 10),
      importDutyRate: rate(get("importDutyRate")),
      vatRate: rate(get("vatRate")),
      note: null,
      timesDeclared: 1,
      lastDeclarationNo: nullIfEmpty(get("declarationNo"), 20),
      lastDeclarationDate: date,
      lastTypeCode: nullIfEmpty(get("typeCode"), 5),
      raw,
    };
    const key = productKey(code, name);
    const g = groups.get(key);
    // Một tờ khai có thể lặp mặt hàng ở nhiều dòng: đếm số tờ khai khác nhau (không có số TK thì đếm theo dòng).
    const lineId = item.lastDeclarationNo ?? `row:${r}`;
    if (!g) {
      groups.set(key, { item, hsCodes: new Set([hsCode]), lines: new Set([lineId]) });
      continue;
    }
    g.hsCodes.add(hsCode);
    g.lines.add(lineId);
    if ((date ?? "") >= (g.item.lastDeclarationDate ?? "")) g.item = { ...item, code: item.code ?? g.item.code };
  }
  const items = [...groups.values()].map((g) => ProductImportItemSchema.parse({ ...g.item, timesDeclared: g.lines.size }));
  const conflicts = [...groups.values()].filter((g) => g.hsCodes.size > 1).map((g) => ({ name: g.item.name, hsCodes: [...g.hsCodes] }));
  return { items, rows, issues, conflicts, missingColumns: [] };
}

/** Chia lô để gửi server (giới hạn kích thước request). */
export function chunks<T>(xs: T[], size = 500): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
