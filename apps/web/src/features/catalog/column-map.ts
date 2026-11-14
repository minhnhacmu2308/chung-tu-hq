// Ghép cột khi nhập file (spec 2026-11-14 §4) – logic thuần của bước Ghép cột: gán trường cho cột (mỗi trường một cột, mỗi cột một trường),
// bỏ các trường thông tin mặt hàng khi bộ nhận không phải bộ nguồn gốc (không gửi đi), nhớ cách ghép theo bộ mã (localStorage, theo tiêu đề cột).
import { ITEM_IMPORT_FIELDS, ITEM_IMPORT_ITEM_FIELDS, ItemImportFieldSchema, type ItemColumnMap, type ItemImportField } from "@kb/contracts";

const ITEM_ONLY = new Set<ItemImportField>(ITEM_IMPORT_ITEM_FIELDS);
export const isItemOnlyField = (f: ItemImportField) => ITEM_ONLY.has(f);

/** Trường đang gán cho cột `col` (không có → null). */
export function fieldOfColumn(map: ItemColumnMap, col: number): ItemImportField | null {
  return ITEM_IMPORT_FIELDS.find((f) => map[f] === col) ?? null;
}

/** Gán `field` cho cột `col` ("" = Bỏ qua): cột bỏ trường cũ, trường rời cột cũ (mỗi trường chỉ một cột). */
export function assignColumn(map: ItemColumnMap, col: number, field: ItemImportField | ""): ItemColumnMap {
  const next: ItemColumnMap = {};
  for (const f of ITEM_IMPORT_FIELDS) if (map[f] !== undefined && map[f] !== col && f !== field) next[f] = map[f]!;
  if (field) next[field] = col;
  return next;
}

/** Ghép cột thật sự dùng để đọc dòng + gửi đi: bộ không phải nguồn gốc → bỏ các trường thông tin mặt hàng. */
export function effectiveColumnMap(map: ItemColumnMap, isSource: boolean): ItemColumnMap {
  if (isSource) return map;
  const next: ItemColumnMap = {};
  for (const f of ITEM_IMPORT_FIELDS) if (map[f] !== undefined && !ITEM_ONLY.has(f)) next[f] = map[f]!;
  return next;
}

/** Trường thông tin mặt hàng đã gán cột nhưng sẽ bị bỏ qua (bộ không phải nguồn gốc). */
export const ignoredFields = (map: ItemColumnMap, isSource: boolean): ItemImportField[] => (isSource ? [] : ITEM_IMPORT_ITEM_FIELDS.filter((f) => map[f] !== undefined));

/** Trường bắt buộc chưa gán cột. */
export const missingRequired = (map: ItemColumnMap): ItemImportField[] => (["code", "name"] as const).filter((f) => map[f] === undefined);

// ---------- nhớ ghép cột theo bộ mã ----------
const KEY_PREFIX = "kb-catalog-column-map:";
const headerKey = (h: string) => h.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
type Store = Pick<Storage, "getItem" | "setItem">;
const browserStore = (): Store | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Lưu ghép cột của lần nhập vào bộ `codeSetId` dưới dạng tiêu đề cột → trường (file sau có thể đổi thứ tự cột). */
export function saveColumnMap(codeSetId: string, headers: readonly string[], map: ItemColumnMap, store: Store | null = browserStore()) {
  if (!store) return;
  // "" = người dùng chọn Bỏ qua cột này (lần sau không tự đoán lại).
  const byHeader: Record<string, ItemImportField | ""> = {};
  headers.forEach((raw, i) => {
    const h = headerKey(raw);
    if (h && !(h in byHeader)) byHeader[h] = fieldOfColumn(map, i) ?? "";
  });
  try {
    store.setItem(KEY_PREFIX + codeSetId, JSON.stringify(byHeader));
  } catch {
    /* localStorage đầy / bị chặn → bỏ qua */
  }
}

/**
 * Ghép cột cho file mới vào bộ `codeSetId`: cột có tiêu đề trùng lần trước dùng lại trường đã chọn; các trường còn lại theo `detected`
 * (đoán theo tên) nếu cột chưa dùng. `remembered` = có dùng lại ít nhất một cột.
 */
export function recallColumnMap(codeSetId: string, headers: readonly string[], detected: ItemColumnMap, store: Store | null = browserStore()): { map: ItemColumnMap; remembered: boolean } {
  let saved: Record<string, string> = {};
  try {
    const raw = store?.getItem(KEY_PREFIX + codeSetId);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") saved = parsed as Record<string, string>;
  } catch {
    saved = {};
  }
  const map: ItemColumnMap = {};
  const used = new Set<number>();
  headers.forEach((h, i) => {
    const key = headerKey(h);
    if (!key || !(key in saved)) return;
    if (saved[key] === "") {
      used.add(i);
      return;
    }
    const f = ItemImportFieldSchema.safeParse(saved[key]);
    if (!f.success || map[f.data] !== undefined) return;
    map[f.data] = i;
    used.add(i);
  });
  const remembered = used.size > 0;
  for (const f of ITEM_IMPORT_FIELDS) {
    const i = detected[f];
    if (i !== undefined && map[f] === undefined && !used.has(i)) {
      map[f] = i;
      used.add(i);
    }
  }
  return { map, remembered };
}
