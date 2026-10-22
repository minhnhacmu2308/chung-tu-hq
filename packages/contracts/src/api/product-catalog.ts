// Danh mục hàng hóa của doanh nghiệp: các mặt hàng đã khai trước đây (import từ bảng kê dòng hàng xuất từ phần mềm
// khai báo, thêm tay, hoặc tự thêm khi tờ khai được duyệt). Mỗi mặt hàng một dòng, khóa theo mã hàng (nếu có) hoặc
// tên hàng đã chuẩn hóa. Dùng để tra lại mã HS cho hàng đã khai thay vì gọi lại HSCodePro.
import { z } from "zod";
import { DecimalStringSchema, IsoDateSchema, IsoDateTimeSchema } from "../common.js";

export const ProductSourceSchema = z.enum(["IMPORT", "MANUAL", "DECLARATION"]);
export type ProductSource = z.infer<typeof ProductSourceSchema>;

/** Mã HS lưu 8 số liền (33030000); nhận cả dạng có dấu chấm 3303.00.00. */
export const ProductHsCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[.\s]/g, ""))
  .pipe(z.string().regex(/^\d{8}$/, "Mã HS gồm 8 chữ số (vd 3303.00.00)"));

/** Thuế suất % dạng số thập phân ("18", "7.5"); nhận cả "18%". Rỗng → không có. */
export const RatePercentSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/%$/, "").replace(",", ".").trim())
  .pipe(z.union([z.literal(""), DecimalStringSchema]))
  .transform((s) => (s === "" ? null : s));

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s));

export const ProductCatalogItemSchema = z.object({
  id: z.string(),
  /** Mã hàng (SKU) – có thể trống. */
  code: z.string().nullable(),
  name: z.string(),
  hsCode: z.string(),
  unit: z.string().nullable(),
  /** Xuất xứ ISO-2. */
  origin: z.string().nullable(),
  /** Biểu thuế nhập khẩu (B01…). */
  tariffSchedule: z.string().nullable(),
  importDutyRate: DecimalStringSchema.nullable(),
  vatRate: DecimalStringSchema.nullable(),
  note: z.string().nullable(),
  source: ProductSourceSchema,
  /** Số lần mặt hàng đã được khai (theo dữ liệu import + tờ khai được duyệt). */
  timesDeclared: z.number().int().nonnegative(),
  lastDeclarationNo: z.string().nullable(),
  lastDeclarationDate: IsoDateSchema.nullable(),
  /** Mã loại hình của tờ khai gần nhất (A11, A44, H11…). */
  lastTypeCode: z.string().nullable(),
  /** Dòng gốc trong file import (tên cột → giá trị) của lần khai gần nhất – để tra lại. */
  raw: z.record(z.string(), z.string()).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProductCatalogItem = z.infer<typeof ProductCatalogItemSchema>;

/** Thêm / sửa tay một mặt hàng. */
export const ProductCatalogInputSchema = z.object({
  code: optText(50),
  name: z.string().trim().min(1, "Nhập tên hàng").max(1000),
  hsCode: ProductHsCodeSchema,
  unit: optText(10),
  origin: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.union([z.literal(""), z.string().regex(/^[A-Z]{2}$/, "Mã nước 2 chữ (vd FR, US)")]))
    .transform((s) => (s === "" ? null : s)),
  tariffSchedule: optText(10),
  importDutyRate: RatePercentSchema,
  vatRate: RatePercentSchema,
  note: optText(1000),
});
export type ProductCatalogInput = z.input<typeof ProductCatalogInputSchema>;
export type ProductCatalogValues = z.output<typeof ProductCatalogInputSchema>;

/** Một mặt hàng đã gộp từ file import (trình duyệt đọc file + gộp, server ghi). */
export const ProductImportItemSchema = z.object({
  code: z.string().trim().max(50).nullable(),
  name: z.string().trim().min(1).max(1000),
  hsCode: ProductHsCodeSchema,
  unit: z.string().trim().max(10).nullable(),
  origin: z.string().trim().max(2).nullable(),
  tariffSchedule: z.string().trim().max(10).nullable(),
  importDutyRate: DecimalStringSchema.nullable(),
  vatRate: DecimalStringSchema.nullable(),
  note: z.string().trim().max(1000).nullable(),
  timesDeclared: z.number().int().positive(),
  lastDeclarationNo: z.string().max(20).nullable(),
  lastDeclarationDate: IsoDateSchema.nullable(),
  lastTypeCode: z.string().max(5).nullable(),
  raw: z.record(z.string().max(100), z.string().max(2000)).nullable(),
});
export type ProductImportItem = z.infer<typeof ProductImportItemSchema>;

export const ImportProductCatalogInputSchema = z.object({
  items: z.array(ProductImportItemSchema).min(1, "File không có dòng hàng nào").max(5000, "Tối đa 5.000 mặt hàng mỗi lần import"),
});
export type ImportProductCatalogInput = z.infer<typeof ImportProductCatalogInputSchema>;

export const ImportProductCatalogResultSchema = z.object({
  created: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});
export type ImportProductCatalogResult = z.infer<typeof ImportProductCatalogResultSchema>;

export const DeleteProductsInputSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(5000) });
export type DeleteProductsInput = z.infer<typeof DeleteProductsInputSchema>;

/* ---------------- Khóa mặt hàng (dùng chung trình duyệt + server) ---------------- */

/** Đuôi mô tả không mang nghĩa phân loại, bỏ khi so khớp tên. */
const NOISE_TAIL = /[\s,.;:-]*(?:h[àa]ng\s+)?m[ớo]i 100\s*%[\s.]*$/iu;

/** Tên hàng chuẩn hóa để so khớp: chữ thường, gộp khoảng trắng, bỏ "Hàng mới 100%" ở cuối và dấu câu thừa. */
export function normalizeProductName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(NOISE_TAIL, "")
    .replace(/[\s,.;:-]+$/, "")
    .trim();
}

/** Khóa duy nhất của mặt hàng trong một doanh nghiệp: mã hàng nếu có, không thì tên chuẩn hóa. */
export function productKey(code: string | null | undefined, name: string): string {
  const c = code?.trim().toUpperCase();
  return c ? `code:${c}` : `name:${normalizeProductName(name)}`;
}

/**
 * Mã hàng nằm lẫn cuối tên (thói quen khai: "Nước hoa YSL Libre EDP 90ml, 145612. Hàng mới 100%").
 * Chỉ nhận dãy 4–10 chữ số đứng ngay trước "(Hàng) mới 100%" – không đoán ở chỗ khác.
 */
export function codeFromProductName(name: string): string | null {
  const m = /[,;.]\s*(\d{4,10})\s*[.,]?\s*(?:h[àa]ng\s+)?m[ớo]i 100\s*%/iu.exec(name);
  return m?.[1] ?? null;
}
