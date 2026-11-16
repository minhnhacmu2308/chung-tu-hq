import { BRAND_IMAGE_MAX_BYTES, sniffImage, type ImageKind } from "@kb/contracts";
import { reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

/** Ảnh logo / ảnh đại diện hợp lệ: PNG/JPEG/WebP theo byte đầu file, tối đa `max` (mặc định 1 MB). */
export function checkImage(bytes: Uint8Array, max = BRAND_IMAGE_MAX_BYTES): Result<ImageKind> {
  if (bytes.length > max) return err(reasonError("FILE_TOO_LARGE", "IMAGE_TOO_LARGE", { max: `${Math.round(max / 1024 / 1024)} MB` }));
  const kind = sniffImage(bytes);
  return kind ? ok(kind) : err(reasonError("FILE_INVALID", "IMAGE_TYPE_UNSUPPORTED"));
}
