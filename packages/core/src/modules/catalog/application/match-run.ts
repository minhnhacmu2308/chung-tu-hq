// Ghép các dòng đã lưu tạm của một lần nhập (spec §4) – code thuần, không AI (bất biến 5). Dùng cho nhập đồng bộ (≤ 500 dòng)
// và job nền `catalog-import`. Danh mục + chỉ mục ghép nạp MỘT lần cho cả lần nhập; dòng xử lý theo lô, mỗi lô một transaction
// ghi kết quả + `rows_done` cùng lúc → job chạy lại tiếp từ lô chưa xong (idempotent theo (import_id, dòng); unique ở DB chặn trùng).
// Mỗi dòng: mã đã có trong bộ → cập nhật tên/ĐVT bí danh (dòng từ chứng từ chỉ điền chỗ trống – không ghi đè tên đã chỉnh bằng chữ OCR)
// · SURE → bí danh ACTIVE · MAYBE/NONE → hàng chờ PENDING (đã chờ sẵn cùng mã → đếm skipped, không thêm mục trùng).
import { itemCodeKey, itemUnitKey, type AliasSource, type CatalogImport } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { auditKeyAlias, flushAudit, needsFactor, type AuditEntry } from "./common.js";
import type { CatalogDeps, CatalogImportCounts, CatalogImportRow, CatalogRepos, CatalogStagedRow, ItemAliasRow, MatchQueueRow } from "./ports.js";
import { loadMatchContext, resolveWith, type MatchContext } from "./resolve.js";

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

/** Trạng thái dùng chung giữa các lô của một lần chạy (nạp ở lô đầu, cập nhật khi thêm bí danh / mục chờ). */
type RunState = { match: MatchContext; setAliases: Map<string, ItemAliasRow>; pendingKeys: Set<string> };

async function loadState(r: CatalogRepos, orgId: OrgId, codeSetId: string): Promise<RunState> {
  const match = await loadMatchContext(r, orgId);
  const setAliases = new Map((await r.aliases.listForCodeSet(orgId, codeSetId, { status: "ACTIVE" })).map((a) => [a.codeKey, a]));
  const pendingKeys = new Set((await r.queue.list(orgId, { status: "PENDING", codeSetId })).map((q) => itemCodeKey(q.code)).filter(Boolean));
  return { match, setAliases, pendingKeys };
}

/** Ghép một dòng (trong transaction của lô). Trả phần cộng vào counts. */
async function matchRow(deps: CatalogDeps, r: CatalogRepos, ctx: RunCtx, imp: CatalogImportRow, st: RunState, row: CatalogStagedRow, audit: AuditEntry[]): Promise<Partial<CatalogImportCounts>> {
  const now = deps.clock.now();
  const codeKey = itemCodeKey(row.code);
  const unit = row.unit ?? null;
  const source: AliasSource = row.sourceRef ? "DOCUMENT" : "IMPORT";

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

  // 1. Mã đã có trong bộ → cập nhật tên/ĐVT của bí danh (nhập lại cùng file không sinh mặt hàng mới).
  const existing = st.setAliases.get(codeKey);
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
    await saveFactor(st.match.aliasBySetCode.get(`${imp.codeSetId}\0${codeKey}`)?.itemId ?? existing.itemId);
    return { matched: 1 };
  }

  // 2. Ghép theo luật SURE / MAYBE / NONE. File có hệ số cho ĐVT khác ĐVT gốc → không cần hạ MAYBE.
  const res = resolveWith(st.match, { codeSetId: imp.codeSetId, code: row.code, name: row.name, hsCode: row.hs ?? null, unit });
  const itemId = res.level === "SURE" ? res.itemId : res.reason === "UNIT_NO_FACTOR" && row.factor ? (res.candidates[0]?.itemId ?? null) : null;
  if (itemId) {
    await saveFactor(itemId);
    const alias: ItemAliasRow = {
      id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: imp.codeSetId, code: row.code, codeKey, name: row.name, unit, itemId, status: "ACTIVE",
      proposedBy: ctx.userId, decidedBy: ctx.userId, decidedAt: now, source, createdAt: now, updatedAt: now,
    };
    await r.aliases.insert(alias);
    st.setAliases.set(codeKey, alias);
    audit.unshift({ itemId, key: auditKeyAlias(alias), oldValue: "", newValue: "ACTIVE" });
    return { matched: 1 };
  }

  // 3. Hàng chờ – mã này đã chờ duyệt trong bộ → không thêm mục trùng.
  if (st.pendingKeys.has(codeKey)) return { skipped: 1 };
  const q: MatchQueueRow = {
    id: deps.idGen.next("cmq"), orgId: ctx.orgId, importId: imp.id, importRow: row.row, codeSetId: imp.codeSetId, code: row.code, name: row.name, unit, hsCode: row.hs ?? null,
    level: res.level, suggestedItemId: res.candidates[0]?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING",
    decidedBy: null, decidedAt: null, sourceRef: row.sourceRef ?? null, createdAt: now, updatedAt: now,
  };
  await r.queue.insert(q);
  st.pendingKeys.add(codeKey);
  return { queued: 1 };
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
      if (!cur || cur.status !== "MATCHING") return { next: rows.length, audit: [] as AuditEntry[] };
      // Lần chạy khác đã đi trước → tiếp từ chỗ đó.
      if (cur.rowsDone !== from) return { next: cur.rowsDone, audit: [] as AuditEntry[] };
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
      return { next: from + chunk.length, audit };
    });
    await flushAudit(deps, ctx, step.audit);
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
