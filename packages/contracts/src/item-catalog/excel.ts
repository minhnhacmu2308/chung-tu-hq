// Nhập danh mục từ Excel: nhận cột theo tên thường gặp, kiểm từng dòng (dòng lỗi bỏ qua, dòng khác vẫn nhập).
import { z } from "zod";
import { itemCodeKey, itemHsDigits } from "./code-key.js";
import { CatalogFactorSchema } from "./schemas.js";

export const CATALOG_IMPORT_SYNC_MAX_ROWS = 500;
/**
 * Tối đa số dòng mỗi yêu cầu nhập (thân JSON phải dưới giới hạn 10 MB của proxy Next). File lớn hơn: giao diện chia thành nhiều lần nhập
 * liên tiếp vào cùng bộ mã (nhập lại không tạo trùng – mã đã có trong bộ chỉ được cập nhật).
 */
export const CATALOG_IMPORT_MAX_ROWS_PER_REQUEST = 5_000;

/** Độ dài tối đa từng trường của một dòng gửi lên (vượt → `validateItemRows` báo `TOO_LONG`; giao diện không gửi dòng đó – không cắt bớt dữ liệu). */
export const ITEM_IMPORT_MAX_LENGTH = { code: 200, name: 1000, unit: 100, hs: 50, factor: 50 } as const;

/** Dòng đọc từ file: giữ nguyên chuỗi, chưa kiểm – `validateItemRows` kiểm và báo lỗi theo dòng. */
export const ItemImportRowSchema = z.object({
  code: z.string().max(ITEM_IMPORT_MAX_LENGTH.code),
  name: z.string().max(ITEM_IMPORT_MAX_LENGTH.name),
  unit: z.string().max(ITEM_IMPORT_MAX_LENGTH.unit).optional(),
  hs: z.string().max(ITEM_IMPORT_MAX_LENGTH.hs).optional(),
  /** Hệ số quy đổi "1 ĐVT = n đơn vị gốc" nếu file có cột Quy đổi. */
  factor: z.string().max(ITEM_IMPORT_MAX_LENGTH.factor).optional(),
});
export type ItemImportRow = z.infer<typeof ItemImportRowSchema>;

export const ItemImportFieldSchema = z.enum(["code", "name", "unit", "hs", "factor"]);
export type ItemImportField = z.infer<typeof ItemImportFieldSchema>;
/** Chỉ số cột (0-based) của từng trường; trường không nhận ra thì vắng mặt. */
export type ItemColumnMap = Partial<Record<ItemImportField, number>>;
export const ItemColumnMapSchema = z.partialRecord(ItemImportFieldSchema, z.number().int().nonnegative());

export const ImportRowsInputSchema = z.object({
  codeSetId: z.string(),
  fileName: z.string().min(1).max(260),
  columnMap: ItemColumnMapSchema,
  rows: z.array(ItemImportRowSchema).max(CATALOG_IMPORT_MAX_ROWS_PER_REQUEST),
});
export type ImportRowsInput = z.infer<typeof ImportRowsInputSchema>;

/**
 * Số dòng của thân yêu cầu nhập vượt CATALOG_IMPORT_MAX_ROWS_PER_REQUEST → true (route/mock trả CATALOG_IMPORT_TOO_LARGE trước khi parse,
 * để người dùng thấy lý do rõ ràng thay cho lỗi Zod chung). Thân không phải đối tượng có `rows` mảng → false (để Zod báo).
 */
export function importRowsTooLarge(body: unknown): boolean {
  const rows = typeof body === "object" && body !== null ? (body as { rows?: unknown }).rows : undefined;
  return Array.isArray(rows) && rows.length > CATALOG_IMPORT_MAX_ROWS_PER_REQUEST;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Tên cột thường gặp (đã bỏ dấu, chữ thường). */
const HEADER_ALIASES: Record<ItemImportField, string[]> = {
  code: ["ma hang", "ma vat tu", "ma vt", "ma nvl", "ma san pham", "ma sp", "ma hang hoa", "item code", "item no", "part no", "part number", "sku", "code", "ma"],
  name: ["ten hang", "ten vat tu", "ten vt", "ten hang hoa", "ten san pham", "ten sp", "item name", "description", "name", "mo ta", "ten"],
  unit: ["dvt", "don vi tinh", "don vi", "unit", "uom"],
  hs: ["ma hs", "hs code", "hscode", "hs", "ma hs code"],
  factor: ["quy doi", "he so quy doi", "he so", "conversion", "factor"],
};

/** Nhận cột theo tên: mỗi trường lấy cột đầu tiên khớp, mỗi cột chỉ cho một trường. */
export function detectItemColumns(headers: readonly string[]): ItemColumnMap {
  const folded = headers.map(fold);
  const map: ItemColumnMap = {};
  const used = new Set<number>();
  for (const field of ["code", "name", "unit", "hs", "factor"] as const) {
    const idx = folded.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(h));
    if (idx >= 0) {
      map[field] = idx;
      used.add(idx);
    }
  }
  return map;
}

export type ItemImportRowErrorCode = "MISSING" | "DUPLICATE_IN_FILE" | "INVALID_FORMAT" | "UNKNOWN_UNIT" | "TOO_LONG";
export type ItemImportRowError = { row: number; field: ItemImportField; code: ItemImportRowErrorCode };
export type ValidItemImportRow = { code: string; name: string; unit?: string; hs?: string; factor?: string };

/** Các trường vượt ITEM_IMPORT_MAX_LENGTH của một dòng (dòng như vậy không gửi lên được – ItemImportRowSchema từ chối cả yêu cầu). */
export function itemImportTooLong(r: Partial<ItemImportRow>): ItemImportField[] {
  return (Object.keys(ITEM_IMPORT_MAX_LENGTH) as ItemImportField[]).filter((f) => (r[f] ?? "").length > ITEM_IMPORT_MAX_LENGTH[f]);
}

/**
 * Kiểm các dòng (số dòng tính từ 1 theo thứ tự đưa vào): trường dài quá ITEM_IMPORT_MAX_LENGTH (`TOO_LONG` – không cắt bớt),
 * thiếu mã/tên, trùng mã trong file (theo `codeKey`, giữ dòng đầu), HS 4/6/8/10 chữ số (chấp nhận dấu chấm/khoảng trắng, trả về chỉ
 * chữ số; mã HS luôn có số chữ số chẵn – số lẻ thường là ô số Excel mất số 0 đầu), hệ số là số thập phân > 0.
 * ĐVT: có `knownUnits` (mã ĐVT Hải quan, viết hoa) → ngoài danh sách là `UNKNOWN_UNIT` để người dùng chọn ĐVT tương ứng;
 * không có → chỉ kiểm không quá 30 ký tự.
 */
export function validateItemRows(rows: readonly ItemImportRow[], opts: { knownUnits?: ReadonlySet<string> } = {}): { ok: ValidItemImportRow[]; errors: ItemImportRowError[] } {
  const ok: ValidItemImportRow[] = [];
  const errors: ItemImportRowError[] = [];
  const seen = new Set<string>();
  const known = opts.knownUnits ? new Set([...opts.knownUnits].map((u) => u.trim().toUpperCase())) : undefined;
  rows.forEach((r, i) => {
    const row = i + 1;
    const before = errors.length;
    const long = new Set(itemImportTooLong(r));
    for (const field of long) errors.push({ row, field, code: "TOO_LONG" });
    const code = long.has("code") ? "" : (r.code ?? "").trim();
    const name = (r.name ?? "").trim();
    if (!long.has("code")) {
      if (!code) errors.push({ row, field: "code", code: "MISSING" });
      else if (seen.has(itemCodeKey(code))) errors.push({ row, field: "code", code: "DUPLICATE_IN_FILE" });
    }
    if (!name && !long.has("name")) errors.push({ row, field: "name", code: "MISSING" });

    let hs: string | undefined;
    const hsRaw = long.has("hs") ? "" : (r.hs ?? "").trim();
    if (hsRaw) {
      const d = itemHsDigits(hsRaw);
      if (/^[\d.\s]+$/.test(hsRaw) && d.length >= 4 && d.length <= 10 && d.length % 2 === 0) hs = d;
      else errors.push({ row, field: "hs", code: "INVALID_FORMAT" });
    }
    const unit = long.has("unit") ? undefined : (r.unit ?? "").trim() || undefined;
    if (unit) {
      if (unit.length > 30) errors.push({ row, field: "unit", code: "INVALID_FORMAT" });
      else if (known && !known.has(unit.toUpperCase())) errors.push({ row, field: "unit", code: "UNKNOWN_UNIT" });
    }
    const factor = long.has("factor") ? undefined : (r.factor ?? "").trim().replace(",", ".") || undefined;
    if (factor && !CatalogFactorSchema.safeParse(factor).success) errors.push({ row, field: "factor", code: "INVALID_FORMAT" });

    if (code) seen.add(itemCodeKey(code));
    if (errors.length > before) return;
    ok.push({ code, name, ...(unit ? { unit } : {}), ...(hs ? { hs } : {}), ...(factor ? { factor } : {}) });
  });
  return { ok, errors };
}
