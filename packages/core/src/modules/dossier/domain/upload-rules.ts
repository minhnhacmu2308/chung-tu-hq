import type { DocKind } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "application/zip", "application/x-zip-compressed"] as const;

export type SniffedMime = "application/pdf" | "image/png" | "image/jpeg" | "application/zip";

/**
 * Nhận diện loại file theo byte đầu (magic bytes), KHÔNG tin `Content-Type` trình duyệt gửi (đổi đuôi .exe → .pdf vẫn bị phát hiện).
 * PDF cho phép tối đa 1 KB rác trước "%PDF-" (một số máy scan chèn BOM/khoảng trắng – pdf-lib vẫn đọc được).
 */
export function sniffMime(bytes: Uint8Array): SniffedMime | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)) return "application/zip";
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 1024))).toString("latin1");
  if (head.includes("%PDF-")) return "application/pdf";
  return null;
}

/** Đuôi file lưu trong storage lấy theo loại thật, không lấy từ tên người dùng gửi (tránh "../" hay đuôi lạ trong key). */
export const extensionOf = (mime: SniffedMime): "pdf" | "png" | "jpg" | "zip" => (mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/jpeg" ? "jpg" : "zip");

/** Đoán loại chứng từ theo tên file (giống mock); AI phân loại lại khi đọc. */
export function classifyByFileName(name: string): DocKind {
  const n = name.toLowerCase().replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, " ").trim();
  const tokens = n.split(" ");
  const has = (...words: string[]) => words.some((w) => tokens.includes(w) || (w.length > 3 && n.includes(w)));
  if (has("packing", "pl")) return "PACKING_LIST";
  if (has("awb", "hawb", "mawb", "airway")) return "AIR_WAYBILL";
  if (has("bl", "bol", "lading", "hbl", "mbl")) return "BILL_OF_LADING";
  if (has("co", "origin", "form")) return "CERT_OF_ORIGIN";
  if (has("arrival", "an", "notice")) return "ARRIVAL_NOTICE";
  if (has("cuoc", "freight", "gtgt", "vat")) return "FREIGHT_INVOICE";
  if (has("contract", "hdmb", "sc")) return "SALES_CONTRACT";
  if (has("inv", "invoice", "ci")) return "INVOICE";
  return "OTHER";
}

export type UploadCandidate = { name: string; mime: string; sizeBytes: number; pages: number; encrypted: boolean };

export function validateUpload(f: UploadCandidate, limits: { maxPagesPerFile: number }): Result<void> {
  if (!(ALLOWED_MIME as readonly string[]).includes(f.mime)) return err(domainError("FILE_INVALID", `${f.name}: chỉ nhận PDF, ảnh PNG/JPG hoặc ZIP`));
  if (f.sizeBytes > MAX_FILE_BYTES) return err(domainError("FILE_TOO_LARGE", `${f.name}: vượt 25 MB`));
  if (f.encrypted) return err(domainError("FILE_INVALID", `${f.name}: PDF có mật khẩu, hãy gỡ mật khẩu rồi tải lại`));
  if (f.pages > limits.maxPagesPerFile) return err(domainError("FILE_TOO_LARGE", `${f.name}: vượt ${limits.maxPagesPerFile} trang`));
  return ok(undefined);
}
