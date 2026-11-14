// Ghép các dòng đã lưu tạm của một lần nhập (spec §4) – code thuần, không AI (bất biến 5). Dùng cho nhập đồng bộ (≤ 500 dòng)
// và job nền `catalog-import`. Danh mục + chỉ mục ghép nạp MỘT lần cho cả lần nhập; dòng xử lý theo lô, mỗi lô một transaction
// ghi kết quả + `rows_done` cùng lúc → job chạy lại tiếp từ lô chưa xong (idempotent theo (import_id, dòng); unique ở DB chặn trùng).
// Mỗi dòng: mã đã có trong bộ → cập nhật tên/ĐVT bí danh (dòng từ chứng từ chỉ điền chỗ trống – không ghi đè tên đã chỉnh bằng chữ OCR)
// · SURE → bí danh ACTIVE · MAYBE/NONE → hàng chờ PENDING (đã chờ sẵn cùng mã → đếm skipped, không thêm mục trùng; mục giữ hệ số + thông tin mặt hàng).
// Cột Mã nối (spec 2026-11-14 §5) nối thẳng, bỏ qua luật ghép. Bộ nguồn gốc: ĐVT của mã thành ĐVT gốc (đổi gốc), dòng Excel quyết định tên/HS/thuế…
import { itemCodeKey, itemUnitKey, type AliasSource, type CatalogImport, type CatalogItemFields, type ItemMatchReason } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { auditKeyAlias, writeAudit, needsFactor, type AuditEntry } from "./common.js";
import type { CatalogDeps, CatalogImportCounts, CatalogImportRow, CatalogItemRow, CatalogRepos, CatalogStagedRow, ItemAliasRow, MatchQueueRow } from "./ports.js";
import { endOfChain, loadMatchContext, resolveWith, type MatchContext } from "./resolve.js";
import { applySourceAttach, type RebaseOutcome } from "./source-rules.js";

/** Số dòng mỗi transaction ghép. */
export const MATCH_CHUNK_ROWS = 200;

type RunCtx = { orgId: OrgId; userId: UserId };

export const importNotFound = () => domainError("NOT_FOUND", "Không tìm thấy lần nhập");

export function toImportDto(r: CatalogImportRow): CatalogImport {
  return {
    id: r.id, codeSetId: r.codeSetId, fileName: r.fileName, columnMap: r.columnMap, status: r.status, counts: r.counts, errors: r.errors,
    progress: { done: r.rowsDone, total: r.rowsTotal }, createdAt: r.createdAt.toISOString(), createdBy: r.createdBy,
  };
}

/**
 * Trạng thái dùng chung giữa các lô của một lần chạy (nạp ở lô đầu, cập nhật khi thêm bí danh / mục chờ / đổi gốc mặt hàng).
 * `isSource`: bộ nhận là bộ nguồn gốc · `sourceId`: bộ nguồn gốc của org (tra cột Mã nối) · `itemNos`: mã nối chuẩn hóa → id mặt hàng.
 */
type RunState = { match: MatchContext; setAliases: Map<string, ItemAliasRow>; pendingKeys: Set<string>; isSource: boolean; sourceId: string | null; itemNos: Map<string, string> };

/** Mã nối so khớp không phân biệt hoa thường / khoảng trắng. */
const itemNoKey = (s: string) => s.toUpperCase().replace(/\s+/g, "");

async function loadState(r: CatalogRepos, orgId: OrgId, codeSetId: string): Promise<RunState> {
  const match = await loadMatchContext(r, orgId);
  const setAliases = new Map((await r.aliases.listForCodeSet(orgId, codeSetId, { status: "ACTIVE" })).map((a) => [a.codeKey, a]));
  const pendingKeys = new Set((await r.queue.list(orgId, { status: "PENDING", codeSetId })).map((q) => itemCodeKey(q.code)).filter(Boolean));
  const source = match.sets.find((s) => s.isSource) ?? null;
  const itemNos = new Map([...match.items.values()].map((i) => [itemNoKey(i.itemNo), i.id]));
  return { match, setAliases, pendingKeys, isSource: source?.id === codeSetId, sourceId: source?.id ?? null, itemNos };
}

/** Mặt hàng được cột Mã nối chỉ tới: mã nối (item_no) hoặc mã ở bộ nguồn gốc; đã gộp → mặt hàng cuối chuỗi; phải ACTIVE. */
function linkTarget(st: RunState, linkCode: string): CatalogItemRow | null {
  const byNo = st.itemNos.get(itemNoKey(linkCode));
  let end = byNo ? endOfChain(st.match.items, byNo) : null;
  if (!end && st.sourceId) {
    const a = st.match.aliasBySetCode.get(`${st.sourceId}\0${itemCodeKey(linkCode)}`);
    end = a ? (st.match.items.get(a.itemId) ?? null) : null;
  }
  return end && end.status === "ACTIVE" ? end : null;
}

/** Cập nhật bộ nhớ của lần chạy sau khi đổi gốc / áp thông tin mặt hàng (dòng sau của cùng file thấy ĐVT gốc mới). */
function remember(st: RunState, out: RebaseOutcome | null) {
  if (!out) return;
  st.match.items.set(out.item.id, out.item);
  if (out.kind === "REBASED" || out.kind === "SET_BASE") st.match.convs.set(out.item.id, out.conversions);
  const idx = st.match.index.items.get(out.item.id) as { baseUnit: string | null; conversionUnits: string[] } | undefined;
  if (idx) {
    idx.baseUnit = out.item.baseUnit;
    idx.conversionUnits = (st.match.convs.get(out.item.id) ?? []).map((c) => c.unit);
  }
}

/** Ghép một dòng (trong transaction của lô). Trả phần cộng vào counts. */
async function matchRow(deps: CatalogDeps, r: CatalogRepos, ctx: RunCtx, imp: CatalogImportRow, st: RunState, row: CatalogStagedRow, audit: AuditEntry[]): Promise<Partial<CatalogImportCounts>> {
  const now = deps.clock.now();
  const codeKey = itemCodeKey(row.code);
  const unit = row.unit ?? null;
  const source: AliasSource = row.sourceRef ? "DOCUMENT" : "IMPORT";
  // Bộ nguồn gốc + dòng file Excel → tên, HS và thông tin mặt hàng của dòng quyết định mặt hàng (chứng từ OCR không đè).
  const itemFields: CatalogItemFields | null = st.isSource && source === "IMPORT" ? { name: row.name, ...(row.hs ? { hsCode: row.hs } : {}), ...(row.fields ?? {}) } : null;

  /** Gắn mã bộ nguồn gốc: ĐVT của mã thành ĐVT gốc (biết hệ số), áp thông tin mặt hàng. */
  const sourceAttach = async (itemId: string, codeUnit: string | null) => {
    const item = st.match.items.get(itemId);
    if (!item || !st.isSource) return;
    remember(st, await applySourceAttach(deps, r, ctx, { isSource: true }, item, codeUnit, itemFields, audit));
  };

  /** Hàng chờ – mã này đã chờ duyệt trong bộ → không thêm mục trùng. */
  const enqueue = async (level: MatchQueueRow["level"], reason: ItemMatchReason, suggestedItemId: string | null, candidates: MatchQueueRow["candidates"]): Promise<Partial<CatalogImportCounts>> => {
    if (st.pendingKeys.has(codeKey)) return { skipped: 1 };
    const q: MatchQueueRow = {
      id: deps.idGen.next("cmq"), orgId: ctx.orgId, importId: imp.id, importRow: row.row, codeSetId: imp.codeSetId, code: row.code, name: row.name, unit, hsCode: row.hs ?? null,
      level, suggestedItemId, candidates, reason, status: "PENDING", decidedBy: null, decidedAt: null, sourceRef: row.sourceRef ?? null,
      factor: row.factor ?? null, itemFields, createdAt: now, updatedAt: now,
    };
    await r.queue.insert(q);
    st.pendingKeys.add(codeKey);
    return { queued: 1 };
  };

  const attach = async (itemId: string) => {
    await saveFactor(itemId);
    const alias: ItemAliasRow = {
      id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: imp.codeSetId, code: row.code, codeKey, name: row.name, unit, itemId, status: "ACTIVE",
      proposedBy: ctx.userId, decidedBy: ctx.userId, decidedAt: now, source, createdAt: now, updatedAt: now,
    };
    await r.aliases.insert(alias);
    st.setAliases.set(codeKey, alias);
    audit.unshift({ itemId, key: auditKeyAlias(alias), oldValue: "", newValue: "ACTIVE" });
    await sourceAttach(itemId, unit);
  };

  const saveFactor = async (itemId: string) => {
    const item = st.match.items.get(itemId);
    if (!item || !row.factor || !unit) return;
    const convs = st.match.convs.get(itemId) ?? [];
    if (!needsFactor(item, convs, unit)) return;
    const conv = { id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId, unit, factor: row.factor, createdAt: now, updatedAt: now };
    await r.conversions.upsert(conv);
    st.match.convs.set(itemId, [...convs, conv]);
    audit.push({ itemId, key: `conv:${unit}`, oldValue: "", newValue: row.factor });
  };

  const existing = st.setAliases.get(codeKey);
  // Bí danh trỏ mặt hàng đã gộp → mặt hàng cuối chuỗi.
  const existingItemId = existing ? (st.match.aliasBySetCode.get(`${imp.codeSetId}\0${codeKey}`)?.itemId ?? existing.itemId) : null;

  // 0. Cột Mã nối (spec 2026-11-14 §5): nối thẳng vào mặt hàng đó, bỏ qua luật SURE/MAYBE.
  if (row.linkCode) {
    const target = linkTarget(st, row.linkCode);
    if (!target) return enqueue("NONE", "LINK_NOT_FOUND", existingItemId, existingItemId ? [{ itemId: existingItemId, score: 1, reason: "ALIAS_SAME_SET" }] : []);
    const linked = { itemId: target.id, score: 1, reason: "LINKED_BY_CODE" };
    // Mã đã ACTIVE trong bộ cho mặt hàng khác → không tự chuyển, người duyệt quyết định.
    if (existingItemId && existingItemId !== target.id) return enqueue("MAYBE", "AMBIGUOUS", target.id, [linked, { itemId: existingItemId, score: 1, reason: "ALIAS_SAME_SET" }]);
    if (!existing) {
      if (!row.factor && needsFactor(target, st.match.convs.get(target.id) ?? [], unit)) return enqueue("MAYBE", "UNIT_NO_FACTOR", target.id, [linked]);
      await attach(target.id);
      return { matched: 1 };
    }
  }

  // 1. Mã đã có trong bộ → cập nhật tên/ĐVT của bí danh (nhập lại cùng file không sinh mặt hàng mới).
  if (existing) {
    const patch: Partial<ItemAliasRow> = {};
    // Excel (danh mục người dùng quản lý) → cập nhật; chứng từ (OCR) → chỉ điền tên/ĐVT còn trống.
    const fromDocument = source === "DOCUMENT";
    if (row.name !== (existing.name ?? "") && (!fromDocument || !existing.name)) {
      patch.name = row.name;
      audit.push({ itemId: existing.itemId, key: `${auditKeyAlias(existing)}:name`, oldValue: existing.name ?? "", newValue: row.name });
    }
    if (unit && itemUnitKey(unit) !== itemUnitKey(existing.unit ?? "") && (!fromDocument || !existing.unit)) {
      patch.unit = unit;
      audit.push({ itemId: existing.itemId, key: `${auditKeyAlias(existing)}:unit`, oldValue: existing.unit ?? "", newValue: unit });
    }
    if (Object.keys(patch).length) {
      await r.aliases.update(ctx.orgId, existing.id, { ...patch, updatedAt: now });
      st.setAliases.set(codeKey, { ...existing, ...patch });
    }
    // Bí danh trỏ mặt hàng đã gộp → quy đổi ghi cho mặt hàng cuối chuỗi.
    const target = existingItemId ?? existing.itemId;
    await saveFactor(target);
    // Bộ nguồn gốc: ĐVT của mã là ĐVT gốc (đổi gốc khi biết hệ số; thiếu → giữ, cột "thiếu hệ số" báo) + thông tin mặt hàng của dòng.
    await sourceAttach(target, st.setAliases.get(codeKey)?.unit ?? null);
    return { matched: 1 };
  }

  // 2. Ghép theo luật SURE / MAYBE / NONE. File có hệ số cho ĐVT khác ĐVT gốc → không cần hạ MAYBE.
  const res = resolveWith(st.match, { codeSetId: imp.codeSetId, code: row.code, name: row.name, hsCode: row.hs ?? null, unit });
  const itemId = res.level === "SURE" ? res.itemId : res.reason === "UNIT_NO_FACTOR" && row.factor ? (res.candidates[0]?.itemId ?? null) : null;
  if (itemId) {
    await attach(itemId);
    return { matched: 1 };
  }

  // 3. Hàng chờ.
  return enqueue(res.level, res.reason as ItemMatchReason, res.candidates[0]?.itemId ?? null, res.candidates);
}

/**
 * Ghép các dòng đã lưu tạm của lần nhập `importId`. Gọi từ importRows (≤ 500 dòng) hoặc worker `catalog-import`;
 * quyền đã kiểm khi tạo lần nhập (job chạy với userId của người nhập). DONE/FAILED → trả lại, không làm gì.
 */
export async function runMatch(deps: CatalogDeps, ctx: RunCtx, importId: string): Promise<Result<CatalogImport>> {
  const head = await deps.uow.asOrg(ctx, async (r) => {
    const imp = await r.imports.get(ctx.orgId, importId);
    if (imp?.status === "PARSING") await r.imports.update(ctx.orgId, imp.id, { status: "MATCHING", updatedAt: deps.clock.now() });
    return imp;
  });
  if (!head) return err(importNotFound());
  if (head.status === "DONE" || head.status === "FAILED") return ok(toImportDto(head));

  const rows = head.rows ?? [];
  let st: RunState | null = null;
  let done = head.rowsDone;
  while (done < rows.length) {
    const from = done;
    const step = await deps.uow.asOrg(ctx, async (r) => {
      // Khóa dòng lần nhập rồi kiểm lại rows_done: job chạy trùng (treo rồi chạy lại) chờ ở đây và không ghép lại lô đã xong.
      const cur = await r.imports.getForUpdate(ctx.orgId, importId);
      if (!cur || cur.status !== "MATCHING") return { next: rows.length };
      // Lần chạy khác đã đi trước → tiếp từ chỗ đó.
      if (cur.rowsDone !== from) return { next: cur.rowsDone };
      st ??= await loadState(r, ctx.orgId, cur.codeSetId);
      const chunk = rows.slice(from, from + MATCH_CHUNK_ROWS);
      const audit: AuditEntry[] = [];
      const delta: Partial<CatalogImportCounts> = {};
      for (const row of chunk) {
        const d = await matchRow(deps, r, ctx, cur, st, row, audit);
        for (const [k, v] of Object.entries(d) as [keyof CatalogImportCounts, number][]) delta[k] = (delta[k] ?? 0) + v;
      }
      const now = deps.clock.now();
      if (Object.keys(delta).length) await r.imports.bumpCounts(ctx.orgId, importId, delta, now);
      await r.imports.update(ctx.orgId, importId, { rowsDone: from + chunk.length, updatedAt: now });
      // Bất biến 6: nhật ký của lô cùng transaction với lô ghép.
      await writeAudit(r, ctx, now, audit);
      return { next: from + chunk.length };
    });
    done = step.next;
  }

  const fin = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.imports.get(ctx.orgId, importId);
    if (cur?.status !== "MATCHING") return cur;
    const now = deps.clock.now();
    await r.imports.update(ctx.orgId, importId, { status: "DONE", rows: null, updatedAt: now });
    return { ...cur, status: "DONE" as const, rows: null, updatedAt: now };
  });
  return fin ? ok(toImportDto(fin)) : err(importNotFound());
}

/** Job hết lượt thử → lần nhập FAILED (không kẹt MATCHING); dòng tạm giữ lại để xem. */
export async function failImport(deps: Pick<CatalogDeps, "uow" | "clock">, input: { orgId: OrgId; userId: UserId; importId: string; reason: string }): Promise<void> {
  await deps.uow.asOrg(input, async (r) => {
    const cur = await r.imports.get(input.orgId, input.importId);
    if (!cur || cur.status === "DONE") return;
    await r.imports.update(input.orgId, input.importId, { status: "FAILED", errors: [...cur.errors, { row: 0, field: "job", code: input.reason.slice(0, 200) }], updatedAt: deps.clock.now() });
  });
}
