// PDF có lớp chữ (xuất từ phần mềm, hoặc scan đã OCR) → màn OCR tự tìm vị trí trường trên trang từ lớp chữ, không cần AI trả tọa độ.
// PDF chỉ có ảnh (scan) và file ảnh → xin AI trả thêm khung vị trí khi đọc.
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { AiFile } from "../application/ports.js";

const hasFonts = (resources: PDFDict | undefined): boolean => {
  const fonts = resources?.lookup(PDFName.of("Font"));
  return fonts instanceof PDFDict && fonts.keys().length > 0;
};

/** Có trang nào khai báo font (trực tiếp hoặc trong Form XObject cấp 1) → coi là có lớp chữ. PDF hỏng → false. */
export async function pdfHasTextLayer(bytes: Buffer): Promise<boolean> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPages().some((p) => {
      const res = p.node.Resources();
      if (hasFonts(res)) return true;
      const xobjects = res?.lookup(PDFName.of("XObject"));
      if (!(xobjects instanceof PDFDict)) return false;
      return xobjects.keys().some((k) => {
        const x = xobjects.lookup(k);
        return x instanceof PDFRawStream && x.dict.get(PDFName.of("Subtype")) === PDFName.of("Form") && hasFonts(x.dict.lookup(PDFName.of("Resources")) as PDFDict | undefined);
      });
    });
  } catch {
    return false;
  }
}

/** Cần AI trả tọa độ: ảnh, hoặc PDF không có lớp chữ. */
export async function needsAiRegions(file: Pick<AiFile, "mime" | "bytes">): Promise<boolean> {
  if (file.mime.startsWith("image/")) return true;
  if (file.mime !== "application/pdf") return false;
  return !(await pdfHasTextLayer(file.bytes));
}
