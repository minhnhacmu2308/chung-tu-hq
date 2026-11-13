// Mặt hàng chuẩn: danh sách (tìm theo mã nối / tên / mọi mã, xem theo bộ mã), chi tiết, tạo (thẳng hoặc vào hàng chờ), sửa thông tin chung, ngưng dùng.
import {
  itemCodeKey, itemNameKey, itemUnitKey, type CatalogItemDetail, type CatalogItemHistoryEntry, type CatalogItemListRow, type CatalogItemPage, type CreateItemInput, type ListCatalogItemsQuery, type UpdateItemInput,
} from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { dec } from "../../../shared/decimal.js";
import { err, ok, type Result } from "../../../shared/result.js";
import {
  ALIAS_ACTIVE_UQ, auditKeyAlias, codeTaken, flushAudit, isDuplicate, itemNotFound, newestAlias, setNotFound, toAliasDto, toItemDto, type AuditEntry,
} from "./common.js";
import { isItemEditor, managesSet, requireCatalogAdmin, requireContributor, requireItemEditor } from "./permissions.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, ItemAliasRow, ItemConversionRow, MatchQueueRow } from "./ports.js";

export async function loadItemDetail(r: CatalogRepos, ctx: Pick<Ctx, "orgId">, id: string): Promise<CatalogItemDetail | null> {
  const item = await r.items.get(ctx.orgId, id);
  if (!item) return null;
  const aliases = await r.aliases.listForItem(ctx.orgId, id);
  const conversions = await r.conversions.listForItem(ctx.orgId, id);
  return {
    item: toItemDto(item),
    aliases: aliases.map(toAliasDto),
    conversions: conversions.map((c) => ({ unit: c.unit, factor: c.factor })),
    usage: { declarations: item.lastDeclarationNo || item.lastDeclarationDate ? [{ declarationNo: item.lastDeclarationNo, date: item.lastDeclarationDate }] : [], invoices: [] },
  };
}

export async function getItem(deps: CatalogDeps, ctx: Ctx, id: string): Promise<Result<CatalogItemDetail>> {
  const d = await deps.uow.asOrg(ctx, (r) => loadItemDetail(r, ctx, id));
  return d ? ok(d) : err(itemNotFound());
}

/** Số dòng lịch sử tối đa trả về cho panel chi tiết. */
export const ITEM_HISTORY_LIMIT = 200;

/** Lịch sử sửa mặt hàng (field_audit CATALOG_EDIT), mới nhất trước. Mọi vai trò được xem; mặt hàng org khác → NOT_FOUND. */
export async function getItemHistory(deps: CatalogDeps, ctx: Ctx, id: string): Promise<Result<CatalogItemHistoryEntry[]>> {
  const item = await deps.uow.asOrg(ctx, (r) => r.items.get(ctx.orgId, id));
  if (!item) return err(itemNotFound());
  // Đọc qua cổng field_audit (kết nối riêng) – NGOÀI transaction của catalog.
  const rows = await deps.audit.list(ctx, id, ITEM_HISTORY_LIMIT);
  return ok(rows.map((r) => ({ key: r.key, oldValue: r.oldValue, newValue: r.newValue, userId: r.userId, at: r.at.toISOString() })));
}

/** Bỏ dấu tiếng Việt để tìm theo tên không phân biệt dấu ("chi may" thấy "Chỉ may"). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

const missingFactorOf = (item: CatalogItemRow, aliases: ItemAliasRow[], convs: ItemConversionRow[]) => {
  if (!item.baseUnit) return false;
  const base = itemUnitKey(item.baseUnit);
  const known = new Set(convs.map((c) => itemUnitKey(c.unit)));
  return aliases.some((a) => a.unit && itemUnitKey(a.unit) !== base && !known.has(itemUnitKey(a.unit)));
};

/** Danh sách mặt hàng (không gồm mặt hàng đã gộp). Mọi vai trò được xem. */
export async function listItems(deps: CatalogDeps, ctx: Ctx, query: ListCatalogItemsQuery): Promise<Result<CatalogItemPage>> {
  return deps.uow.asOrg(ctx, async (r) => {
    const sets = await r.codeSets.list(ctx.orgId);
    if (query.codeSetId && !sets.some((s) => s.id === query.codeSetId)) return err(setNotFound());
    const items = (await r.items.list(ctx.orgId)).filter((i) => i.status === (query.status ?? "ACTIVE"));
    const aliases = await r.aliases.listByOrg(ctx.orgId, { status: "ACTIVE" });
    const convs = await r.conversions.listByOrg(ctx.orgId);
    const byItem = new Map<string, ItemAliasRow[]>();
    for (const a of aliases) byItem.set(a.itemId, [...(byItem.get(a.itemId) ?? []), a]);
    const convByItem = new Map<string, ItemConversionRow[]>();
    for (const c of convs) convByItem.set(c.itemId, [...(convByItem.get(c.itemId) ?? []), c]);
    const primary = sets.find((s) => s.isPrimaryDisplay);
    const customs = sets.find((s) => s.isDefault);

    const q = query.q?.trim() ?? "";
    const qLower = q.toLowerCase();
    const qName = q ? fold(itemNameKey(q)) : "";
    const qCode = q ? itemCodeKey(q) : "";

    const rows: CatalogItemListRow[] = [];
    for (const it of items) {
      const own = byItem.get(it.id) ?? [];
      if (query.kind && it.kind !== query.kind) continue;
      if (q && !(it.itemNo.toLowerCase().includes(qLower) || (qName && fold(it.nameKey).includes(qName)) || (qCode && own.some((a) => a.codeKey.includes(qCode))))) continue;
      const missingCustoms = !customs || !own.some((a) => a.codeSetId === customs.id);
      const missingFactor = missingFactorOf(it, own, convByItem.get(it.id) ?? []);
      if (query.missingCustoms && !missingCustoms) continue;
      if (query.missingFactor && !missingFactor) continue;
      const shown = primary ? newestAlias(own.filter((a) => a.codeSetId === primary.id)) : null;
      const inSet = query.codeSetId ? newestAlias(own.filter((a) => a.codeSetId === query.codeSetId)) : null;
      rows.push({
        ...toItemDto(it),
        displayCode: shown?.code ?? it.itemNo,
        codeSetCount: new Set(own.map((a) => a.codeSetId)).size,
        setCode: inSet?.code ?? null,
        setName: inSet?.name ?? null,
        setUnit: inSet?.unit ?? null,
        missingCustoms,
        missingFactor,
      });
    }
    const start = (query.page - 1) * query.pageSize;
    return ok({ rows: rows.slice(start, start + query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize });
  });
}

/**
 * Mã nối còn trống: số cấp từ bộ đếm, nếu trùng (vd mã nối đã có trước khi đổi tiền tố) thử thêm một số.
 * Kiểm trước khi insert để không làm hỏng transaction; vẫn trùng → lỗi hạ tầng (ném), không phải CATALOG_CODE_TAKEN.
 */
export async function freeItemNo(r: CatalogRepos, ctx: Pick<Ctx, "orgId">): Promise<string> {
  for (let i = 0; i < 2; i++) {
    const no = await r.settings.nextItemNo(ctx.orgId);
    if (!(await r.items.findByItemNo(ctx.orgId, no))) return no;
  }
  throw new Error("catalog: không cấp được mã nối không trùng (item_no_seq lệch dữ liệu)");
}

export type CreateItemResult = { status: "CREATED"; item: CatalogItemDetail } | { status: "QUEUED"; queueId: string };

/**
 * Tạo mặt hàng. APPROVER/ADMIN/OWNER hoặc người phụ trách bộ mã của mã kèm theo → tạo thẳng (bí danh ACTIVE).
 * DECLARANT khác → vào hàng chờ ghép (mức NONE – "tạo mặt hàng mới") để người phụ trách duyệt. VIEWER → FORBIDDEN.
 */
export async function createItem(deps: CatalogDeps, ctx: Ctx, input: CreateItemInput): Promise<Result<CreateItemResult>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  if (input.code && !input.codeSetId) return err(domainError("VALIDATION", "Mã hàng cần kèm bộ mã"));
  const now = deps.clock.now();
  let done: Result<{ out: CreateItemResult; audit: AuditEntry[] }>;
  try {
    done = await deps.uow.asOrg(ctx, async (r) => {
      const set = input.codeSetId ? await r.codeSets.get(ctx.orgId, input.codeSetId) : null;
      if (input.codeSetId && !set) return err(setNotFound());
      // Tạo mặt hàng: người sửa thông tin chung hoặc người phụ trách bộ mã. Bí danh ACTIVE chỉ khi quản lý được bộ (phụ trách / ADMIN / OWNER) – APPROVER khác → PROPOSED.
      const manages = set ? await managesSet(r, ctx, set.id) : false;
      const direct = isItemEditor(ctx) || manages;
      const aliasStatus = manages ? ("ACTIVE" as const) : ("PROPOSED" as const);
      if (!direct) {
        const target = set ?? (await r.codeSets.list(ctx.orgId)).find((s) => s.isDefault) ?? null;
        if (!target) return err(domainError("VALIDATION", "Chưa có bộ mã để đưa vào hàng chờ"));
        const row: MatchQueueRow = {
          id: deps.idGen.next("cmq"), orgId: ctx.orgId, importId: null, codeSetId: target.id, code: input.code ?? "", name: input.name, unit: input.baseUnit ?? null, hsCode: input.hsCode ?? null,
          level: "NONE", suggestedItemId: null, candidates: [], reason: "NO_MATCH", status: "PENDING", decidedBy: null, decidedAt: null, sourceRef: `user:${ctx.userId}`, createdAt: now, updatedAt: now,
        };
        await r.queue.insert(row);
        return ok({ out: { status: "QUEUED" as const, queueId: row.id }, audit: [] });
      }
      const codeKey = input.code ? itemCodeKey(input.code) : "";
      if (set && codeKey && aliasStatus === "ACTIVE") {
        const holder = await r.aliases.findActive(ctx.orgId, set.id, codeKey);
        if (holder) return err(codeTaken(await r.items.get(ctx.orgId, holder.itemId)));
      }
      const item: CatalogItemRow = {
        id: deps.idGen.next("cat"), orgId: ctx.orgId, itemNo: await freeItemNo(r, ctx), kind: input.kind, name: input.name, nameKey: itemNameKey(input.name),
        hsCode: input.hsCode ?? null, baseUnit: input.baseUnit ?? null, origin: input.origin ?? null, tariffSchedule: null, importDutyRate: null, vatRate: null, envTaxRate: null,
        exciseRate: null, safeguardRate: null, antiDiscriminationRate: null, description: input.description ?? null, note: input.note ?? null, timesDeclared: 0,
        lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null, status: "ACTIVE", mergedIntoId: null, source: "MANUAL", updatedBy: ctx.userId, createdAt: now, updatedAt: now,
      };
      await r.items.insert(item);
      const audit: AuditEntry[] = [{ itemId: item.id, key: "item", oldValue: "", newValue: `${item.itemNo} ${item.name}` }];
      if (set && input.code && codeKey) {
        const alias: ItemAliasRow = {
          id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: set.id, code: input.code, codeKey, name: input.name, unit: input.baseUnit ?? null, itemId: item.id, status: aliasStatus,
          proposedBy: ctx.userId, decidedBy: aliasStatus === "ACTIVE" ? ctx.userId : null, decidedAt: aliasStatus === "ACTIVE" ? now : null, source: "MANUAL", createdAt: now, updatedAt: now,
        };
        await r.aliases.insert(alias);
        audit.push({ itemId: item.id, key: auditKeyAlias(alias), oldValue: "", newValue: aliasStatus });
      }
      for (const c of input.conversions ?? []) {
        if (item.baseUnit && itemUnitKey(c.unit) === itemUnitKey(item.baseUnit)) continue;
        await r.conversions.upsert({ id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: item.id, unit: c.unit, factor: c.factor, createdAt: now, updatedAt: now });
        audit.push({ itemId: item.id, key: `conv:${c.unit}`, oldValue: "", newValue: c.factor });
      }
      const detail = (await loadItemDetail(r, ctx, item.id))!;
      return ok({ out: { status: "CREATED" as const, item: detail }, audit });
    });
  } catch (e) {
    // Hai người cùng gán một mã trong cùng bộ: unique (bộ, code_key) ACTIVE chặn ở DB.
    if (isDuplicate(e, ALIAS_ACTIVE_UQ)) return err(codeTaken(null));
    throw e;
  }
  if (!done.ok) return done;
  await flushAudit(deps, ctx, done.value.audit);
  return ok(done.value.out);
}

const DECIMAL_FIELDS = new Set<string>(["importDutyRate", "vatRate"]);
/** Thuế suất so theo giá trị Decimal ("10.00" = "10") – không ghi audit thừa. */
function sameValue(f: string, a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!DECIMAL_FIELDS.has(f) || typeof a !== "string" || typeof b !== "string") return false;
  return dec(a).eq(dec(b));
}

const EDITABLE = ["kind", "name", "hsCode", "baseUnit", "origin", "description", "note", "importDutyRate", "vatRate", "tariffSchedule"] as const;

/** Sửa thông tin chung (APPROVER/ADMIN/OWNER). Mỗi trường đổi → một mục field_audit; quy đổi kèm theo được thêm/cập nhật. */
export async function updateItem(deps: CatalogDeps, ctx: Ctx, id: string, input: UpdateItemInput): Promise<Result<CatalogItemDetail>> {
  const allowed = requireItemEditor(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const done = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.items.get(ctx.orgId, id);
    if (!cur) return err(itemNotFound());
    if (cur.status === "MERGED") return err(domainError("INVALID_STATE", "Mặt hàng đã gộp vào mặt hàng khác"));
    const patch: Partial<CatalogItemRow> = {};
    const audit: AuditEntry[] = [];
    for (const f of EDITABLE) {
      const v = input[f];
      if (v === undefined) continue;
      const next = v ?? null;
      if (sameValue(f, cur[f], next)) continue;
      (patch as Record<string, unknown>)[f] = next;
      audit.push({ itemId: id, key: f, oldValue: String(cur[f] ?? ""), newValue: String(next ?? "") });
    }
    if (patch.name !== undefined) patch.nameKey = itemNameKey(patch.name);
    const baseUnit = patch.baseUnit !== undefined ? patch.baseUnit : cur.baseUnit;
    if (input.conversions?.length) {
      const existing = await r.conversions.listForItem(ctx.orgId, id);
      for (const c of input.conversions) {
        if (baseUnit && itemUnitKey(c.unit) === itemUnitKey(baseUnit)) continue;
        const old = existing.find((x) => itemUnitKey(x.unit) === itemUnitKey(c.unit));
        if (old?.factor === c.factor) continue;
        await r.conversions.upsert({ id: old?.id ?? deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: id, unit: old?.unit ?? c.unit, factor: c.factor, createdAt: old?.createdAt ?? now, updatedAt: now });
        audit.push({ itemId: id, key: `conv:${old?.unit ?? c.unit}`, oldValue: old?.factor ?? "", newValue: c.factor });
      }
    }
    if (Object.keys(patch).length) await r.items.update(ctx.orgId, id, { ...patch, updatedBy: ctx.userId, updatedAt: now });
    return ok({ detail: (await loadItemDetail(r, ctx, id))!, audit });
  });
  if (!done.ok) return done;
  await flushAudit(deps, ctx, done.value.audit);
  return ok(done.value.detail);
}

/** Ngưng dùng (ARCHIVED) hoặc dùng lại (ACTIVE) – ADMIN/OWNER. Không xóa cứng (chứng từ cũ còn trỏ). */
export async function archiveItem(deps: CatalogDeps, ctx: Ctx, id: string, archived = true): Promise<Result<CatalogItemDetail>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const done = await deps.uow.asOrg(ctx, async (r) => {
    const cur = await r.items.get(ctx.orgId, id);
    if (!cur) return err(itemNotFound());
    if (cur.status === "MERGED") return err(domainError("INVALID_STATE", "Mặt hàng đã gộp vào mặt hàng khác"));
    const next = archived ? "ARCHIVED" : "ACTIVE";
    const audit: AuditEntry[] = [];
    if (cur.status !== next) {
      await r.items.update(ctx.orgId, id, { status: next, updatedBy: ctx.userId, updatedAt: deps.clock.now() });
      audit.push({ itemId: id, key: "status", oldValue: cur.status, newValue: next });
    }
    return ok({ detail: (await loadItemDetail(r, ctx, id))!, audit });
  });
  if (!done.ok) return done;
  await flushAudit(deps, ctx, done.value.audit);
  return ok(done.value.detail);
}
