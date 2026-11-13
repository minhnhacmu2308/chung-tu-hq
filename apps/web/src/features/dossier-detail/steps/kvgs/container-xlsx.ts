// Nhập / xuất bảng danh sách container bằng Excel ngay trên trình duyệt (exceljs, nạp khi cần – như bảng đọc chứng từ và danh mục hàng hóa).
// Cột: Số vận đơn | Số container | Số seal | Ghi chú – tiêu đề theo ngôn ngữ đang chọn; khi nhập nhận tiêu đề của cả 3 ngôn ngữ.
import { normalizeContainerNo, type ContainerListRow } from "@kb/contracts";
import { pickMessages, UI_LOCALES, type UiLocale } from "@kb/ui";
import type ExcelJS from "exceljs";
import { KVGS_MESSAGES } from "./kvgs.messages";

type Column = "billNo" | "containerNo" | "sealNo" | "note";
const COLUMNS: readonly Column[] = ["billNo", "containerNo", "sealNo", "note"];
const LABEL_KEY = { billNo: "colBill", containerNo: "colContainer", sealNo: "colSeal", note: "colNote" } as const satisfies Record<Column, keyof (typeof KVGS_MESSAGES)["vi"]>;
/** Tên cột thường gặp trong file của phần mềm khai báo khác (sau khi bỏ dấu, chữ thường). */
const ALIASES: Record<Column, string[]> = {
  billNo: ["so van don", "van don", "so vd", "vd so", "bill no", "b l no", "bl no"],
  containerNo: ["so container", "so cont", "container", "con so", "container no"],
  sealNo: ["so seal", "seal", "so niem phong", "sel so", "seal no"],
  note: ["ghi chu", "note", "notes", "remark"],
};

/** Bỏ dấu tiếng Việt + ký tự đặc biệt: "Số vận đơn" → "so van don"; chữ Trung giữ nguyên. */
function headerKey(s: string): string {
  const folded = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[\u0111\u0110]/g, "d").toLowerCase();
  const latin = folded.replace(/[^a-z0-9]+/g, " ").trim();
  return latin || s.replace(/\s+/g, "").trim();
}

const HEADER_TO_COLUMN: ReadonlyMap<string, Column> = new Map(
  COLUMNS.flatMap((c) => [...UI_LOCALES.map((l) => headerKey(pickMessages(KVGS_MESSAGES, l)[LABEL_KEY[c]])), ...ALIASES[c]].map((k) => [k, c] as const)),
);

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return v.result == null ? "" : String(v.result).trim();
    if ("text" in v) return String(v.text).trim();
  }
  return String(v).trim();
}

/** Đọc file Excel: dòng tiêu đề là dòng đầu có đủ cột Số container + Số seal; trả null khi không tìm thấy. Dòng trống bỏ qua. */
export async function parseContainerXlsx(data: ArrayBuffer): Promise<ContainerListRow[] | null> {
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  await wb.xlsx.load(data);
  const ws = wb.worksheets[0];
  if (!ws) return null;
  let header: Map<Column, number> | null = null;
  const rows: ContainerListRow[] = [];
  ws.eachRow((row, n) => {
    if (!header) {
      const found = new Map<Column, number>();
      row.eachCell((cell, col) => {
        const c = HEADER_TO_COLUMN.get(headerKey(cellText(cell)));
        if (c && !found.has(c)) found.set(c, col);
      });
      if (found.has("containerNo") && found.has("sealNo") && n <= 20) header = found;
      return;
    }
    const h: Map<Column, number> = header;
    const get = (c: Column) => (h.has(c) ? cellText(row.getCell(h.get(c)!)) : "");
    const r = { billNo: get("billNo"), containerNo: normalizeContainerNo(get("containerNo")), sealNo: get("sealNo"), note: get("note") };
    if (!r.billNo && !r.containerNo && !r.sealNo && !r.note) return;
    rows.push({ ...r, source: "USER" });
  });
  return header ? rows : null;
}

/** File Excel của bảng đang hiển thị (tiêu đề cột theo ngôn ngữ đang chọn). */
export async function buildContainerXlsx(rows: readonly ContainerListRow[], locale: UiLocale): Promise<Blob> {
  const t = pickMessages(KVGS_MESSAGES, locale);
  const { default: Excel } = await import("exceljs");
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(t.xlsxSheet.slice(0, 31));
  ws.columns = [
    { header: t.colBill, key: "billNo", width: 24 },
    { header: t.colContainer, key: "containerNo", width: 18 },
    { header: t.colSeal, key: "sealNo", width: 18 },
    { header: t.colNote, key: "note", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ billNo: r.billNo, containerNo: r.containerNo, sealNo: r.sealNo, note: r.note });
  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Thu hồi sau một nhịp: thu hồi ngay sau click làm Chrome hủy lượt tải.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
