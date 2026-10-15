// Xuất bảng đọc chứng từ ra Excel: mỗi chứng từ một sheet, cột STT | TÊN TRƯỜNG | TRỊ GIÁ (như bảng người khai lập tay).
// Dùng ở route server (chế độ http) và trong trình duyệt (chế độ mock).
import ExcelJS from "exceljs";
import type { DocumentSheet } from "@kb/contracts";

/** Tên sheet hợp lệ Excel: bỏ đuôi file, bỏ ký tự cấm \ / ? * [ ] :, tối đa 31 ký tự, không trùng. */
export function sheetNameFor(fileName: string, used: Set<string>): string {
  const base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[\\/?*[\]:]+/g, " ").replace(/\s+/g, " ").trim() || "Chứng từ";
  let name = base.slice(0, 31);
  for (let n = 2; used.has(name); n++) name = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
  used.add(name);
  return name;
}

export async function buildDocumentSheetsWorkbook(sheets: DocumentSheet[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "KhaiBáo AI";
  const used = new Set<string>();
  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetNameFor(s.fileName, used));
    ws.columns = [{ header: "STT", key: "stt", width: 6 }, { header: "TÊN TRƯỜNG", key: "label", width: 40 }, { header: "TRỊ GIÁ", key: "value", width: 80 }];
    ws.getRow(1).font = { bold: true };
    for (const r of s.rows) ws.addRow({ stt: r.stt, label: r.label, value: r.value });
    ws.eachRow((row) => row.eachCell((cell) => void (cell.alignment = { vertical: "top", wrapText: true })));
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
