import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { PdfLibInspector } from "./pdf-inspector.js";

async function makePdf(pages: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

describe("PdfLibInspector", () => {
  it("đếm đúng số trang PDF; ảnh → 1 trang", async () => {
    const ins = new PdfLibInspector();
    expect(await ins.inspect(await makePdf(3), "application/pdf")).toEqual({ pages: 3, encrypted: false });
    expect(await ins.inspect(Buffer.from("png"), "image/png")).toEqual({ pages: 1, encrypted: false });
  });
  it("PDF hỏng → ném DomainError FILE_INVALID", async () => {
    const ins = new PdfLibInspector();
    await expect(ins.inspect(Buffer.from("không phải pdf"), "application/pdf")).rejects.toMatchObject({ code: "FILE_INVALID" });
  });
});
