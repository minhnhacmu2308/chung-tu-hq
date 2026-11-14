// Gộp / tách mặt hàng (ADMIN/OWNER). Không xóa cứng: mặt hàng bị gộp giữ dòng với status MERGED + merged_into_id,
// chứng từ cũ trỏ id cũ tra ra mặt hàng cuối chuỗi (A→B→C: A ra C) qua items.resolveMerged.
import { itemNameKey, itemUnitKey, type CatalogItemDetail, type CreateItemInput } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { auditKeyAlias, factorRequired, asOrgAudited, itemNotFound, needsFactor, type AuditEntry } from "./common.js";
import { freeItemNo, loadItemDetail } from "./items.js";
import { requireCatalogAdmin } from "./permissions.js";
import type { CatalogDeps, CatalogItemRow } from "./ports.js";

const mergeInvalid = (why: string) => reasonError("INVALID_STATE", "CATALOG_MERGE_INVALID", undefined, { why });

/** Ngày khai mới hơn (YYYY-MM-DD so được theo chuỗi); null thua mọi ngày. */
const later = (a: string | null, b: string | null) => (a ?? "") >= (b ?? "");

/**
 * Gộp `fromId` vào `intoId`: chuyển bí danh (trừ bản trùng bộ + mã + trạng thái đã có ở đích) và quy đổi chưa có ở đích,
 * cộng `times_declared`, lấy lần khai gần nhất, đặt mặt hàng nguồn MERGED. Gộp vào chính nó / mặt hàng đã gộp / từ mặt hàng đã gộp → CATALOG_MERGE_INVALID.
 * field_audit: 1 mục ở mặt hàng nguồn (status) + 1 mục ở đích (merge) + 1 mục mỗi bí danh / quy đổi chuyển sang.
 */
export async function mergeItems(deps: CatalogDeps, ctx: Ctx, input: { fromId: string; intoId: string }): Promise<Result<CatalogItemDetail>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  if (input.fromId === input.intoId) return err(mergeInvalid("SELF"));
  const done = await asOrgAudited(deps, ctx, async (r): Promise<Result<{ detail: CatalogItemDetail; audit: AuditEntry[]; label: string }>> => {
    // Khóa cả hai dòng theo thứ tự id rồi mới đọc: gộp A→B và B→A song song không cùng thành công (bên sau đọc lại thấy MERGED).
    await r.items.lockForUpdate(ctx.orgId, [input.fromId, input.intoId]);
    const from = await r.items.get(ctx.orgId, input.fromId);
    const into = await r.items.get(ctx.orgId, input.intoId);
    if (!from || !into) return err(itemNotFound());
    if (from.status === "MERGED") return err(mergeInvalid("FROM_MERGED"));
    if (into.status !== "ACTIVE") return err(mergeInvalid(into.status === "MERGED" ? "INTO_MERGED" : "INTO_ARCHIVED"));

    // ĐVT: đích giữ ĐVT gốc của mình (thiếu thì lấy của nguồn). Quy đổi của nguồn chỉ mang sang khi cùng ĐVT gốc (khác gốc thì hệ số sai nghĩa).
    const baseAfter = into.baseUnit ?? from.baseUnit;
    const sameBase = !from.baseUnit || !into.baseUnit || itemUnitKey(from.baseUnit) === itemUnitKey(into.baseUnit);
    const targetConv = await r.conversions.listForItem(ctx.orgId, into.id);
    const has = (list: { unit: string }[], u: string) => list.some((t) => itemUnitKey(t.unit) === itemUnitKey(u));
    const carry = sameBase ? (await r.conversions.listForItem(ctx.orgId, from.id)).filter((c) => !has(targetConv, c.unit) && !(baseAfter && itemUnitKey(baseAfter) === itemUnitKey(c.unit))) : [];
    const convAfter = [...targetConv, ...carry];

    const targetAliases = await r.aliases.listForItem(ctx.orgId, into.id);
    const sameAlias = (a: { codeSetId: string; codeKey: string; status: string }) => targetAliases.some((t) => t.codeSetId === a.codeSetId && t.codeKey === a.codeKey && t.status === a.status);
    const moving = (await r.aliases.listForItem(ctx.orgId, from.id)).filter((a) => !sameAlias(a));
    // Bí danh ACTIVE mang ĐVT mà đích không quy đổi được → dừng, không gộp nửa vời (nhập quy đổi cho đích rồi gộp lại).
    for (const a of moving) {
      if (a.status === "ACTIVE" && needsFactor({ baseUnit: baseAfter }, convAfter, a.unit)) return err(factorRequired(a.unit!));
    }

    const now = deps.clock.now();
    const audit: AuditEntry[] = [
      { itemId: from.id, key: "status", oldValue: from.status, newValue: `MERGED → ${into.itemNo}` },
      { itemId: into.id, key: "merge", oldValue: "", newValue: from.itemNo },
    ];
    // Điều kiện status <> MERGED ở câu UPDATE (trước mọi ghi khác): chốt chặn cuối nếu dòng đã bị gộp giữa chừng.
    if (!(await r.items.markMerged(ctx.orgId, from.id, into.id, ctx.userId, now))) return err(mergeInvalid("FROM_MERGED"));
    for (const a of moving) {
      await r.aliases.update(ctx.orgId, a.id, { itemId: into.id, updatedAt: now });
      audit.push({ itemId: into.id, key: auditKeyAlias(a), oldValue: `${from.itemNo} →`, newValue: a.status });
    }
    for (const c of carry) {
      await r.conversions.upsert({ id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: into.id, unit: c.unit, factor: c.factor, createdAt: now, updatedAt: now });
      await r.conversions.delete(ctx.orgId, from.id, c.unit);
      audit.push({ itemId: into.id, key: `conv:${c.unit}`, oldValue: "", newValue: c.factor });
    }
    const takeLast = !later(into.lastDeclarationDate, from.lastDeclarationDate);
    const patch: Partial<CatalogItemRow> = {
      timesDeclared: into.timesDeclared + from.timesDeclared,
      ...(takeLast ? { lastDeclarationNo: from.lastDeclarationNo, lastDeclarationDate: from.lastDeclarationDate, lastTypeCode: from.lastTypeCode } : {}),
      // Đích thiếu HS / ĐVT gốc thì lấy của nguồn.
      ...(!into.hsCode && from.hsCode ? { hsCode: from.hsCode } : {}),
      ...(!into.baseUnit && from.baseUnit ? { baseUnit: from.baseUnit } : {}),
      updatedBy: ctx.userId,
      updatedAt: now,
    };
    await r.items.update(ctx.orgId, into.id, patch);
    return ok({ detail: (await loadItemDetail(r, ctx, into.id))!, audit, label: `${from.itemNo} → ${into.itemNo}` });
  });
  if (!done.ok) return done;
  await deps.orgAudit?.record(ctx, { action: "CATALOG_ITEMS_MERGED", targetType: "catalog_item", targetId: input.intoId, targetLabel: done.value.label });
  return ok(done.value.detail);
}

export type SplitNewItem = Pick<CreateItemInput, "kind" | "name"> & Partial<Pick<CreateItemInput, "hsCode" | "baseUnit" | "origin" | "description" | "note">>;

/**
 * Tách: chuyển các bí danh (cùng một mặt hàng ACTIVE) sang mặt hàng mới. field_audit: 1 mục tạo mặt hàng + 2 mục mỗi bí danh (cũ, mới)
 * + 1 mục mỗi quy đổi chép sang. Mặt hàng nguồn đã gộp / ngưng dùng → CATALOG_MERGE_INVALID.
 */
export async function splitAliases(deps: CatalogDeps, ctx: Ctx, input: { aliasIds: string[]; newItem: SplitNewItem }): Promise<Result<CatalogItemDetail>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const ids = [...new Set(input.aliasIds)];
  if (!ids.length) return err(domainError("VALIDATION", "Chưa chọn mã hàng để tách"));
  const done = await asOrgAudited(deps, ctx, async (r): Promise<Result<{ detail: CatalogItemDetail; audit: AuditEntry[] }>> => {
    const aliases = [];
    for (const id of ids) {
      const a = await r.aliases.get(ctx.orgId, id);
      if (!a) return err(domainError("NOT_FOUND", "Không tìm thấy mã hàng"));
      aliases.push(a);
    }
    const fromId = aliases[0]!.itemId;
    if (aliases.some((a) => a.itemId !== fromId)) return err(domainError("VALIDATION", "Các mã tách phải cùng một mặt hàng"));
    const from = await r.items.get(ctx.orgId, fromId);
    if (!from) return err(itemNotFound());
    if (from.status !== "ACTIVE") return err(mergeInvalid(from.status === "MERGED" ? "FROM_MERGED" : "FROM_ARCHIVED"));
    const now = deps.clock.now();
    const n = input.newItem;
    const item: CatalogItemRow = {
      ...from,
      id: deps.idGen.next("cat"), itemNo: await freeItemNo(r, ctx), kind: n.kind, name: n.name, nameKey: itemNameKey(n.name),
      hsCode: n.hsCode !== undefined ? n.hsCode : from.hsCode, baseUnit: n.baseUnit !== undefined ? n.baseUnit : from.baseUnit, origin: n.origin ?? from.origin,
      description: n.description ?? null, note: n.note ?? null, timesDeclared: 0, lastDeclarationNo: null, lastDeclarationDate: null, lastTypeCode: null,
      status: "ACTIVE", mergedIntoId: null, source: "SPLIT", updatedBy: ctx.userId, createdAt: now, updatedAt: now,
    };
    await r.items.insert(item);
    const audit: AuditEntry[] = [{ itemId: item.id, key: "item", oldValue: from.itemNo, newValue: `${item.itemNo} ${item.name}` }];
    for (const a of aliases) {
      await r.aliases.update(ctx.orgId, a.id, { itemId: item.id, updatedAt: now });
      audit.push({ itemId: from.id, key: auditKeyAlias(a), oldValue: a.status, newValue: `→ ${item.itemNo}` }, { itemId: item.id, key: auditKeyAlias(a), oldValue: `${from.itemNo} →`, newValue: a.status });
    }
    // Quy đổi của ĐVT mà bí danh tách dùng: chép sang mặt hàng mới khi cùng ĐVT gốc (khác gốc thì hệ số sai nghĩa); mặt hàng cũ giữ nguyên.
    const sameBase = (from.baseUnit ?? "") !== "" && item.baseUnit !== null && itemUnitKey(from.baseUnit!) === itemUnitKey(item.baseUnit);
    const units = new Set(aliases.map((a) => a.unit).filter((u): u is string => !!u).map(itemUnitKey));
    for (const c of sameBase ? await r.conversions.listForItem(ctx.orgId, from.id) : []) {
      if (!units.has(itemUnitKey(c.unit))) continue;
      await r.conversions.upsert({ id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: item.id, unit: c.unit, factor: c.factor, createdAt: now, updatedAt: now });
      audit.push({ itemId: item.id, key: `conv:${c.unit}`, oldValue: "", newValue: c.factor });
    }
    return ok({ detail: (await loadItemDetail(r, ctx, item.id))!, audit });
  });
  if (!done.ok) return done;
  return ok(done.value.detail);
}
