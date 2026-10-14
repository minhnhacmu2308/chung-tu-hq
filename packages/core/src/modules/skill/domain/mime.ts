// Định dạng tệp mẫu chứng từ – thuần.
const BY_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const EXT_BY_MIME: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

/** Đuôi tên tệp quen thuộc → theo đuôi; không có đuôi (vd "hoa-don") → theo chữ ký đầu tệp; không nhận ra → ảnh JPEG. */
export function sampleMime(fileName: string, bytes: Buffer): string {
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  if (ext && BY_EXT[ext]) return BY_EXT[ext];
  if (bytes.subarray(0, 4).toString("latin1") === "%PDF") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return "image/jpeg";
}

/** Đuôi khóa lưu trữ theo định dạng thật (không lấy cả tên tệp làm đuôi như "smp_x.hoa-don"). */
export const sampleExt = (mime: string) => EXT_BY_MIME[mime] ?? "bin";
