// Bí danh (mã của từng bộ phận/đối tác): đề xuất, duyệt/từ chối, chuyển sang mặt hàng khác, ngưng dùng.
// Một mã trong một bộ chỉ trỏ một mặt hàng (unique ACTIVE) → CATALOG_CODE_TAKEN; một mặt hàng được nhiều mã trong cùng bộ (mã cũ/mới).
import { CatalogFactorSchema, itemCodeKey, type AliasSource, type ItemAlias, type ProposeAliasInput } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { ALIAS_ACTIVE_UQ, aliasNotFound, auditKeyAlias, codeTaken, factorRequired, asOrgAudited, isDuplicate, itemNotFound, needsFactor, setNotFound, toAliasDto, type AuditEntry } from "./common.js";
import { managesSet, requireContributor, requireSetManager } from "./permissions.js";
import { ensurePartnerSet } from "./partner-set.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, ItemAliasRow, MatchQueueRow } from "./ports.js";
import { resolveInTx } from "./resolve.js";
import { applySourceAttach } from "./source-rules.js";

type Tx<T> = Result<{ value: T; audit: AuditEntry[] }>;

/** Hệ số đến từ người dùng: chuỗi Decimal > 0 (kiểm cả trong use case, không chỉ ở biên). */
const badFactor = (factor: string | undefined) => factor !== undefined && !CatalogFactorSchema.safeParse(factor).success;
const factorInvalid = () => err(domainError("VALIDATION", "Hệ số phải là số lớn hơn 0"));

/** Chạy transaction (field_audit ghi trong cùng transaction); trùng unique (đua đồng thời) → CATALOG_CODE_TAKEN. */
async function run<T>(deps: CatalogDeps, ctx: Ctx, fn: (r: CatalogRepos) => Promise<Tx<T>>): Promise<Result<T>> {
  let done: Tx<T>;
  try {
    done = await asOrgAudited(deps, ctx, fn);
  } catch (e) {
    if (isDuplicate(e, ALIAS_ACTIVE_UQ)) return err(codeTaken(null));
    throw e;
  }
  if (!done.ok) return done;
  return ok(done.value.value);
}

/** Mặt hàng đích còn dùng được (theo chuỗi gộp tới mặt hàng cuối, phải ACTIVE). */
async function liveItem(r: CatalogRepos, ctx: Ctx, itemId: string): Promise<CatalogItemRow | null> {
  const it = await r.items.resolveMerged(ctx.orgId, itemId);
  return it && it.status === "ACTIVE" ? it : null;
}

/** Bảo đảm quy đổi cho ĐVT của bí danh: có `factor` → lưu quy đổi; thiếu và ĐVT ≠ gốc → CATALOG_UNIT_FACTOR_REQUIRED. */
async function ensureFactor(deps: CatalogDeps, r: CatalogRepos, ctx: Ctx, item: CatalogItemRow, unit: string | null, factor: string | undefined, audit: AuditEntry[]): Promise<Result<void>> {
  if (!unit || !item.baseUnit) return ok(undefined);
  const convs = await r.conversions.listForItem(ctx.orgId, item.id);
  if (!needsFactor(item, convs, unit)) return ok(undefined);
  if (!factor) return err(factorRequired(unit));
  const now = deps.clock.now();
  await r.conversions.upsert({ id: deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: item.id, unit, factor, createdAt: now, updatedAt: now });
  audit.push({ itemId: item.id, key: `conv:${unit}`, oldValue: "", newValue: factor });
  return ok(undefined);
}

export type ProposeAliasCommand = ProposeAliasInput & { source?: AliasSource };

/**
 * Gắn mã cho mặt hàng. Người phụ trách bộ mã / ADMIN / OWNER → ACTIVE ngay; vai trò khác (≠ VIEWER) → PROPOSED chờ duyệt.
 * Mã đã ACTIVE ở mặt hàng khác trong cùng bộ → CATALOG_CODE_TAKEN (kèm mặt hàng đang giữ). Đã có đúng bí danh → trả lại, không tạo trùng.
 */
export async function proposeAlias(deps: CatalogDeps, ctx: Ctx, input: ProposeAliasCommand): Promise<Result<ItemAlias>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  if (badFactor(input.factor)) return factorInvalid();
  const codeKey = itemCodeKey(input.code);
  if (!codeKey) return err(domainError("VALIDATION", "Mã hàng trống"));
  return run(deps, ctx, async (r): Promise<Tx<ItemAlias>> => {
    const set = await r.codeSets.get(ctx.orgId, input.codeSetId);
    if (!set) return err(setNotFound());
    const item = await liveItem(r, ctx, input.itemId);
    if (!item) return err(itemNotFound());
    const holder = await r.aliases.findActive(ctx.orgId, set.id, codeKey);
    if (holder && holder.itemId !== item.id) return err(codeTaken(await r.items.get(ctx.orgId, holder.itemId)));
    if (holder) return ok({ value: toAliasDto(holder), audit: [] });
    const status = (await managesSet(r, ctx, set.id)) ? "ACTIVE" : "PROPOSED";
    if (status === "PROPOSED") {
      const same = (await r.aliases.listForItem(ctx.orgId, item.id)).find((a) => a.codeSetId === set.id && a.codeKey === codeKey && a.status === "PROPOSED");
      if (same) return ok({ value: toAliasDto(same), audit: [] });
    }
    const audit: AuditEntry[] = [];
    const unit = input.unit ?? null;
    if (status === "ACTIVE") {
      const f = await ensureFactor(deps, r, ctx, item, unit, input.factor, audit);
      if (!f.ok) return f;
    }
    const now = deps.clock.now();
    const row: ItemAliasRow = {
      id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: set.id, code: input.code, codeKey, name: input.name ?? null, unit, itemId: item.id, status,
      proposedBy: ctx.userId, decidedBy: status === "ACTIVE" ? ctx.userId : null, decidedAt: status === "ACTIVE" ? now : null, source: input.source ?? "MANUAL", createdAt: now, updatedAt: now,
    };
    await r.aliases.insert(row);
    audit.unshift({ itemId: item.id, key: auditKeyAlias(row), oldValue: "", newValue: status });
    // Mã ACTIVE ở bộ nguồn gốc: ĐVT của mã thành ĐVT gốc (đổi gốc theo hệ số vừa bảo đảm) – spec 2026-11-14 §1.
    if (status === "ACTIVE") await applySourceAttach(deps, r, ctx, set, item, unit, null, audit);
    return ok({ value: toAliasDto(row), audit });
  });
}

/**
 * Duyệt / từ chối bí danh PROPOSED (người phụ trách bộ mã hoặc ADMIN/OWNER; người khác → CATALOG_NOT_CODE_SET_OWNER).
 * Duyệt: mã đã ACTIVE ở mặt hàng khác → CATALOG_CODE_TAKEN; ĐVT khác gốc chưa có quy đổi → cần `factor`.
 */
export async function decideAlias(deps: CatalogDeps, ctx: Ctx, id: string, decision: "APPROVE" | "REJECT", factor?: string): Promise<Result<ItemAlias>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  if (badFactor(factor)) return factorInvalid();
  return run(deps, ctx, async (r): Promise<Tx<ItemAlias>> => {
    const a = await r.aliases.get(ctx.orgId, id);
    if (!a) return err(aliasNotFound());
    const can = await requireSetManager(r, ctx, a.codeSetId);
    if (!can.ok) return can;
    if (a.status !== "PROPOSED") return err(domainError("INVALID_STATE", "Mã hàng này đã được xử lý"));
    const now = deps.clock.now();
    const audit: AuditEntry[] = [];
    let itemId = a.itemId;
    let status: ItemAliasRow["status"] = "REJECTED";
    if (decision === "APPROVE") {
      const item = await liveItem(r, ctx, a.itemId);
      if (!item) return err(itemNotFound());
      itemId = item.id;
      const holder = await r.aliases.findActive(ctx.orgId, a.codeSetId, a.codeKey);
      if (holder && holder.itemId !== item.id) return err(codeTaken(await r.items.get(ctx.orgId, holder.itemId)));
      if (holder) {
        // Đã có đúng mã này ACTIVE ở mặt hàng → đề xuất thừa, đóng lại.
        await r.aliases.update(ctx.orgId, a.id, { status: "REJECTED", decidedBy: ctx.userId, decidedAt: now, updatedAt: now });
        audit.push({ itemId: a.itemId, key: auditKeyAlias(a), oldValue: "PROPOSED", newValue: "REJECTED" });
        return ok({ value: toAliasDto(holder), audit });
      }
      const f = await ensureFactor(deps, r, ctx, item, a.unit, factor, audit);
      if (!f.ok) return f;
      status = "ACTIVE";
      const set = await r.codeSets.get(ctx.orgId, a.codeSetId);
      if (set) await applySourceAttach(deps, r, ctx, set, item, a.unit, null, audit);
    }
    await r.aliases.update(ctx.orgId, a.id, { status, itemId, decidedBy: ctx.userId, decidedAt: now, updatedAt: now });
    audit.unshift({ itemId, key: auditKeyAlias(a), oldValue: "PROPOSED", newValue: status });
    return ok({ value: toAliasDto({ ...a, status, itemId, decidedBy: ctx.userId, decidedAt: now, updatedAt: now }), audit });
  });
}

/** Chuyển bí danh sang mặt hàng khác (người phụ trách bộ mã / ADMIN / OWNER). Hai mục lịch sử: mặt hàng cũ và mới. */
export async function moveAlias(deps: CatalogDeps, ctx: Ctx, id: string, toItemId: string, factor?: string): Promise<Result<ItemAlias>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  if (badFactor(factor)) return factorInvalid();
  return run(deps, ctx, async (r): Promise<Tx<ItemAlias>> => {
    const a = await r.aliases.get(ctx.orgId, id);
    if (!a) return err(aliasNotFound());
    const can = await requireSetManager(r, ctx, a.codeSetId);
    if (!can.ok) return can;
    const to = await liveItem(r, ctx, toItemId);
    if (!to) return err(itemNotFound());
    if (to.id === a.itemId) return ok({ value: toAliasDto(a), audit: [] });
    const from = await r.items.get(ctx.orgId, a.itemId);
    const audit: AuditEntry[] = [];
    if (a.status === "ACTIVE") {
      const f = await ensureFactor(deps, r, ctx, to, a.unit, factor, audit);
      if (!f.ok) return f;
      const set = await r.codeSets.get(ctx.orgId, a.codeSetId);
      if (set) await applySourceAttach(deps, r, ctx, set, to, a.unit, null, audit);
    }
    const now = deps.clock.now();
    await r.aliases.update(ctx.orgId, a.id, { itemId: to.id, updatedAt: now });
    audit.unshift(
      { itemId: a.itemId, key: auditKeyAlias(a), oldValue: a.status, newValue: `→ ${to.itemNo}` },
      { itemId: to.id, key: auditKeyAlias(a), oldValue: from ? `${from.itemNo} →` : "", newValue: a.status },
    );
    return ok({ value: toAliasDto({ ...a, itemId: to.id, updatedAt: now }), audit });
  });
}

/** Ngưng dùng bí danh (→ REJECTED; người phụ trách bộ mã / ADMIN / OWNER). Mã được giải phóng cho mặt hàng khác. */
export async function deactivateAlias(deps: CatalogDeps, ctx: Ctx, id: string): Promise<Result<ItemAlias>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  return run(deps, ctx, async (r): Promise<Tx<ItemAlias>> => {
    const a = await r.aliases.get(ctx.orgId, id);
    if (!a) return err(aliasNotFound());
    const can = await requireSetManager(r, ctx, a.codeSetId);
    if (!can.ok) return can;
    if (a.status === "REJECTED") return ok({ value: toAliasDto(a), audit: [] });
    const now = deps.clock.now();
    await r.aliases.update(ctx.orgId, a.id, { status: "REJECTED", decidedBy: ctx.userId, decidedAt: now, updatedAt: now });
    return ok({ value: toAliasDto({ ...a, status: "REJECTED", decidedBy: ctx.userId, decidedAt: now, updatedAt: now }), audit: [{ itemId: a.itemId, key: auditKeyAlias(a), oldValue: a.status, newValue: "REJECTED" }] });
  });
}

export type LessonAliasInput = { partnerName: string | null; code: string; name: string | null; hsCode: string | null };
export type LessonAliasResult = { status: "PROPOSED" | "EXISTS" | "QUEUED" | "SKIPPED"; itemId: string | null };

/**
 * Bài học mặt hàng (ADR 0009, LINE) vừa được duyệt → đề xuất bí danh (source LESSON) trong bộ nhà cung cấp (tự tạo bộ khi chưa có).
 * Luôn PROPOSED: người duyệt bài học xác nhận mã HS/mô tả, không phải ghép mã – người phụ trách bộ mã duyệt sau.
 * Mã đã ACTIVE trong bộ → EXISTS; không khớp chắc mặt hàng nào → mục hàng chờ ghép (QUEUED); không có tên nhà cung cấp → SKIPPED.
 */
export async function proposeLessonAlias(deps: CatalogDeps, ctx: Ctx, input: LessonAliasInput): Promise<Result<LessonAliasResult>> {
  const allowed = requireContributor(ctx);
  if (!allowed.ok) return allowed;
  const codeKey = itemCodeKey(input.code);
  if (!codeKey) return err(domainError("VALIDATION", "Mã hàng trống"));
  // Bộ nhà cung cấp trong transaction ngắn riêng (đua tạo → đọc lại), trước transaction đề xuất.
  const setId = input.partnerName ? await ensurePartnerSet(deps, ctx.orgId, "SUPPLIER", input.partnerName) : null;
  if (!setId) return ok({ status: "SKIPPED", itemId: null });
  return run(deps, ctx, async (r): Promise<Tx<LessonAliasResult>> => {
    const res = await resolveInTx(r, ctx.orgId, { codeSetId: setId, code: input.code, name: input.name, hsCode: input.hsCode });
    if (res.level === "SURE" && res.aliasId && res.itemId) return ok({ value: { status: "EXISTS", itemId: res.itemId }, audit: [] });
    const now = deps.clock.now();
    if (res.level !== "SURE" || !res.itemId) {
      const pending = await r.queue.list(ctx.orgId, { status: "PENDING", codeSetId: setId });
      if (!pending.some((q) => itemCodeKey(q.code) === codeKey)) {
        const q: MatchQueueRow = {
          id: deps.idGen.next("cmq"), orgId: ctx.orgId, importId: null, codeSetId: setId, code: input.code, name: input.name ?? input.code, unit: null, hsCode: input.hsCode,
          level: res.level, suggestedItemId: res.candidates[0]?.itemId ?? null, candidates: res.candidates, reason: res.reason, status: "PENDING",
          decidedBy: null, decidedAt: null, sourceRef: "lesson", createdAt: now, updatedAt: now,
        };
        await r.queue.insert(q);
      }
      return ok({ value: { status: "QUEUED", itemId: null }, audit: [] });
    }
    const same = (await r.aliases.listForItem(ctx.orgId, res.itemId)).find((a) => a.codeSetId === setId && a.codeKey === codeKey && a.status === "PROPOSED");
    if (same) return ok({ value: { status: "PROPOSED", itemId: res.itemId }, audit: [] });
    const row: ItemAliasRow = {
      id: deps.idGen.next("ali"), orgId: ctx.orgId, codeSetId: setId, code: input.code, codeKey, name: input.name, unit: null, itemId: res.itemId, status: "PROPOSED",
      proposedBy: ctx.userId, decidedBy: null, decidedAt: null, source: "LESSON", createdAt: now, updatedAt: now,
    };
    await r.aliases.insert(row);
    return ok({ value: { status: "PROPOSED", itemId: res.itemId }, audit: [{ itemId: res.itemId, key: auditKeyAlias(row), oldValue: "", newValue: "PROPOSED" }] });
  });
}
