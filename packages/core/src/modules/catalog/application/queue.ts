// Hàng chờ ghép (spec §4 "Duyệt"): xem, Xác nhận / Chọn mặt hàng khác / Tạo mặt hàng mới / Bỏ qua, xác nhận hàng loạt.
// Người phụ trách bộ mã của mục hoặc ADMIN/OWNER. Mọi kiểm tra chạy TRƯỚC lần ghi đầu tiên (uow commit cả khi callback trả err);
// đóng mục bằng claim (UPDATE … WHERE status = 'PENDING') nên hai người duyệt cùng lúc chỉ một người thành công.
import {
  itemCodeKey, itemNameKey, type AliasSource, type DecideQueueBulkInput, type DecideQueueBulkResult, type DecideQueueInput, type ListQueueQuery, type MatchQueueItem, type MatchQueueListRow,
  type MatchQueuePage,
} from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { ALIAS_ACTIVE_UQ, auditKeyAlias, codeTaken, factorRequired, asOrgAudited, isDuplicate, itemNotFound, needsFactor, type AuditEntry } from "./common.js";
import { freeItemNo } from "./items.js";
import { requireContributor, requireSetManager } from "./permissions.js";
import { applySourceAttach } from "./source-rules.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, ItemAliasRow, MatchQueueRow } from "./ports.js";

export function toQueueDto(q: MatchQueueRow): MatchQueueItem {
  return {
    id: q.id, importId: q.importId, codeSetId: q.codeSetId, code: q.code, name: q.name, unit: q.unit, hsCode: q.hsCode, level: q.level, suggestedItemId: q.suggestedItemId,
    candidates: q.candidates, reason: q.reason, status: q.status, decidedBy: q.decidedBy, decidedAt: q.decidedAt?.toISOString() ?? null, sourceRef: q.sourceRef,
    factor: q.factor ?? null, itemFields: q.itemFields ?? null,
  };
}

const queueNotFound = () => domainError("NOT_FOUND", "Không tìm thấy mục chờ ghép");
const queueDone = () => reasonError("INVALID_STATE", "CATALOG_QUEUE_ITEM_DONE");

/** Hàng chờ (mọi vai trò được xem). `mine` → chỉ bộ mã mình phụ trách. Cũ trước. */
export async function listQueue(deps: CatalogDeps, ctx: Ctx, query: ListQueueQuery): Promise<Result<MatchQueuePage>> {
  return deps.uow.asOrg(ctx, async (r) => {
    let rows = await r.queue.list(ctx.orgId, { status: query.status, ...(query.codeSetId ? { codeSetId: query.codeSetId } : {}), ...(query.importId ? { importId: query.importId } : {}) });
    if (query.level) rows = rows.filter((q) => q.level === query.level);
    if (query.mine) {
      const mine = new Set<string>();
      for (const s of await r.codeSets.list(ctx.orgId)) if (await r.owners.isOwner(ctx.orgId, s.id, ctx.userId)) mine.add(s.id);
      rows = rows.filter((q) => mine.has(q.codeSetId));
    }
    rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.importRow ?? 0) - (b.importRow ?? 0) || a.id.localeCompare(b.id));
    const start = (query.page - 1) * query.pageSize;
    const page = rows.slice(start, start + query.pageSize);
    // Tóm tắt mặt hàng gợi ý + ứng viên của cả trang: đọc theo lô (không gọi chi tiết từng mặt hàng từ giao diện).
    const ids = [...new Set(page.flatMap((q) => [q.suggestedItemId, ...q.candidates.map((c) => c.itemId)]).filter((id): id is string => !!id))];
    const items = await liveItems(r, ctx.orgId, ids);
    const targets = [...new Set(page.map((q) => (q.suggestedItemId ? items.get(q.suggestedItemId)?.id : undefined)).filter((id): id is string => !!id))];
    const convs = targets.length ? await r.conversions.listForItems(ctx.orgId, targets) : [];
    const out: MatchQueueListRow[] = page.map((q) => {
      const s = q.suggestedItemId ? items.get(q.suggestedItemId) : undefined;
      return {
        ...toQueueDto(q),
        suggested: s ? { ...summaryOf(s), needsFactor: needsFactor(s, convs.filter((c) => c.itemId === s.id), q.unit) } : null,
        candidateItems: q.candidates.flatMap((c) => {
          const it = items.get(c.itemId);
          return it ? [{ ...summaryOf(it), score: c.score, reason: c.reason }] : [];
        }).slice(0, 5),
      };
    });
    return ok({ rows: out, total: rows.length, page: query.page, pageSize: query.pageSize });
  });
}

const summaryOf = (i: CatalogItemRow) => ({ id: i.id, itemNo: i.itemNo, name: i.name, hsCode: i.hsCode, baseUnit: i.baseUnit });

/** id → mặt hàng (đã gộp → mặt hàng cuối chuỗi `merged_into_id`); mỗi bước gộp một lần đọc theo lô, tối đa MAX_MERGE_HOPS bước. */
const MAX_MERGE_HOPS = 5;
async function liveItems(r: CatalogRepos, orgId: Ctx["orgId"], ids: string[]): Promise<Map<string, CatalogItemRow>> {
  const out = new Map<string, CatalogItemRow>();
  let pending = new Map(ids.map((id) => [id, id]));
  for (let hop = 0; hop < MAX_MERGE_HOPS && pending.size; hop++) {
    const byId = new Map((await r.items.getMany(orgId, [...new Set(pending.values())])).map((i) => [i.id, i]));
    const next = new Map<string, string>();
    for (const [origin, cur] of pending) {
      const it = byId.get(cur);
      if (!it) continue;
      if (it.status === "MERGED" && it.mergedIntoId) next.set(origin, it.mergedIntoId);
      else out.set(origin, it);
    }
    pending = next;
  }
  return out;
}

/** Nguồn bí danh sinh từ mục chờ: chứng từ / lần nhập Excel / người dùng tạo tay. */
const aliasSourceOf = (q: MatchQueueRow): AliasSource => (q.sourceRef && !q.sourceRef.startsWith("user:") ? "DOCUMENT" : q.importId ? "IMPORT" : "MANUAL");

/**
 * Duyệt một mục chờ. CONFIRM: mặt hàng gợi ý (mục không có gợi ý → tạo mặt hàng mới) · CHOOSE: `itemId` · CREATE: mặt hàng mới (mã nối)
 * · SKIP. Gắn mã: mã đã ACTIVE ở mặt hàng khác trong bộ → CATALOG_CODE_TAKEN; ĐVT ≠ ĐVT gốc chưa quy đổi → cần `factor`
 * (CATALOG_UNIT_FACTOR_REQUIRED). Mục đã xử lý → CATALOG_QUEUE_ITEM_DONE.
 */
export async function decideQueue(deps: CatalogDeps, ctx: Ctx, id: string, input: DecideQueueInput): Promise<Result<MatchQueueItem>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  if (input.action === "CHOOSE" && !input.itemId) return err(domainError("VALIDATION", "Chọn mặt hàng để ghép"));
  const now = deps.clock.now();
  let done: Result<{ out: MatchQueueRow; audit: AuditEntry[] }>;
  try {
    done = await asOrgAudited(deps, ctx, async (r): Promise<Result<{ out: MatchQueueRow; audit: AuditEntry[] }>> => {
      const q = await r.queue.get(ctx.orgId, id);
      if (!q) return err(queueNotFound());
      const can = await requireSetManager(r, ctx, q.codeSetId);
      if (!can.ok) return can;
      if (q.status !== "PENDING") return err(queueDone());
      const closed = { decidedBy: ctx.userId, decidedAt: now, updatedAt: now };
      const bump = async (delta: { created?: number; matched?: number; skipped?: number }) => {
        if (q.importId) await r.imports.bumpCounts(ctx.orgId, q.importId, { queued: -1, ...delta }, now);
      };

      if (input.action === "SKIP") {
        if (!(await r.queue.claim(ctx.orgId, q.id, { status: "SKIPPED", ...closed }))) return err(queueDone());
        await bump({ skipped: 1 });
        return ok({ out: { ...q, status: "SKIPPED" as const, ...closed }, audit: [] });
      }

      const set = await r.codeSets.get(ctx.orgId, q.codeSetId);
      const isSource = !!set?.isSource;
      // Hệ số: người duyệt nhập (ô điền sẵn từ cột Quy đổi) – không gửi thì dùng hệ số của dòng file (xác nhận hàng loạt).
      const factor = input.factor ?? q.factor ?? undefined;
      const fields = isSource ? (q.itemFields ?? null) : null;
      const codeKey = q.code ? itemCodeKey(q.code) : "";
      const holder = codeKey ? await r.aliases.findActive(ctx.orgId, q.codeSetId, codeKey) : null;
      const holderItem = holder ? await r.items.resolveMerged(ctx.orgId, holder.itemId) : null;
      const targetId = input.action === "CHOOSE" ? input.itemId! : input.action === "CONFIRM" ? q.suggestedItemId : null;
      const audit: AuditEntry[] = [];

      // Tạo mặt hàng mới (CREATE, hoặc CONFIRM mục không có gợi ý).
      if (!targetId) {
        if (holder) return err(codeTaken(holderItem ?? (await r.items.get(ctx.orgId, holder.itemId))));
        if (!(await r.queue.claim(ctx.orgId, q.id, { status: "DONE", ...closed }))) return err(queueDone());
        // Dòng của bộ nguồn gốc mang thông tin mặt hàng (loại, xuất xứ, thuế…) → dùng làm dữ liệu mặt hàng mới.
        const name = fields?.name ?? q.name;
        const item: CatalogItemRow = {
          id: deps.idGen.next("cat"), orgId: ctx.orgId, itemNo: await freeItemNo(r, ctx), kind: input.kind ?? fields?.kind ?? "GOODS", name, nameKey: itemNameKey(name),
          hsCode: fields?.hsCode ?? q.hsCode, baseUnit: q.unit, origin: fields?.origin ?? null, tariffSchedule: fields?.tariffSchedule ?? null, importDutyRate: fields?.importDutyRate ?? null,
          vatRate: fields?.vatRate ?? null, envTaxRate: fields?.envTaxRate ?? null, exciseRate: fields?.exciseRate ?? null, safeguardRate: fields?.safeguardRate ?? null,
          antiDiscriminationRate: fields?.antiDiscriminationRate ?? null, qty2Unit: fields?.qty2Unit ?? null, qty2Factor: fields?.qty2Unit ? (fields.qty2Factor ?? null) : null, description: fields?.description ?? null, note: fields?.note ?? null, timesDeclared: 0, lastDeclarationNo: null,
          lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: q.importId ? "IMPORT" : "QUEUE", updatedBy: ctx.userId, createdAt: now, updatedAt: now,
        };
        await r.items.insert(item);
        audit.push({ itemId: item.id, key: "item", oldValue: "", newValue: `${item.itemNo} ${item.name}` });
        if (codeKey) {
          const alias: ItemAliasRow = {
            id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: q.codeSetId, code: q.code, codeKey, name: q.name, unit: q.unit, itemId: item.id, status: "ACTIVE",
            proposedBy: ctx.userId, decidedBy: ctx.userId, decidedAt: now, source: aliasSourceOf(q), createdAt: now, updatedAt: now,
          };
          await r.aliases.insert(alias);
          audit.push({ itemId: item.id, key: auditKeyAlias(alias), oldValue: "", newValue: "ACTIVE" });
        }
        await r.queue.update(ctx.orgId, q.id, { suggestedItemId: item.id });
        await bump({ created: 1 });
        return ok({ out: { ...q, status: "DONE" as const, suggestedItemId: item.id, ...closed }, audit });
      }

      // Gắn mã vào mặt hàng có sẵn (CONFIRM gợi ý / CHOOSE).
      const item = await r.items.resolveMerged(ctx.orgId, targetId);
      if (!item || item.status !== "ACTIVE") return err(itemNotFound());
      if (holder && holderItem?.id !== item.id) return err(codeTaken(holderItem ?? (await r.items.get(ctx.orgId, holder.itemId))));
      const convs = await r.conversions.listForItem(ctx.orgId, item.id);
      const needFactor = !holder && needsFactor(item, convs, q.unit);
      if (needFactor && !factor) return err(factorRequired(q.unit!));
      if (!(await r.queue.claim(ctx.orgId, q.id, { status: "DONE", suggestedItemId: item.id, ...closed }))) return err(queueDone());
      if (needFactor && q.unit && factor) {
        await r.conversions.upsert({ id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: item.id, unit: q.unit, factor, createdAt: now, updatedAt: now });
        audit.push({ itemId: item.id, key: `conv:${q.unit}`, oldValue: "", newValue: factor });
      }
      // Bộ nguồn gốc: ĐVT của mã thành ĐVT gốc (đổi gốc theo hệ số vừa có) + áp thông tin mặt hàng của dòng.
      if (isSource) await applySourceAttach(deps, r, ctx, { isSource }, item, q.unit, fields, audit);
      if (codeKey && !holder) {
        const alias: ItemAliasRow = {
          id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: q.codeSetId, code: q.code, codeKey, name: q.name, unit: q.unit, itemId: item.id, status: "ACTIVE",
          proposedBy: ctx.userId, decidedBy: ctx.userId, decidedAt: now, source: aliasSourceOf(q), createdAt: now, updatedAt: now,
        };
        await r.aliases.insert(alias);
        audit.unshift({ itemId: item.id, key: auditKeyAlias(alias), oldValue: "", newValue: "ACTIVE" });
      }
      await bump({ matched: 1 });
      return ok({ out: { ...q, status: "DONE" as const, suggestedItemId: item.id, ...closed }, audit });
    });
  } catch (e) {
    // Đua đồng thời: người khác vừa gán cùng mã trong bộ → unique (bộ, code_key) ACTIVE chặn ở DB.
    if (isDuplicate(e, ALIAS_ACTIVE_UQ)) return err(codeTaken(null));
    throw e;
  }
  if (!done.ok) return done;
  return ok(toQueueDto(done.value.out));
}

/** Xác nhận hàng loạt: mỗi mục một transaction; mục lỗi (thiếu hệ số, đã xử lý, mã bị giữ…) báo riêng, không chặn mục khác. */
export async function decideQueueBulk(deps: CatalogDeps, ctx: Ctx, input: DecideQueueBulkInput): Promise<Result<DecideQueueBulkResult>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  const out: DecideQueueBulkResult = { decided: [], failed: [] };
  for (const id of [...new Set(input.ids)]) {
    const r = await decideQueue(deps, ctx, id, { action: input.action });
    if (r.ok) out.decided.push(id);
    else out.failed.push({ id, code: r.error.code, reason: r.error.reason ?? null });
  }
  return ok(out);
}
