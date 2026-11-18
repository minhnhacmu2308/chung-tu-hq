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

/** "Tìm theo" của danh sách mặt hàng: tất cả (mặc định), mã nối, tên, mã hàng theo các bộ mã. */
export const CATALOG_SEARCH_FIELDS = ["ALL", "ITEM_NO", "NAME", "CODE"] as const;
export type CatalogSearchField = (typeof CATALOG_SEARCH_FIELDS)[number];

const foldText = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

/**
 * Mặt hàng có khớp từ khóa `q` không (backend và mock dùng chung): mã nối chứa q, tên (bỏ dấu, chuẩn hóa) chứa q, hoặc một mã hàng
 * theo bộ mã chứa q (so theo khóa mã – bỏ khoảng trắng, "-", "."…). `field` giới hạn nhóm thông tin; "ALL" / không có = mọi nhóm. q trống = khớp.
 */
export function catalogItemMatches(
  q: string,
  field: CatalogSearchField | undefined,
  item: { itemNo: string; nameKey: string; codeKeys: readonly string[] },
): boolean {
  const text = q.trim();
  if (!text) return true;
  const f = field ?? "ALL";
  const name = foldText(itemNameKey(text));
  const code = itemCodeKey(text);
  return (
    ((f === "ALL" || f === "ITEM_NO") && item.itemNo.toLowerCase().includes(text.toLowerCase())) ||
    ((f === "ALL" || f === "NAME") && Boolean(name) && foldText(item.nameKey).includes(name)) ||
    ((f === "ALL" || f === "CODE") && Boolean(code) && item.codeKeys.some((k) => k.includes(code)))
  );
}
