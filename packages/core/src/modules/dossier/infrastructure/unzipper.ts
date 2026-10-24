import { unzipSync } from "fflate";
import { domainError } from "../../../shared/errors.js";
import type { Unzipper } from "../application/ports.js";
import { MAX_FILE_BYTES } from "../domain/upload-rules.js";

/** Chống "zip bom": bỏ qua mục giải nén quá 25 MB, dừng khi tổng vượt 200 MB hoặc quá 50 mục – kiểm tra trước khi giải nén (originalSize trong header). */
export const MAX_ZIP_ENTRIES = 50;
export const MAX_ZIP_TOTAL_BYTES = 200 * 1024 * 1024;

export class FflateUnzipper implements Unzipper {
  async entries(bytes: Buffer) {
    let files: Record<string, Uint8Array>;
    let total = 0;
    let count = 0;
    try {
      files = unzipSync(new Uint8Array(bytes), {
        filter: (f) => {
          if (f.name.endsWith("/") || f.originalSize <= 0 || f.originalSize > MAX_FILE_BYTES) return false;
          total += f.originalSize;
          count += 1;
          return total <= MAX_ZIP_TOTAL_BYTES && count <= MAX_ZIP_ENTRIES;
        },
      });
    } catch {
      throw domainError("FILE_INVALID", "File ZIP hỏng hoặc không đọc được");
    }
    return Object.entries(files)
      .filter(([name, data]) => !name.endsWith("/") && !name.startsWith("__MACOSX/") && !name.split("/").pop()!.startsWith(".") && data.length > 0)
      .map(([name, data]) => ({ name, bytes: Buffer.from(data) }));
  }
}
