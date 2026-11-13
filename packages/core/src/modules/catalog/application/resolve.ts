// Tra mã (spec §5) – code thuần, không AI (bất biến 5). Thứ tự: bí danh ACTIVE trong bộ chỉ định → cùng code_key ở bộ khác (SURE(c))
// → luật ghép (matchItemCandidate). Bí danh trỏ mặt hàng đã gộp → mặt hàng cuối chuỗi merged_into_id; mặt hàng ARCHIVED không được trả.
// Nhiều dòng (tờ khai, hàng chờ) → resolveMany: nạp danh mục + dựng chỉ mục ghép MỘT lần cho cả lô.
import {
  buildItemMatchIndex, itemCodeKey, itemNameKey, matchItemCandidate, RESOLVE_MANY_MAX_ROWS, type ItemIndexAlias, type ResolveManyResult, type ResolveManyRow, type ItemMatchCandidateDto, type ItemMatchIndex, type ItemMatchLevel,
} from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { OrgId } from "../../../shared/ids.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { factorFor, isPartnerKind } from "./common.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, CodeSetRow, ItemAliasRow, ItemConversionRow } from "./ports.js";

export type ResolveItemQuery = { codeSetId?: string | null; partnerName?: string | null; code?: string | null; name?: string | null; hsCode?: string | null; unit?: string | null };
export type ResolveItemResult = {
  /** Chỉ có khi `level = SURE`; MAYBE/NONE → xem `candidates` (người dùng chọn). */
  itemId: string | null;
  aliasId?: string;
  level: ItemMatchLevel;
  /** Lý do ghép (ITEM_MATCH_REASONS): ALIAS_SAME_SET, CODE_OTHER_SET_HS4, UNIT_NO_FACTOR, AMBIGUOUS, NO_MATCH… */
  reason: string;
  /** Hệ số "1 `unit` = factor ĐVT gốc" khi có `unit` và đã biết quy đổi. */
  factor?: string;
  /** Bộ mã đã dùng để tra (chỉ định, hoặc nhận theo tên đối tác). */
  codeSetId: string | null;
  candidates: ItemMatchCandidateDto[];
};

/** Danh mục của org đã nạp sẵn – dùng cho cả lô. */
export type MatchContext = {
  sets: CodeSetRow[];
  items: Map<string, CatalogItemRow>;
  convs: Map<string, ItemConversionRow[]>;
  /** `codeSetId\0codeKey` → bí danh ACTIVE. */
  aliasBySetCode: Map<string, ItemAliasRow>;
  index: ItemMatchIndex;
};

/** Mặt hàng cuối chuỗi gộp (trong bộ nhớ); chu trình / không có → null. */
function endOfChain(items: Map<string, CatalogItemRow>, id: string): CatalogItemRow | null {
  const seen = new Set<string>();
  let cur: CatalogItemRow | undefined = items.get(id);
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    if (cur.status !== "MERGED" || !cur.mergedIntoId) return cur;
    cur = items.get(cur.mergedIntoId);
  }
  return null;
}

export async function loadMatchContext(r: CatalogRepos, orgId: OrgId): Promise<MatchContext> {
  const sets = await r.codeSets.list(orgId);
  const items = new Map((await r.items.list(orgId)).map((i) => [i.id, i]));
  const convs = new Map<string, ItemConversionRow[]>();
  for (const c of await r.conversions.listByOrg(orgId)) convs.set(c.itemId, [...(convs.get(c.itemId) ?? []), c]);
  const aliasBySetCode = new Map<string, ItemAliasRow>();
  const indexAliases: ItemIndexAlias[] = [];
  for (const a of await r.aliases.listByOrg(orgId, { status: "ACTIVE" })) {
    const end = endOfChain(items, a.itemId);
    if (!end || end.status !== "ACTIVE") continue;
    aliasBySetCode.set(`${a.codeSetId}\0${a.codeKey}`, { ...a, itemId: end.id });
    indexAliases.push({ codeSetId: a.codeSetId, codeKey: a.codeKey, itemId: end.id });
  }
  const active = [...items.values()].filter((i) => i.status === "ACTIVE");
  const index = buildItemMatchIndex(
    indexAliases,
    active.map((i) => ({ id: i.id, nameKey: i.nameKey, hsCode: i.hsCode, baseUnit: i.baseUnit, conversionUnits: (convs.get(i.id) ?? []).map((c) => c.unit) })),
  );
  return { sets, items, convs, aliasBySetCode, index };
}

/** Tra một dòng trên danh mục đã nạp. Bí danh cùng bộ nhưng ĐVT ≠ ĐVT gốc chưa quy đổi → MAYBE / UNIT_NO_FACTOR (như matchItemCandidate). */
export function resolveWith(ctx: MatchContext, q: ResolveItemQuery): ResolveItemResult {
  const partnerKey = q.partnerName ? itemNameKey(q.partnerName) : "";
  const setId = q.codeSetId ?? (partnerKey ? (ctx.sets.find((s) => isPartnerKind(s.kind) && s.partnerKey === partnerKey)?.id ?? null) : null);
  const codeKey = q.code ? itemCodeKey(q.code) : "";
  const factorOf = (item: CatalogItemRow) => factorFor(item, ctx.convs.get(item.id) ?? [], q.unit);
  const unitBlocked = (item: CatalogItemRow) => !!q.unit && !!item.baseUnit && factorOf(item) === null;

  if (setId && codeKey) {
    const a = ctx.aliasBySetCode.get(`${setId}\0${codeKey}`);
    const item = a ? ctx.items.get(a.itemId) : undefined;
    if (a && item) {
      const candidates = [{ itemId: item.id, score: 1, reason: "ALIAS_SAME_SET" }];
      if (unitBlocked(item)) return { itemId: null, aliasId: a.id, level: "MAYBE", reason: "UNIT_NO_FACTOR", codeSetId: setId, candidates };
      const f = factorOf(item);
      return { itemId: item.id, aliasId: a.id, level: "SURE", reason: "ALIAS_SAME_SET", codeSetId: setId, candidates, ...(f ? { factor: f } : {}) };
    }
  }
  if (!codeKey && !q.name?.trim() && !q.hsCode) return { itemId: null, level: "NONE", reason: "NO_MATCH", codeSetId: setId, candidates: [] };

  const res = matchItemCandidate({ codeKey, nameKey: q.name ? itemNameKey(q.name) : "", hs: q.hsCode, unit: q.unit }, ctx.index, setId ?? "");
  const candidates = res.candidates.map((c) => ({ itemId: c.itemId, score: c.score, reason: c.reason }));
  if (res.level !== "SURE" || !res.itemId) return { itemId: null, level: res.level, reason: res.reason, codeSetId: setId, candidates };
  const item = ctx.items.get(res.itemId)!;
  const f = factorOf(item);
  return { itemId: item.id, level: "SURE", reason: res.reason, codeSetId: setId, candidates, ...(f ? { factor: f } : {}) };
}

/** Tra một dòng trong transaction đang mở. */
export async function resolveInTx(r: CatalogRepos, orgId: OrgId, q: ResolveItemQuery): Promise<ResolveItemResult> {
  return resolveWith(await loadMatchContext(r, orgId), q);
}

/** Tra nhiều dòng: nạp danh mục + chỉ mục ghép một lần. Kết quả theo đúng thứ tự đầu vào. */
export async function resolveManyInTx(r: CatalogRepos, orgId: OrgId, qs: ResolveItemQuery[]): Promise<ResolveItemResult[]> {
  if (!qs.length) return [];
  const ctx = await loadMatchContext(r, orgId);
  return qs.map((q) => resolveWith(ctx, q));
}

/** Tra mã cho người dùng (mọi vai trò được tra). */
export async function resolveItem(deps: CatalogDeps, ctx: Ctx, q: ResolveItemQuery): Promise<Result<ResolveItemResult>> {
  return ok(await deps.uow.asOrg(ctx, (r) => resolveInTx(r, ctx.orgId, q)));
}

/** Tra nhiều dòng một lần (mọi vai trò). */
export async function resolveMany(deps: CatalogDeps, ctx: Ctx, qs: ResolveItemQuery[]): Promise<Result<ResolveItemResult[]>> {
  return ok(await deps.uow.asOrg(ctx, (r) => resolveManyInTx(r, ctx.orgId, qs)));
}

/**
 * Tra nhiều dòng cho giao diện (route `resolve-many`, ≤ RESOLVE_MANY_MAX_ROWS dòng): danh mục nạp một lần; mỗi ứng viên kèm tóm tắt mặt hàng
 * (mã nối, tên, HS, số lần khai) để gợi ý mã HS đã khai mà không phải tải cả danh mục về trình duyệt. Mọi vai trò được tra.
 */
export async function resolveManyWithItems(deps: CatalogDeps, ctx: Ctx, rows: ResolveManyRow[]): Promise<Result<ResolveManyResult[]>> {
  if (rows.length > RESOLVE_MANY_MAX_ROWS) return err(domainError("VALIDATION", `Tối đa ${RESOLVE_MANY_MAX_ROWS} dòng mỗi lần tra`));
  return ok(
    await deps.uow.asOrg(ctx, async (r) => {
      if (!rows.length) return [];
      const m = await loadMatchContext(r, ctx.orgId);
      return rows.map((row) => {
        const res = resolveWith(m, {
          name: row.name, ...(row.code ? { code: row.code } : {}), ...(row.hsCode ? { hsCode: row.hsCode } : {}), ...(row.unit ? { unit: row.unit } : {}), ...(row.partnerName ? { partnerName: row.partnerName } : {}),
        });
        const candidates = res.candidates.flatMap((c) => {
          const it = m.items.get(c.itemId);
          return it ? [{ ...c, item: { id: it.id, itemNo: it.itemNo, name: it.name, hsCode: it.hsCode, timesDeclared: it.timesDeclared } }] : [];
        });
        return { ...res, candidates };
      });
    }),
  );
}
