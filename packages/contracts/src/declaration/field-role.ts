import { CATALOG_EDA } from "./catalog-eda.js";
import { CATALOG_IDA } from "./catalog-ida.js";
import type { DeclarationFieldDef } from "./catalog-types.js";

/**
 * Vai trò của chỉ tiêu đối với người khai – để giao diện phân biệt chỉ tiêu phải khai, khai theo tình huống,
 * VNACCS tự xác định và chỉ tiêu do Hải quan trả về (Phụ lục II TT39/2018 sửa đổi TT121/2025, đặc tả VNACCS IDA/EDA).
 * - REQUIRED: bắt buộc khai.
 * - CONDITIONAL: bắt buộc khi rơi vào tình huống ghi trong Phụ lục.
 * - OPTIONAL: không bắt buộc.
 * - ASSIST: người khai có thể bỏ trống, VNACCS tự xác định/tự hiện ra.
 * - CUSTOMS: người khai không nhập – Hải quan cấp/trả về (số tờ khai, chỉ thị Hải quan).
 * - UNUSED: Phụ lục ghi chưa sử dụng.
 * - REFERENCE: thông tin tham khảo của ứng dụng, không phải chỉ tiêu trên tờ khai (không có số chỉ tiêu).
 */
export type DeclarationFieldRole = "REQUIRED" | "CONDITIONAL" | "OPTIONAL" | "ASSIST" | "CUSTOMS" | "UNUSED" | "REFERENCE";

export function catalogFieldRole(def: DeclarationFieldDef): DeclarationFieldRole {
  if (def.unused) return "UNUSED";
  if (def.required === "F") return "CUSTOMS";
  if (def.assist) return "ASSIST";
  if (def.required === "M") return "REQUIRED";
  if (def.required === "C") return "CONDITIONAL";
  return "OPTIONAL";
}

/** Chỉ tiêu `no` ("1.44", "2.29") trong catalog của tờ khai IDA/EDA; không có → undefined. */
export function findDeclarationFieldDef(kind: "IDA" | "EDA", no: string | null | undefined): DeclarationFieldDef | undefined {
  if (!no) return undefined;
  return (kind === "IDA" ? CATALOG_IDA : CATALOG_EDA).find((d) => d.no === no);
}

/** Vai trò của một chỉ tiêu trên tờ khai theo số chỉ tiêu; không có số (thông tin tham khảo) → REFERENCE. */
export function declarationFieldRole(kind: "IDA" | "EDA", no: string | null | undefined): DeclarationFieldRole {
  const def = findDeclarationFieldDef(kind, no);
  return def ? catalogFieldRole(def) : "REFERENCE";
}
