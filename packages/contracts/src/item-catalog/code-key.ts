import { normalizeProductName } from "../api/product-catalog.js";

/** Khóa so khớp của một mã hàng: viết hoa, bỏ khoảng trắng và các ký tự `-` `.` `/` `_` ("vt-0012 " = "VT 0012" = "VT0012"). */
export function itemCodeKey(raw: string): string {
  return raw.normalize("NFC").toUpperCase().replace(/[\s\-./_]+/g, "");
}

/** Khóa so khớp của tên hàng – dùng lại cách chuẩn hóa của danh mục hàng hóa hiện có. */
export function itemNameKey(raw: string): string {
  return normalizeProductName(raw);
}

/** Chỉ giữ chữ số của mã HS ("7306.30.10" → "73063010"). */
export const itemHsDigits = (raw: string | null | undefined): string => (raw ?? "").replace(/\D/g, "");
