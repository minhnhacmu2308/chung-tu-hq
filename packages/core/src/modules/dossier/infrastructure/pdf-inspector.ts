import { PDFDocument } from "pdf-lib";
import { domainError } from "../../../shared/errors.js";
import type { PdfInspector } from "../application/ports.js";

/** Đếm trang và phát hiện PDF mã hóa bằng pdf-lib. Ảnh = 1 trang. */
export class PdfLibInspector implements PdfInspector {
  async inspect(bytes: Buffer, mime: string) {
    if (mime.startsWith("image/")) return { pages: 1, encrypted: false };
    try {
      const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
      return { pages: doc.getPageCount(), encrypted: doc.isEncrypted };
    } catch {
      throw domainError("FILE_INVALID", "Không đọc được PDF (file hỏng hoặc không phải PDF)");
    }
  }
}
