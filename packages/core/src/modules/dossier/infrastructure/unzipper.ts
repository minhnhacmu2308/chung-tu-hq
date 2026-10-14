import { unzipSync } from "fflate";
import { domainError } from "../../../shared/errors.js";
import type { Unzipper } from "../application/ports.js";

export class FflateUnzipper implements Unzipper {
  async entries(bytes: Buffer) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(new Uint8Array(bytes));
    } catch {
      throw domainError("FILE_INVALID", "File ZIP hỏng hoặc không đọc được");
    }
    return Object.entries(files)
      .filter(([name, data]) => !name.endsWith("/") && !name.startsWith("__MACOSX/") && !name.split("/").pop()!.startsWith(".") && data.length > 0)
      .map(([name, data]) => ({ name, bytes: Buffer.from(data) }));
  }
}
