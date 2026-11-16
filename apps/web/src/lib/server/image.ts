import type { NextRequest } from "next/server";
import { readUploadFiles } from "./upload";

/** Ảnh logo / ảnh đại diện (ADR 0016): URL luôn kèm `?v=<lần đổi>` nên cache lâu được; nosniff + inline để trình duyệt chỉ hiện như ảnh. */
export function imageResponse(img: { bytes: Buffer; mime: string }): Response {
  return new Response(new Uint8Array(img.bytes), {
    headers: {
      "Content-Type": img.mime,
      "Content-Length": String(img.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

/** Byte của ảnh đầu tiên trong multipart (trường `files`); loại/kích thước do use case kiểm theo byte đầu file. */
export async function readImageUpload(req: NextRequest): Promise<Buffer> {
  return (await readUploadFiles(req))[0]!.bytes;
}
