import type { DocKind } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "application/zip", "application/x-zip-compressed"] as const;

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
