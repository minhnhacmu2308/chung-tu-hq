import type { NextRequest } from "next/server";
import { HttpError } from "./route";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export type UploadedFile = { name: string; mime: string; bytes: Buffer };

/** Đọc các file từ multipart/form-data (trường `files`, cho phép nhiều). */
export async function readUploadFiles(req: NextRequest): Promise<UploadedFile[]> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "FILE_INVALID", "Nội dung gửi lên không phải multipart/form-data");
  }
  const out: UploadedFile[] = [];
  for (const [, v] of form.entries()) {
    if (!(v instanceof File)) continue;
    if (v.size > MAX_UPLOAD_BYTES) throw new HttpError(400, "FILE_TOO_LARGE", `${v.name}: vượt 25 MB`);
    out.push({ name: v.name, mime: v.type || "application/octet-stream", bytes: Buffer.from(await v.arrayBuffer()) });
  }
  if (out.length === 0) throw new HttpError(400, "FILE_INVALID", "Chưa chọn file nào");
  return out;
}
