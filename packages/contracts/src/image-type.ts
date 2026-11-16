// Nhận loại ảnh logo / ảnh đại diện theo byte đầu file (ADR 0016) – dùng chung backend (identity) và dữ liệu mẫu trình duyệt.

export type ImageKind = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

/** Ảnh logo / ảnh đại diện: PNG, JPEG, WebP, tối đa 1 MB. */
export const BRAND_IMAGE_MAX_BYTES = 1024 * 1024;
export const BRAND_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";

const at = (b: Uint8Array, sig: readonly number[], offset = 0) => b.length >= offset + sig.length && sig.every((x, i) => b[offset + i] === x);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

/** Loại ảnh theo chữ ký đầu file – không tin mime/đuôi người gửi khai. SVG (chạy được script), GIF và loại khác → null. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (at(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (at(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (at(bytes, ascii("RIFF")) && at(bytes, ascii("WEBP"), 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}
