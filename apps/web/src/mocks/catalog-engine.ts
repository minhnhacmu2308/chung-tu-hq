// Danh mục hàng hóa dùng chung (mock, ADR 0015): kiểu dữ liệu + phần tra mã dùng chung cho seed và mocks/api/catalog.
// Ghép/quy đổi/chuẩn hóa mã dùng ĐÚNG hàm thuần của @kb/contracts (item-catalog) như backend (packages/core/src/modules/catalog/application/resolve.ts).
// Chỉ phụ thuộc @kb/contracts + lib/decimal → seed, db và api cùng import không vòng.
import {
  buildItemMatchIndex, itemCodeKey, itemNameKey, itemUnitKey, matchItemCandidate,
  type CatalogImport, type CatalogItem, type CatalogItemFields, type CatalogMode, type CodeSet, type CodeSetKind, type ItemAlias, type ItemIndexAlias, type ItemMatchIndex,
  type MatchQueueItem, type ResolveItemResultDto,
} from "@kb/contracts";
import { divDecimal, plainDecimal, sameDecimal } from "@/lib/decimal";

/** `isSource`: bộ nguồn gốc (đúng một bộ nội bộ mỗi doanh nghiệp – spec 2026-11-14 §1). */
export type MockCodeSet = Omit<CodeSet, "ownerIds" | "codeCount"> & { createdAt: string };
export type MockCatalogItem = CatalogItem & { nameKey: string };
export type MockAlias = ItemAlias & { createdAt: string };
export type MockConversion = { itemId: string; unit: string; factor: string };
/** Mục hàng chờ giữ hệ số của dòng file (`factor`) + thông tin mặt hàng (`itemFields`, chỉ khi bộ là nguồn gốc) – như catalog_match_queue. */
export type MockQueueItem = MatchQueueItem & { createdAt: string; importRow: number | null };
/** Dòng đã kiểm chờ ghép: `linkCode` = cột Mã nối, `fields` = thông tin mặt hàng (bỏ khi bộ nhận không phải nguồn gốc). */
export type MockStagedRow = { row: number; code: string; name: string; unit?: string; hs?: string; factor?: string; linkCode?: string; fields?: CatalogItemFields; sourceRef?: string };
/** Lần nhập: `rows` = dòng hợp lệ chờ ghép (lần nhập lớn ghép dần theo thời gian – như job `catalog-import`); `matchAfter` = mốc bắt đầu ghép (ms). */
export type MockImport = CatalogImport & { rows: MockStagedRow[] | null; matchAfter: number };
export type MockCatalogAudit = { itemId: string; key: string; oldValue: string; newValue: string; at: string; by: string };
export type MockCatalog = {
  settings: { mode: CatalogMode | null; itemNoPrefix: string; itemNoSeq: number; setupAt: string | null };
  codeSets: MockCodeSet[];
  /** Người phụ trách theo bộ mã (id thành viên). */
  owners: Record<string, string[]>;
  items: MockCatalogItem[];
  aliases: MockAlias[];
  conversions: MockConversion[];
  queue: MockQueueItem[];
  imports: MockImport[];
  /** Lịch sử sửa (như field_audit source CATALOG_EDIT). */
  audit: MockCatalogAudit[];
};

export const emptyCatalog = (): MockCatalog => ({
  settings: { mode: null, itemNoPrefix: "MH-", itemNoSeq: 0, setupAt: null }, codeSets: [], owners: {}, items: [], aliases: [], conversions: [], queue: [], imports: [], audit: [],
});

export const INTERNAL_KINDS: readonly CodeSetKind[] = ["SHARED", "ACCOUNTING", "WAREHOUSE", "CUSTOMS"];
export const DEPARTMENT_KINDS: readonly CodeSetKind[] = ["ACCOUNTING", "WAREHOUSE", "CUSTOMS"];
export const isInternal = (k: CodeSetKind) => INTERNAL_KINDS.includes(k);
export const isPartnerKind = (k: CodeSetKind) => k === "SUPPLIER" || k === "CUSTOMER";
/** Tên mặc định của bộ mã (dữ liệu doanh nghiệp, người dùng đổi được) – như DEFAULT_SET_NAME của backend. */
export const DEFAULT_SET_NAME: Record<CodeSetKind, string> = { SHARED: "Mã chung", ACCOUNTING: "Kế toán", WAREHOUSE: "Kho", CUSTOMS: "XNK", SUPPLIER: "Nhà cung cấp", CUSTOMER: "Khách hàng" };

export const effectiveMode = (cat: MockCatalog): CatalogMode => cat.settings.mode ?? "PER_DEPARTMENT";

/** Mã nối tiếp theo `<tiền tố><6 chữ số>` – bỏ qua số đã có (như freeItemNo). */
export function nextItemNo(cat: MockCatalog): string {
  for (;;) {
    cat.settings.itemNoSeq += 1;
    const no = `${cat.settings.itemNoPrefix}${String(cat.settings.itemNoSeq).padStart(6, "0")}`;
    if (!cat.items.some((i) => i.itemNo === no)) return no;
  }
}

/** Mặt hàng cuối chuỗi gộp; chu trình / không có → null. */
export function endOfChain(cat: MockCatalog, id: string): MockCatalogItem | null {
  const seen = new Set<string>();
  let cur = cat.items.find((i) => i.id === id);
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    if (cur.status !== "MERGED" || !cur.mergedIntoId) return cur;
    const next: string = cur.mergedIntoId;
    cur = cat.items.find((i) => i.id === next);
  }
  return null;
}

/** Hệ số "1 `unit` = factor ĐVT gốc": cùng ĐVT gốc → "1"; có quy đổi → hệ số; không → null (không tự nhân 1). */
export function factorFor(cat: MockCatalog, item: Pick<MockCatalogItem, "id" | "baseUnit">, unit: string | null | undefined): string | null {
  if (!unit) return null;
  const u = itemUnitKey(unit);
  if (item.baseUnit && itemUnitKey(item.baseUnit) === u) return "1";
  return cat.conversions.find((c) => c.itemId === item.id && itemUnitKey(c.unit) === u)?.factor ?? null;
}
export const needsFactor = (cat: MockCatalog, item: Pick<MockCatalogItem, "id" | "baseUnit">, unit: string | null | undefined) =>
  !!unit && !!item.baseUnit && factorFor(cat, item, unit) === null;

/** Bí danh mới nhất (đã duyệt muộn nhất, rồi tạo muộn nhất) – "nhiều mã → mã mới nhất". */
export function newestAlias(aliases: MockAlias[]): MockAlias | null {
  let best: MockAlias | null = null;
  const at = (a: MockAlias) => a.decidedAt ?? a.createdAt;
  for (const a of aliases) if (!best || at(a) > at(best) || (at(a) === at(best) && a.id > best.id)) best = a;
  return best;
}

/** Bộ mặc định cho Hải quan (XNK ở PER_DEPARTMENT, "Mã chung" ở SHARED). */
export const defaultSet = (cat: MockCatalog) => cat.codeSets.find((s) => s.isDefault) ?? null;
/** Bộ nguồn gốc của doanh nghiệp (quyết định ĐVT gốc + tên/HS/thuế của mặt hàng). */
export const sourceSetOf = (cat: MockCatalog) => cat.codeSets.find((s) => s.isSource) ?? null;

// ---------- đổi ĐVT gốc (như domain/rebase.ts của backend – Decimal, 9 số lẻ ROUND_HALF_UP) ----------
export const CATALOG_FACTOR_SCALE = 9;
export type RebaseConversion = { unit: string; factor: string };
export type RebasePlan =
  | { kind: "SAME" }
  | { kind: "SET_BASE" }
  | { kind: "NO_FACTOR" }
  | { kind: "REBASE"; factor: string; conversions: RebaseConversion[]; changes: { unit: string; oldValue: string; newValue: string }[]; lineFactors: { id: string; oldValue: string; newValue: string }[] };

const positive = (s: string | undefined): string | null => (s && /^\d+(\.\d+)?$/.test(s.trim()) && /[1-9]/.test(s) ? plainDecimal(s) : null);
const isZero = (s: string) => plainDecimal(s) === "0";

/**
 * Gốc cũ B, gốc mới N, f = số B trong 1 N (quy đổi hiện có của N, không có thì `factor`). Mỗi quy đổi `1 X = x B` (X ≠ N) → `1 X = x / f N`;
 * thêm `1 B = 1 / f N`; bỏ dòng của N; hệ số theo lô chia f. Một giá trị tròn về 0 → NO_FACTOR.
 */
export function planRebase(input: { baseUnit: string | null; newBase: string; conversions: readonly RebaseConversion[]; lineFactors?: readonly { id: string; factor: string }[]; factor?: string }): RebasePlan {
  const newKey = itemUnitKey(input.newBase);
  if (!input.baseUnit) return { kind: "SET_BASE" };
  const baseKey = itemUnitKey(input.baseUnit);
  if (baseKey === newKey) return { kind: "SAME" };
  const existing = input.conversions.find((c) => itemUnitKey(c.unit) === newKey);
  const f = positive(existing?.factor) ?? (existing ? null : positive(input.factor));
  if (!f) return { kind: "NO_FACTOR" };
  const next: RebaseConversion[] = [];
  const changes: { unit: string; oldValue: string; newValue: string }[] = [];
  for (const c of input.conversions) {
    const k = itemUnitKey(c.unit);
    if (k === newKey) {
      changes.push({ unit: c.unit, oldValue: plainDecimal(c.factor), newValue: "" });
      continue;
    }
    if (k === baseKey) continue;
    const v = divDecimal(c.factor, f, CATALOG_FACTOR_SCALE);
    if (isZero(v)) return { kind: "NO_FACTOR" };
    next.push({ unit: c.unit, factor: v });
    changes.push({ unit: c.unit, oldValue: plainDecimal(c.factor), newValue: v });
  }
  const back = divDecimal("1", f, CATALOG_FACTOR_SCALE);
  if (isZero(back)) return { kind: "NO_FACTOR" };
  next.push({ unit: input.baseUnit, factor: back });
  changes.push({ unit: input.baseUnit, oldValue: "", newValue: back });
  const lineFactors: { id: string; oldValue: string; newValue: string }[] = [];
  for (const l of input.lineFactors ?? []) {
    const v = divDecimal(l.factor, f, CATALOG_FACTOR_SCALE);
    if (isZero(v)) return { kind: "NO_FACTOR" };
    lineFactors.push({ id: l.id, oldValue: plainDecimal(l.factor), newValue: v });
  }
  const byUnit = <X extends { unit: string }>(a: X, b: X) => itemUnitKey(a.unit).localeCompare(itemUnitKey(b.unit));
  return { kind: "REBASE", factor: f, conversions: next.sort(byUnit), changes: changes.sort(byUnit), lineFactors };
}

const ITEM_FIELD_KEYS = ["name", "hsCode", "kind", "origin", "tariffSchedule", "importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate", "description", "note"] as const;
const RATE_KEYS = new Set<string>(["importDutyRate", "vatRate", "envTaxRate", "exciseRate", "safeguardRate", "antiDiscriminationRate"]);

/** Các trường của `incoming` có giá trị và khác mặt hàng (thuế suất so theo giá trị) – như diffItemFields. */
export function diffItemFields(item: Pick<MockCatalogItem, (typeof ITEM_FIELD_KEYS)[number]>, incoming: CatalogItemFields): { key: (typeof ITEM_FIELD_KEYS)[number]; oldValue: string; newValue: string }[] {
  const changes: { key: (typeof ITEM_FIELD_KEYS)[number]; oldValue: string; newValue: string }[] = [];
  for (const k of ITEM_FIELD_KEYS) {
    const v = incoming[k];
    if (v === undefined || v === "") continue;
    const cur = item[k];
    if (cur !== null && (RATE_KEYS.has(k) ? sameDecimal(cur, v) : cur === v)) continue;
    changes.push({ key: k, oldValue: cur ?? "", newValue: v });
  }
  return changes;
}

type MatchContext = { index: ItemMatchIndex; aliasBySetCode: Map<string, MockAlias> };

export function matchContext(cat: MockCatalog): MatchContext {
  const aliasBySetCode = new Map<string, MockAlias>();
  const indexAliases: ItemIndexAlias[] = [];
  for (const a of cat.aliases) {
    if (a.status !== "ACTIVE") continue;
    const end = endOfChain(cat, a.itemId);
    if (!end || end.status !== "ACTIVE") continue;
    aliasBySetCode.set(`${a.codeSetId}\0${a.codeKey}`, { ...a, itemId: end.id });
    indexAliases.push({ codeSetId: a.codeSetId, codeKey: a.codeKey, itemId: end.id });
  }
  const index = buildItemMatchIndex(
    indexAliases,
    cat.items.filter((i) => i.status === "ACTIVE").map((i) => ({
      id: i.id, nameKey: i.nameKey, hsCode: i.hsCode, baseUnit: i.baseUnit, conversionUnits: cat.conversions.filter((c) => c.itemId === i.id).map((c) => c.unit),
    })),
  );
  return { index, aliasBySetCode };
}

type Opt = string | null | undefined;
export type MockResolveQuery = { codeSetId?: Opt; partnerName?: Opt; code?: Opt; name?: Opt; hsCode?: Opt; unit?: Opt };

/** Tra mã – cùng thứ tự với backend: bí danh ACTIVE trong bộ → cùng mã ở bộ khác (SURE c) → luật ghép SURE/MAYBE/NONE. */
export function resolveIn(cat: MockCatalog, q: MockResolveQuery, ctx: MatchContext = matchContext(cat)): ResolveItemResultDto {
  const partnerKey = q.partnerName ? itemNameKey(q.partnerName) : "";
  const setId = q.codeSetId ?? (partnerKey ? (cat.codeSets.find((s) => isPartnerKind(s.kind) && s.partnerKey === partnerKey)?.id ?? null) : null);
  const codeKey = q.code ? itemCodeKey(q.code) : "";
  const item = (id: string) => cat.items.find((i) => i.id === id)!;
  const unitBlocked = (it: MockCatalogItem) => !!q.unit && !!it.baseUnit && factorFor(cat, it, q.unit) === null;

  if (setId && codeKey) {
    const a = ctx.aliasBySetCode.get(`${setId}\0${codeKey}`);
    if (a) {
      const it = item(a.itemId);
      const candidates = [{ itemId: it.id, score: 1, reason: "ALIAS_SAME_SET" }];
      if (unitBlocked(it)) return { itemId: null, aliasId: a.id, level: "MAYBE", reason: "UNIT_NO_FACTOR", codeSetId: setId, candidates };
      const f = factorFor(cat, it, q.unit);
      return { itemId: it.id, aliasId: a.id, level: "SURE", reason: "ALIAS_SAME_SET", codeSetId: setId, candidates, ...(f ? { factor: f } : {}) };
    }
  }
  if (!codeKey && !q.name?.trim() && !q.hsCode) return { itemId: null, level: "NONE", reason: "NO_MATCH", codeSetId: setId, candidates: [] };
  const res = matchItemCandidate({ codeKey, nameKey: q.name ? itemNameKey(q.name) : "", hs: q.hsCode, unit: q.unit }, ctx.index, setId ?? "");
  const candidates = res.candidates.map((c) => ({ itemId: c.itemId, score: c.score, reason: c.reason }));
  if (res.level !== "SURE" || !res.itemId) return { itemId: null, level: res.level, reason: res.reason, codeSetId: setId, candidates };
  const f = factorFor(cat, item(res.itemId), q.unit);
  return { itemId: res.itemId, level: "SURE", reason: res.reason, codeSetId: setId, candidates, ...(f ? { factor: f } : {}) };
}
