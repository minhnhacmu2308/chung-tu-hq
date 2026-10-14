import type { Unzipper, UploadFile } from "./ports.js";

/** Bung zip (tối đa 20 file, chỉ giữ pdf/ảnh); file thường giữ nguyên. */
export async function expandZips(files: UploadFile[], unzipper: Unzipper): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  for (const f of files) {
    if (!/zip/.test(f.mime) && !f.name.toLowerCase().endsWith(".zip")) {
      out.push(f);
      continue;
    }
    for (const e of (await unzipper.entries(f.bytes)).slice(0, 20)) {
      const name = e.name.split("/").pop() ?? e.name;
      const ext = name.toLowerCase().split(".").pop();
      const mime = ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : null;
      if (mime) out.push({ name, mime, bytes: e.bytes });
    }
  }
  return out;
}
