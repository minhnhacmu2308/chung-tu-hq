// Ghép dòng mã hàng (Excel/chứng từ) với mặt hàng chuẩn – code thuần, không AI (bất biến 5).
// SURE: bí danh ACTIVE cùng bộ · HS 8 số + tên trùng · mã ACTIVE ở bộ khác + cùng HS 4 số (hoặc cả hai thiếu HS và tên trùng).
// MAYBE: Dice(tên) >= 0,8 + cùng chương HS (hoặc một bên thiếu HS) · cùng HS 8 số tên khác · SURE nhưng ĐVT ≠ ĐVT gốc và chưa có quy đổi.
import { itemHsDigits } from "./code-key.js";
import { itemUnitKey } from "./units.js";
import type { ItemMatchLevel } from "./schemas.js";

export const ITEM_MATCH_REASONS = ["ALIAS_SAME_SET", "HS8_NAME", "CODE_OTHER_SET_HS4", "NAME_SIMILAR_CHAPTER", "HS8_NAME_DIFF", "UNIT_NO_FACTOR", "AMBIGUOUS", "NO_MATCH", "MIGRATION_DUPLICATE_CODE"] as const;
export type ItemMatchReason = (typeof ITEM_MATCH_REASONS)[number];

export const ITEM_MAX_CANDIDATES = 5;
export const ITEM_NAME_SIMILARITY_MIN = 0.8;

const tokens = (s: string): Set<string> =>
  new Set(
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1),
  );

/** Điểm giống nhau 0–1 (Dice) giữa hai tập từ: 2 × số từ chung / tổng số từ. */
export function itemDiceSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const w of a) if (b.has(w)) common++;
  return (2 * common) / (a.size + b.size);
}

/** Điểm Dice giữa hai `name_key`. */
export const itemNameSimilarity = (a: string, b: string): number => itemDiceSimilarity(tokens(a), tokens(b));

/** Mặt hàng ACTIVE đã nạp để ghép. `conversionUnits` = các ĐVT đã có quy đổi sang `baseUnit`. */
export type ItemIndexEntry = { id: string; nameKey: string; hsCode: string | null; baseUnit: string | null; conversionUnits: string[] };
export type ItemIndexAlias = { codeSetId: string; codeKey: string; itemId: string };

export type ItemMatchIndex = {
  items: ReadonlyMap<string, ItemIndexEntry & { tokens: Set<string>; hs: string }>;
  /** `codeSetId\0codeKey` → itemId (bí danh ACTIVE). */
  aliasBySetCode: ReadonlyMap<string, string>;
  /** `codeKey` → bí danh ACTIVE ở mọi bộ của org. */
  aliasesByCode: ReadonlyMap<string, readonly ItemIndexAlias[]>;
  /** HS 8 số → mặt hàng. */
  itemsByHs8: ReadonlyMap<string, readonly string[]>;
};

/** Dựng chỉ mục từ bí danh ACTIVE + mặt hàng ACTIVE của một doanh nghiệp (bí danh trỏ mặt hàng không có trong danh sách bị bỏ qua). */
export function buildItemMatchIndex(aliases: readonly ItemIndexAlias[], items: readonly ItemIndexEntry[]): ItemMatchIndex {
  const itemMap = new Map<string, ItemIndexEntry & { tokens: Set<string>; hs: string }>();
  const itemsByHs8 = new Map<string, string[]>();
  for (const it of items) {
    const hs = itemHsDigits(it.hsCode);
    itemMap.set(it.id, { ...it, tokens: tokens(it.nameKey), hs });
    if (hs.length >= 8) itemsByHs8.set(hs.slice(0, 8), [...(itemsByHs8.get(hs.slice(0, 8)) ?? []), it.id]);
  }
  const aliasBySetCode = new Map<string, string>();
  const aliasesByCode = new Map<string, ItemIndexAlias[]>();
  for (const a of aliases) {
    if (!itemMap.has(a.itemId)) continue;
    aliasBySetCode.set(`${a.codeSetId}\0${a.codeKey}`, a.itemId);
    aliasesByCode.set(a.codeKey, [...(aliasesByCode.get(a.codeKey) ?? []), a]);
  }
  return { items: itemMap, aliasBySetCode, aliasesByCode, itemsByHs8 };
}

export type ItemMatchRow = { codeKey: string; nameKey: string; hs?: string | null | undefined; unit?: string | null | undefined };
export type ItemMatchCandidate = { itemId: string; score: number; reason: ItemMatchReason };
export type ItemMatchResult = {
  level: ItemMatchLevel;
  /** Mặt hàng được ghép (SURE) hoặc gợi ý đứng đầu (MAYBE); NONE → không có. */
  itemId?: string;
  candidates: ItemMatchCandidate[];
  reason: ItemMatchReason;
};

const RANK: Record<string, number> = { ALIAS_SAME_SET: 0, HS8_NAME: 1, CODE_OTHER_SET_HS4: 2, NAME_SIMILAR_CHAPTER: 3, HS8_NAME_DIFF: 4 };
const SURE_REASONS = new Set<string>(["ALIAS_SAME_SET", "HS8_NAME", "CODE_OTHER_SET_HS4"]);

/**
 * Ghép một dòng theo luật SURE / MAYBE / NONE. `candidates` ≤ 5, tốt nhất trước.
 * Dòng thiếu mã (`codeKey` rỗng) bỏ qua luật theo mã.
 */
export function matchItemCandidate(row: ItemMatchRow, index: ItemMatchIndex, codeSetId: string): ItemMatchResult {
  const best = new Map<string, ItemMatchCandidate>();
  const add = (itemId: string, score: number, reason: ItemMatchReason) => {
    const cur = best.get(itemId);
    if (!cur || RANK[reason]! < RANK[cur.reason]!) best.set(itemId, { itemId, score, reason });
  };
  const rowHs = itemHsDigits(row.hs);

  if (row.codeKey) {
    const same = index.aliasBySetCode.get(`${codeSetId}\0${row.codeKey}`);
    if (same) add(same, 1, "ALIAS_SAME_SET");
    for (const a of index.aliasesByCode.get(row.codeKey) ?? []) {
      if (a.codeSetId === codeSetId) continue;
      const it = index.items.get(a.itemId);
      if (!it) continue;
      const hs4 = rowHs.length >= 4 && it.hs.length >= 4 && rowHs.slice(0, 4) === it.hs.slice(0, 4);
      const noHsSameName = !rowHs && !it.hs && it.nameKey === row.nameKey;
      if (hs4 || noHsSameName) add(it.id, 1, "CODE_OTHER_SET_HS4");
    }
  }

  if (rowHs.length >= 8) {
    for (const id of index.itemsByHs8.get(rowHs.slice(0, 8)) ?? []) {
      const it = index.items.get(id)!;
      if (it.nameKey === row.nameKey) add(id, 1, "HS8_NAME");
      else add(id, Math.max(0.8, itemNameSimilarity(row.nameKey, it.nameKey)), "HS8_NAME_DIFF");
    }
  }

  const rowTokens = tokens(row.nameKey);
  for (const it of index.items.values()) {
    const score = itemDiceSimilarity(rowTokens, it.tokens);
    if (score < ITEM_NAME_SIMILARITY_MIN) continue;
    const chapterOk = !rowHs || !it.hs || rowHs.slice(0, 2) === it.hs.slice(0, 2);
    if (chapterOk) add(it.id, score, "NAME_SIMILAR_CHAPTER");
  }

  const candidates = [...best.values()]
    .sort((a, b) => RANK[a.reason]! - RANK[b.reason]! || b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, ITEM_MAX_CANDIDATES);
  const top = candidates[0];
  if (!top) return { level: "NONE", candidates: [], reason: "NO_MATCH" };
  // Nhiều mặt hàng khác nhau cùng đạt mức SURE (trừ bí danh cùng bộ – quyết định đã duyệt) → không tự chọn, đưa người duyệt.
  const sureItems = new Set([...best.values()].filter((c) => SURE_REASONS.has(c.reason) && c.reason !== "ALIAS_SAME_SET").map((c) => c.itemId));
  if (top.reason !== "ALIAS_SAME_SET" && SURE_REASONS.has(top.reason) && sureItems.size > 1) return { level: "MAYBE", itemId: top.itemId, candidates, reason: "AMBIGUOUS" };

  if (SURE_REASONS.has(top.reason)) {
    const it = index.items.get(top.itemId)!;
    const unit = row.unit ? itemUnitKey(row.unit) : "";
    if (unit && it.baseUnit && unit !== itemUnitKey(it.baseUnit) && !it.conversionUnits.some((u) => itemUnitKey(u) === unit)) {
      return { level: "MAYBE", itemId: top.itemId, candidates, reason: "UNIT_NO_FACTOR" };
    }
    return { level: "SURE", itemId: top.itemId, candidates, reason: top.reason };
  }
  return { level: "MAYBE", itemId: top.itemId, candidates, reason: top.reason };
}
