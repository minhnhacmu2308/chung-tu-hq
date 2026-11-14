// Nhập danh mục từ Excel: nhận cột theo tên thường gặp (người dùng ghép lại ở bước Ghép cột), kiểm từng dòng (dòng lỗi bỏ qua, dòng khác vẫn nhập).
import { z } from "zod";
import { itemCodeKey, itemHsDigits } from "./code-key.js";
import { CatalogFactorSchema, CatalogItemKindSchema, CatalogRateSchema, type CatalogItemFields, type CatalogItemKind } from "./schemas.js";
import { itemUnitKey } from "./units.js";

export const CATALOG_IMPORT_SYNC_MAX_ROWS = 500;
/**
 * Tối đa số dòng mỗi yêu cầu nhập (thân JSON phải dưới giới hạn 10 MB của proxy Next). File lớn hơn: giao diện chia thành nhiều lần nhập
 * liên tiếp vào cùng bộ mã (nhập lại không tạo trùng – mã đã có trong bộ chỉ được cập nhật).
 */
export const CATALOG_IMPORT_MAX_ROWS_PER_REQUEST = 5_000;

/**
 * Trường hệ thống của bước Ghép cột (spec 2026-11-14 §4). `code` + `name` bắt buộc. `linkCode` = Mã nối (mã nối `item_no` hoặc mã ở bộ nguồn gốc).
 * Từ `kind` trở đi là thông tin mặt hàng – chỉ áp khi bộ nhận dữ liệu là bộ nguồn gốc (bộ khác: giao diện không gửi, server bỏ qua).
 */
export const ITEM_IMPORT_FIELDS = [
  "code", "name", "unit", "hs", "factor", "linkCode", "kind", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate", "qty2Unit", "qty2Factor", "description", "note",
] as const;
export const ItemImportFieldSchema = z.enum(ITEM_IMPORT_FIELDS);
export type ItemImportField = z.infer<typeof ItemImportFieldSchema>;
/** Các trường thông tin mặt hàng (chỉ bộ nguồn gốc). */
export const ITEM_IMPORT_ITEM_FIELDS = ["kind", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate", "qty2Unit", "qty2Factor", "description", "note"] as const satisfies readonly ItemImportField[];
const RATE_FIELDS = ["importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"] as const;

/** Độ dài tối đa từng trường của một dòng gửi lên (vượt → `validateItemRows` báo `TOO_LONG`; giao diện không gửi dòng đó – không cắt bớt dữ liệu). */
export const ITEM_IMPORT_MAX_LENGTH = {
  code: 200, name: 1000, unit: 100, hs: 50, factor: 50, linkCode: 200, kind: 50, origin: 50, tariffSchedule: 100,
  importDutyRate: 50, vatRate: 50, envTaxRate: 50, exciseRate: 50, safeguardRate: 50, antiDiscriminationRate: 50, qty2Unit: 100, qty2Factor: 50, description: 500, note: 500,
} as const satisfies Record<ItemImportField, number>;

const cell = (f: ItemImportField) => z.string().max(ITEM_IMPORT_MAX_LENGTH[f]).optional();
/** Dòng đọc từ file: giữ nguyên chuỗi, chưa kiểm – `validateItemRows` kiểm và báo lỗi theo dòng. */
export const ItemImportRowSchema = z.object({
  code: z.string().max(ITEM_IMPORT_MAX_LENGTH.code),
  name: z.string().max(ITEM_IMPORT_MAX_LENGTH.name),
  unit: cell("unit"),
  hs: cell("hs"),
  /** Hệ số quy đổi "1 ĐVT = n đơn vị gốc" nếu file có cột Quy đổi. */
  factor: cell("factor"),
  linkCode: cell("linkCode"),
  kind: cell("kind"),
  origin: cell("origin"),
  tariffSchedule: cell("tariffSchedule"),
  importDutyRate: cell("importDutyRate"),
  vatRate: cell("vatRate"),
  envTaxRate: cell("envTaxRate"),
  exciseRate: cell("exciseRate"),
  safeguardRate: cell("safeguardRate"),
  antiDiscriminationRate: cell("antiDiscriminationRate"),
  /** ĐVT số lượng 2 + tỷ lệ "1 ĐVT gốc = n ĐVT 2" (Số lượng (2) trên tờ khai). */
  qty2Unit: cell("qty2Unit"),
  qty2Factor: cell("qty2Factor"),
  description: cell("description"),
  note: cell("note"),
});
export type ItemImportRow = z.infer<typeof ItemImportRowSchema>;

/** Chỉ số cột (0-based) của từng trường; trường không ghép thì vắng mặt. */
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

/** Tên cột thường gặp (đã bỏ dấu, chữ thường). Trường đứng trước trong ITEM_IMPORT_FIELDS được nhận trước (vd "Description" là Tên khi chưa có cột tên). */
const HEADER_ALIASES: Record<ItemImportField, string[]> = {
  code: ["ma hang", "ma vat tu", "ma vt", "ma nvl", "ma san pham", "ma sp", "ma hang hoa", "item code", "item no", "part no", "part number", "sku", "code", "ma"],
  name: ["ten hang", "ten vat tu", "ten vt", "ten hang hoa", "ten san pham", "ten sp", "item name", "description", "name", "mo ta", "ten"],
  unit: ["dvt", "don vi tinh", "don vi", "unit", "uom"],
  hs: ["ma hs", "hs code", "hscode", "hs", "ma hs code"],
  factor: ["quy doi", "he so quy doi", "he so", "conversion", "factor"],
  linkCode: ["ma noi", "ma lien ket", "ma chuan", "link code", "link", "master code"],
  kind: ["loai hang", "loai hang hoa", "loai", "kind", "item type", "type"],
  origin: ["xuat xu", "nuoc xuat xu", "ma nuoc", "origin", "country of origin", "coo"],
  tariffSchedule: ["bieu thue", "ma bieu thue", "tariff schedule", "tariff"],
  importDutyRate: ["thue nk", "thue suat nk", "thue nhap khau", "thue suat nhap khau", "import duty", "import duty rate", "duty rate"],
  vatRate: ["thue gtgt", "thue suat gtgt", "thue vat", "vat", "vat rate"],
  envTaxRate: ["thue bvmt", "thue bao ve moi truong", "environment tax", "env tax"],
  exciseRate: ["thue ttdb", "thue tieu thu dac biet", "excise", "excise tax"],
  safeguardRate: ["thue tu ve", "thue suat tu ve", "safeguard", "safeguard duty"],
  antiDiscriminationRate: ["thue chong phan biet doi xu", "thue cpbdx", "anti discrimination", "anti discrimination duty"],
  qty2Unit: ["dvt so luong 2", "dvt sl2", "dvt sl 2", "dvt 2", "don vi tinh 2", "unit 2", "second unit"],
  qty2Factor: ["ty le sl2", "ty le sl 2", "ty le so luong 2", "qty2 factor", "qty 2 factor"],
  description: ["mo ta", "mo ta chi tiet", "mo ta hang hoa", "dien giai", "quy cach", "description", "specification"],
  note: ["ghi chu", "note", "notes", "remark", "remarks"],
};

/** Nhận cột theo tên: mỗi trường lấy cột đầu tiên khớp, mỗi cột chỉ cho một trường (theo thứ tự ITEM_IMPORT_FIELDS). */
export function detectItemColumns(headers: readonly string[]): ItemColumnMap {
  const folded = headers.map(fold);
  const map: ItemColumnMap = {};
  const used = new Set<number>();
  for (const field of ITEM_IMPORT_FIELDS) {
    const idx = folded.findIndex((h, i) => !used.has(i) && HEADER_ALIASES[field].includes(h));
    if (idx >= 0) {
      map[field] = idx;
      used.add(idx);
    }
  }
  return map;
}

/** Nhãn loại hàng (đã bỏ dấu) → mã ITEM kind: nhận mã enum, nhãn tiếng Việt / tiếng Anh thường gặp. */
const KIND_LABELS: Record<string, CatalogItemKind> = {
  material: "MATERIAL", "nguyen lieu": "MATERIAL", "nguyen vat lieu": "MATERIAL", nvl: "MATERIAL", "raw material": "MATERIAL",
  product: "PRODUCT", "san pham": "PRODUCT", "thanh pham": "PRODUCT", "finished product": "PRODUCT",
  goods: "GOODS", "hang hoa": "GOODS", hang: "GOODS",
  supply: "SUPPLY", supplies: "SUPPLY", "vat tu": "SUPPLY", "vat tu tieu hao": "SUPPLY",
};
/** Loại hàng từ ô file; không nhận ra → null. */
export function parseItemKind(raw: string): CatalogItemKind | null {
  const s = raw.trim();
  const direct = CatalogItemKindSchema.safeParse(s.toUpperCase());
  if (direct.success) return direct.data;
  return KIND_LABELS[fold(s)] ?? null;
}

/** Thuế suất từ ô file: "5,5" / "8%" → "5.5" / "8"; tối đa 4 chữ số thập phân (numeric(10,4)), 0–1000. Sai → null. */
function parseRate(raw: string): string | null {
  const s = raw.trim().replace(/%$/, "").trim().replace(",", ".");
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return null;
  return CatalogRateSchema.safeParse(s).success ? s : null;
}

/**
 * Dòng của file đối chiếu (Tải file đối chiếu ở tab Nhập dữ liệu) mà bộ phận chưa điền mã: có Mã nối nhưng trống Mã hàng → chưa đối chiếu,
 * bỏ qua khi nhập (không báo lỗi thiếu mã). Dòng không có Mã nối mà trống mã vẫn là lỗi MISSING như thường.
 */
export const isUnfilledLinkRow = (r: Pick<ItemImportRow, "code" | "linkCode">): boolean => !r.code.trim() && !!r.linkCode?.trim();

export type ItemImportRowErrorCode = "MISSING" | "DUPLICATE_IN_FILE" | "INVALID_FORMAT" | "UNKNOWN_UNIT" | "TOO_LONG";
export type ItemImportRowError = { row: number; field: ItemImportField; code: ItemImportRowErrorCode };
/** Dòng hợp lệ: `fields` = thông tin mặt hàng có giá trị (loại, xuất xứ, biểu thuế, thuế suất, mô tả, ghi chú) – vắng khi dòng không có. */
export type ValidItemImportRow = { code: string; name: string; unit?: string; hs?: string; factor?: string; linkCode?: string; fields?: CatalogItemFields };

/** Các trường vượt ITEM_IMPORT_MAX_LENGTH của một dòng (dòng như vậy không gửi lên được – ItemImportRowSchema từ chối cả yêu cầu). */
export function itemImportTooLong(r: Partial<ItemImportRow>): ItemImportField[] {
  return (Object.keys(ITEM_IMPORT_MAX_LENGTH) as ItemImportField[]).filter((f) => (r[f] ?? "").length > ITEM_IMPORT_MAX_LENGTH[f]);
}

/**
 * Kiểm các dòng (số dòng tính từ 1 theo thứ tự đưa vào): trường dài quá ITEM_IMPORT_MAX_LENGTH (`TOO_LONG` – không cắt bớt),
 * thiếu mã/tên, trùng mã trong file (theo `codeKey`, giữ dòng đầu), HS 4/6/8/10 chữ số (chấp nhận dấu chấm/khoảng trắng, trả về chỉ
 * chữ số; mã HS luôn có số chữ số chẵn – số lẻ thường là ô số Excel mất số 0 đầu), hệ số là số thập phân > 0.
 * ĐVT: có `knownUnits` (mã ĐVT Hải quan, viết hoa) → ngoài danh sách là `UNKNOWN_UNIT` để người dùng chọn ĐVT tương ứng;
 * không có → chỉ kiểm không quá 30 ký tự. Loại hàng (mã hoặc nhãn), xuất xứ (mã nước 2 chữ), thuế suất (0–1000, ≤ 4 số lẻ) sai → `INVALID_FORMAT`.
 * ĐVT số lượng 2 (viết hoa, kiểm như ĐVT) + tỷ lệ (> 0): ĐVT 2 khác ĐVT của dòng mà thiếu tỷ lệ → `MISSING` (qty2Factor); trùng ĐVT dòng → tỷ lệ 1.
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
    const text = (f: ItemImportField) => (long.has(f) ? "" : (r[f] ?? "").trim());
    const bad = (field: ItemImportField) => errors.push({ row, field, code: "INVALID_FORMAT" });
    const code = text("code");
    const name = (r.name ?? "").trim();
    if (!long.has("code")) {
      if (!code) errors.push({ row, field: "code", code: "MISSING" });
      else if (seen.has(itemCodeKey(code))) errors.push({ row, field: "code", code: "DUPLICATE_IN_FILE" });
    }
    if (!name && !long.has("name")) errors.push({ row, field: "name", code: "MISSING" });

    let hs: string | undefined;
    const hsRaw = text("hs");
    if (hsRaw) {
      const d = itemHsDigits(hsRaw);
      if (/^[\d.\s]+$/.test(hsRaw) && d.length >= 4 && d.length <= 10 && d.length % 2 === 0) hs = d;
      else bad("hs");
    }
    const unit = text("unit") || undefined;
    if (unit) {
      if (unit.length > 30) bad("unit");
      else if (known && !known.has(unit.toUpperCase())) errors.push({ row, field: "unit", code: "UNKNOWN_UNIT" });
    }
    const factor = text("factor").replace(",", ".") || undefined;
    if (factor && !CatalogFactorSchema.safeParse(factor).success) bad("factor");
    const linkCode = text("linkCode") || undefined;

    const fields: CatalogItemFields = {};
    const kindRaw = text("kind");
    if (kindRaw) {
      const k = parseItemKind(kindRaw);
      if (k) fields.kind = k;
      else bad("kind");
    }
    const origin = text("origin").toUpperCase();
    if (origin) {
      if (/^[A-Z]{2}$/.test(origin)) fields.origin = origin;
      else bad("origin");
    }
    const tariff = text("tariffSchedule");
    if (tariff) fields.tariffSchedule = tariff;
    for (const f of RATE_FIELDS) {
      const raw = text(f);
      if (!raw) continue;
      const v = parseRate(raw);
      if (v) fields[f] = v;
      else bad(f);
    }
    // ĐVT số lượng 2 + tỷ lệ: ĐVT 2 = ĐVT của dòng (dòng bộ nguồn gốc → ĐVT gốc) → tỷ lệ 1; khác mà thiếu tỷ lệ → MISSING; tỷ lệ không có ĐVT 2 → MISSING.
    const qty2Unit = text("qty2Unit").toUpperCase();
    const qty2Factor = text("qty2Factor").replace(",", ".");
    if (qty2Unit) {
      if (qty2Unit.length > 30) bad("qty2Unit");
      else if (known && !known.has(qty2Unit)) errors.push({ row, field: "qty2Unit", code: "UNKNOWN_UNIT" });
      else fields.qty2Unit = qty2Unit;
    }
    if (qty2Factor) {
      if (!CatalogFactorSchema.safeParse(qty2Factor).success) bad("qty2Factor");
      else if (!qty2Unit && !long.has("qty2Unit")) errors.push({ row, field: "qty2Unit", code: "MISSING" });
      else fields.qty2Factor = qty2Factor;
    } else if (qty2Unit) {
      if (unit && itemUnitKey(unit) === qty2Unit) fields.qty2Factor = "1";
      else errors.push({ row, field: "qty2Factor", code: "MISSING" });
    }
    const description = text("description");
    if (description) fields.description = description;
    const note = text("note");
    if (note) fields.note = note;

    if (code) seen.add(itemCodeKey(code));
    if (errors.length > before) return;
    ok.push({
      code, name, ...(unit ? { unit } : {}), ...(hs ? { hs } : {}), ...(factor ? { factor } : {}), ...(linkCode ? { linkCode } : {}), ...(Object.keys(fields).length ? { fields } : {}),
    });
  });
  return { ok, errors };
}
