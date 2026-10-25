import { describe, expect, it } from "vitest";
import { needsAiRegions, pdfHasTextLayer } from "./pdf-text-layer.js";
import { scanPdf, textPdf } from "./test/pdfs.js";

describe("pdfHasTextLayer / needsAiRegions", () => {
  it("PDF chuẩn (có font) → có lớp chữ, không cần AI trả tọa độ", async () => {
    const bytes = await textPdf();
    expect(await pdfHasTextLayer(bytes)).toBe(true);
    expect(await needsAiRegions({ mime: "application/pdf", bytes })).toBe(false);
  });
  it("PDF scan (không font) và file ảnh → cần AI trả tọa độ", async () => {
    expect(await needsAiRegions({ mime: "application/pdf", bytes: await scanPdf() })).toBe(true);
    expect(await needsAiRegions({ mime: "image/jpeg", bytes: Buffer.from("x") })).toBe(true);
  });
  it("PDF hỏng → coi như không có lớp chữ (không ném lỗi)", async () => {
    expect(await pdfHasTextLayer(Buffer.from("not a pdf"))).toBe(false);
  });
});
