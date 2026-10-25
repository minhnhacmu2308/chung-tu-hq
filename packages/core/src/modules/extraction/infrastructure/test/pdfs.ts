// PDF mẫu cho test: có lớp chữ (font) và scan (chỉ hình).
import { PDFDocument, StandardFonts } from "pdf-lib";

export async function textPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  page.drawText("INVOICE NO. INV-001", { x: 50, y: 700, size: 12, font: await pdf.embedFont(StandardFonts.Helvetica) });
  return Buffer.from(await pdf.save());
}

export async function scanPdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawRectangle({ x: 10, y: 10, width: 100, height: 100 });
  return Buffer.from(await pdf.save());
}
