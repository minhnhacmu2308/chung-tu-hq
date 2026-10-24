import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildDocumentSheetsWorkbook, sheetNameFor } from "./document-sheets-xlsx";

const sheet = (fileName: string, rows: [string, string][]) => ({ documentId: fileName, fileName, kind: "INVOICE" as const, rows: rows.map(([label, value], i) => ({ stt: i + 1, key: `k${i}`, label, value })) });

describe("document-sheets-xlsx", () => {
  it("mỗi chứng từ một sheet; tiêu đề STT | TÊN TRƯỜNG | TRỊ GIÁ; xuống dòng giữ trong ô", async () => {
    const buf = await buildDocumentSheetsWorkbook([sheet("Invoice_CIKA25041701.pdf", [["Số hóa đơn", "CIKA25041701"], ["Người xuất khẩu", "SHENZHEN APTUS\nSHENZHEN, CHINA"]]), sheet("FANS25040166-HBL-COPY.pdf", [["Số vận đơn", "FANS25040166"]])]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Invoice_CIKA25041701", "FANS25040166-HBL-COPY"]);
    const ws = wb.worksheets[0]!;
    expect([ws.getCell("A1").value, ws.getCell("B1").value, ws.getCell("C1").value]).toEqual(["STT", "TÊN TRƯỜNG", "TRỊ GIÁ"]);
    expect([ws.getCell("A2").value, ws.getCell("B2").value, ws.getCell("C2").value]).toEqual([1, "Số hóa đơn", "CIKA25041701"]);
    expect(ws.getCell("C3").value).toBe("SHENZHEN APTUS\nSHENZHEN, CHINA");
    expect(ws.getCell("C3").alignment?.wrapText).toBe(true);
  });
  it("tiêu đề cột theo ngôn ngữ giao diện (zh/en); tên trường/giá trị giữ nguyên", async () => {
    for (const [locale, headers] of [["zh", ["序号", "字段名称", "值"]], ["en", ["NO.", "FIELD NAME", "VALUE"]]] as const) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await buildDocumentSheetsWorkbook([sheet("a.pdf", [["Số hóa đơn", "X1"]])], locale));
      const ws = wb.worksheets[0]!;
      expect([ws.getCell("A1").value, ws.getCell("B1").value, ws.getCell("C1").value]).toEqual(headers);
      expect(ws.getCell("B2").value).toBe("Số hóa đơn");
    }
  });
  it("tên sheet hợp lệ Excel: bỏ đuôi, bỏ ký tự cấm, ≤ 31 ký tự, không trùng", () => {
    const used = new Set<string>();
    expect(sheetNameFor("CO E253984866440001.pdf", used)).toBe("CO E253984866440001");
    expect(sheetNameFor("a/b:c*d?.pdf", used)).toBe("a b c d");
    expect(sheetNameFor("x".repeat(40) + ".pdf", used)).toHaveLength(31);
    expect(sheetNameFor("CO E253984866440001.pdf", used)).toBe("CO E253984866440001 (2)");
  });
});
