// Xuất bảng đọc chứng từ ra Excel: mỗi chứng từ một sheet, cột STT | TÊN TRƯỜNG | TRỊ GIÁ (như bảng người khai lập tay).
// Dùng ở route server (chế độ http) và trong trình duyệt (chế độ mock).
import ExcelJS from "exceljs";
import type { DocumentSheet } from "@kb/contracts";
import type { UiLocale } from "@kb/ui";
import { DOCUMENT_SHEETS_XLSX_MESSAGES } from "./document-sheets-xlsx.messages";

/** Tên sheet hợp lệ Excel: bỏ đuôi file, bỏ ký tự cấm \ / ? * [ ] :, tối đa 31 ký tự, không trùng. */
export function sheetNameFor(fileName: string, used: Set<string>, fallback = DOCUMENT_SHEETS_XLSX_MESSAGES.vi.fallbackSheet): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/?*[\]:]+/g, " ").replace(/\s+/g, " ").trim() || fallback;
  let name = base.slice(0, 31);
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
  used.add(name);
  return name;
}

/** `locale`: ngôn ngữ tiêu đề cột (mặc định "vi"). Tên trường/giá trị là dữ liệu chứng từ – giữ nguyên. */
export async function buildDocumentSheetsWorkbook(sheets: DocumentSheet[], locale: UiLocale = "vi"): Promise<ArrayBuffer> {
  const t = DOCUMENT_SHEETS_XLSX_MESSAGES[locale];
  const wb = new ExcelJS.Workbook();
  // kb-allow-raw: tên sản phẩm (thương hiệu) ghi vào metadata file Excel, không dịch
  wb.creator = "KhaiBáo AI";
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetNameFor(s.fileName, used, t.fallbackSheet));
    ws.columns = [{ header: t.stt, key: "stt", width: 6 }, { header: t.label, key: "label", width: 40 }, { header: t.value, key: "value", width: 80 }];
    ws.getRow(1).font = { bold: true };
    for (const r of s.rows) ws.addRow({ stt: r.stt, label: r.label, value: r.value });
    ws.eachRow((row) => row.eachCell((cell) => void (cell.alignment = { vertical: "top", wrapText: true })));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
