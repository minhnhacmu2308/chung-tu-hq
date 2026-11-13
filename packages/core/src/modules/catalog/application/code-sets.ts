// Bộ mã + người phụ trách + mã hiển thị chính; thiết lập lần đầu (chọn chế độ) và đổi chế độ SHARED ↔ PER_DEPARTMENT (spec §3, §4).
import { itemNameKey, type CatalogMode, type ChangeCatalogModeInput, type CodeSet, type CodeSetKind, type SetupCatalogInput, type UpsertCodeSetInput } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { DEFAULT_SET_NAME, DEPARTMENT_KINDS, effectiveMode, isDuplicate, isInternal, isPartnerKind, modeConflict, setNotFound, toCodeSetDto } from "./common.js";
import { PARTNER_SET_UQ } from "./partner-set.js";
import { requireCatalogAdmin } from "./permissions.js";
import type { CatalogDeps, CatalogRepos, CodeSetRow } from "./ports.js";

export type CatalogSettingsView = { mode: CatalogMode | null; effectiveMode: CatalogMode; itemNoPrefix: string; setupAt: string | null };

export async function getCatalogSettings(deps: CatalogDeps, ctx: Ctx): Promise<Result<CatalogSettingsView>> {
  const s = await deps.uow.asOrg(ctx, (r) => r.settings.get(ctx.orgId));
  return ok({ mode: s?.mode ?? null, effectiveMode: effectiveMode(s), itemNoPrefix: s?.itemNoPrefix ?? "MH-", setupAt: s?.setupAt?.toISOString() ?? null });
}

async function setDto(r: CatalogRepos, ctx: Pick<Ctx, "orgId">, s: CodeSetRow): Promise<CodeSet> {
  const owners = await r.owners.list(ctx.orgId, s.id);
  const count = (await r.aliases.listForCodeSet(ctx.orgId, s.id, { status: "ACTIVE" })).length;
  return toCodeSetDto(s, owners, count);
}

/** Danh sách bộ mã (mọi vai trò được xem). */
export async function listCodeSets(deps: CatalogDeps, ctx: Ctx): Promise<Result<CodeSet[]>> {
  return ok(await deps.uow.asOrg(ctx, async (r) => Promise.all((await r.codeSets.list(ctx.orgId)).map((s) => setDto(r, ctx, s)))));
}

/** Người phụ trách phải là thành viên đang hoạt động, vai trò ≠ VIEWER. Gọi port identity TRƯỚC transaction. */
async function checkOwners(deps: CatalogDeps, ctx: Ctx, ids: string[]): Promise<Result<void>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return ok(undefined);
  const okIds = await deps.members.eligibleOwners(ctx.orgId, uniq);
  const bad = uniq.filter((u) => !okIds.has(u));
  return bad.length ? err(domainError("VALIDATION", "Người phụ trách phải là thành viên đang hoạt động, vai trò khác Người xem", { userIds: bad })) : ok(undefined);
}

/** Kind được phép theo chế độ: SHARED cấm ACCOUNTING/WAREHOUSE/CUSTOMS; PER_DEPARTMENT cấm SHARED. */
const kindAllowed = (mode: CatalogMode, kind: CodeSetKind) => (mode === "SHARED" ? !DEPARTMENT_KINDS.includes(kind as (typeof DEPARTMENT_KINDS)[number]) : kind !== "SHARED");

/** Bỏ cờ mã hiển thị chính / mặc định ở các bộ khác trước khi đặt (unique một phần theo org). */
async function clearFlag(r: CatalogRepos, ctx: Ctx, flag: "isPrimaryDisplay" | "isDefault", except: string | null, now: Date) {
  for (const s of await r.codeSets.list(ctx.orgId)) if (s[flag] && s.id !== except) await r.codeSets.update(ctx.orgId, s.id, { [flag]: false, updatedAt: now });
}

export const newSet = (deps: CatalogDeps, ctx: Ctx, kind: CodeSetKind, name: string, now: Date, extra: Partial<CodeSetRow> = {}): CodeSetRow => {
  const partnerName = isPartnerKind(kind) ? (extra.partnerName ?? null) : null;
  return { id: deps.idGen.next("cst"), orgId: ctx.orgId, kind, name, partnerName, partnerKey: partnerName ? itemNameKey(partnerName) : null, isPrimaryDisplay: false, isDefault: false, createdAt: now, updatedAt: now, ...extra };
};

export type UpsertCodeSetCommand = UpsertCodeSetInput & { id?: string };

/** Tạo/sửa bộ mã (ADMIN/OWNER). Chế độ SHARED chỉ cho tạo SUPPLIER/CUSTOMER (một bộ SHARED duy nhất) → CATALOG_MODE_CONFLICT. */
export async function upsertCodeSet(deps: CatalogDeps, ctx: Ctx, input: UpsertCodeSetCommand): Promise<Result<CodeSet>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  if (input.ownerIds) {
    const o = await checkOwners(deps, ctx, input.ownerIds);
    if (!o.ok) return o;
  }
  const now = deps.clock.now();
  let done: Result<CodeSet>;
  try {
    done = await upsertCodeSetTx(deps, ctx, input, now);
  } catch (e) {
    // Đối tác đã có bộ cùng loại (unique org + loại + partner_key) – kể cả khi hai người tạo cùng lúc.
    if (isDuplicate(e, PARTNER_SET_UQ)) return err(reasonError("DUPLICATE", "CATALOG_PARTNER_SET_EXISTS"));
    throw e;
  }
  if (done.ok) await deps.orgAudit?.record(ctx, { action: input.id ? "CATALOG_CODE_SET_UPDATED" : "CATALOG_CODE_SET_CREATED", targetType: "code_set", targetId: done.value.id, targetLabel: done.value.name, detail: { kind: done.value.kind } });
  return done;
}

function upsertCodeSetTx(deps: CatalogDeps, ctx: Ctx, input: UpsertCodeSetCommand, now: Date): Promise<Result<CodeSet>> {
  return deps.uow.asOrg(ctx, async (r): Promise<Result<CodeSet>> => {
    const mode = effectiveMode(await r.settings.get(ctx.orgId));
    const sets = await r.codeSets.list(ctx.orgId);
    const cur = input.id ? sets.find((s) => s.id === input.id) : null;
    if (input.id && !cur) return err(setNotFound());
    if (cur && cur.kind !== input.kind) return err(modeConflict({ reason: "KIND_IMMUTABLE" }));
    if (!cur) {
      if (!kindAllowed(mode, input.kind)) return err(modeConflict({ mode, kind: input.kind }));
      if (input.kind === "SHARED" && sets.some((s) => s.kind === "SHARED")) return err(modeConflict({ mode, kind: input.kind }));
    }
    if (input.isDefault && input.kind !== "CUSTOMS" && input.kind !== "SHARED") return err(domainError("VALIDATION", "Chỉ bộ XNK / Mã chung được làm bộ mặc định cho Hải quan"));
    const partnerName = isPartnerKind(input.kind) ? (input.partnerName ?? null) : null;
    const partnerKey = partnerName ? itemNameKey(partnerName) : null;
    if (partnerKey && sets.some((s) => s.id !== cur?.id && s.kind === input.kind && s.partnerKey === partnerKey)) return err(reasonError("DUPLICATE", "CATALOG_PARTNER_SET_EXISTS"));
    let row: CodeSetRow;
    if (cur) {
      row = { ...cur, name: input.name, partnerName, partnerKey: partnerName ? itemNameKey(partnerName) : null, updatedAt: now };
      await r.codeSets.update(ctx.orgId, cur.id, { name: row.name, partnerName: row.partnerName, partnerKey: row.partnerKey, updatedAt: now });
    } else {
      row = newSet(deps, ctx, input.kind, input.name, now, { partnerName });
      // Bộ XNK đầu tiên (hoặc Mã chung) thành bộ mặc định cho Hải quan khi org chưa có.
      if ((input.kind === "CUSTOMS" || input.kind === "SHARED") && !sets.some((s) => s.isDefault)) row.isDefault = true;
      await r.codeSets.insert(row);
    }
    if (input.isDefault && !row.isDefault) {
      await clearFlag(r, ctx, "isDefault", row.id, now);
      await r.codeSets.update(ctx.orgId, row.id, { isDefault: true, updatedAt: now });
    }
    if (input.isPrimaryDisplay !== undefined) {
      if (input.isPrimaryDisplay) await clearFlag(r, ctx, "isPrimaryDisplay", row.id, now);
      await r.codeSets.update(ctx.orgId, row.id, { isPrimaryDisplay: input.isPrimaryDisplay, updatedAt: now });
    }
    if (input.ownerIds) await r.owners.replace(ctx.orgId, row.id, input.ownerIds);
    return ok(await setDto(r, ctx, (await r.codeSets.get(ctx.orgId, row.id))!));
  });
}

/** Thay danh sách người phụ trách bộ mã (ADMIN/OWNER). */
export async function setOwners(deps: CatalogDeps, ctx: Ctx, codeSetId: string, userIds: string[]): Promise<Result<CodeSet>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const o = await checkOwners(deps, ctx, userIds);
  if (!o.ok) return o;
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<CodeSet>> => {
    const s = await r.codeSets.get(ctx.orgId, codeSetId);
    if (!s) return err(setNotFound());
    await r.owners.replace(ctx.orgId, codeSetId, userIds);
    return ok(await setDto(r, ctx, s));
  });
  if (done.ok) await deps.orgAudit?.record(ctx, { action: "CATALOG_CODE_SET_OWNERS", targetType: "code_set", targetId: codeSetId, targetLabel: done.value.name, detail: { owners: done.value.ownerIds.length } });
  return done;
}

/** Đặt bộ mã hiển thị chính (null = hiển thị mã nối). */
export async function setPrimaryDisplay(deps: CatalogDeps, ctx: Ctx, codeSetId: string | null): Promise<Result<CodeSet[]>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  return deps.uow.asOrg(ctx, async (r): Promise<Result<CodeSet[]>> => {
    if (codeSetId && !(await r.codeSets.get(ctx.orgId, codeSetId))) return err(setNotFound());
    await clearFlag(r, ctx, "isPrimaryDisplay", codeSetId, now);
    if (codeSetId) await r.codeSets.update(ctx.orgId, codeSetId, { isPrimaryDisplay: true, updatedAt: now });
    return ok(await Promise.all((await r.codeSets.list(ctx.orgId)).map((s) => setDto(r, ctx, s))));
  });
}

/**
 * Thiết lập lần đầu (ADMIN/OWNER), idempotent: chạy lại cùng chế độ chỉ cập nhật tên/người phụ trách, không nhân đôi bộ mã.
 * SHARED: đổi bộ XNK mặc định (từ migration) thành SHARED "Mã chung" – giữ bí danh – hoặc tạo mới; mặc định là mã hiển thị chính.
 * PER_DEPARTMENT: bảo đảm có Kế toán, Kho, XNK (XNK mặc định, dùng lại bộ XNK từ migration).
 * Đã thiết lập với chế độ khác → CATALOG_MODE_CONFLICT (dùng changeMode).
 */
export async function setupCatalog(deps: CatalogDeps, ctx: Ctx, input: SetupCatalogInput): Promise<Result<CodeSet[]>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const o = await checkOwners(deps, ctx, input.sets.flatMap((s) => s.ownerIds));
  if (!o.ok) return o;
  const now = deps.clock.now();
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<CodeSet[]>> => {
    const settings = await r.settings.get(ctx.orgId);
    if (settings?.setupAt && settings.mode && settings.mode !== input.mode) return err(modeConflict({ mode: settings.mode }));
    if (input.sets.some((s) => !kindAllowed(input.mode, s.kind))) return err(modeConflict({ mode: input.mode }));
    let sets = await r.codeSets.list(ctx.orgId);
    const wanted = (k: CodeSetKind) => input.sets.find((s) => s.kind === k);
    const touched = new Map<string, string[]>(); // set id → ownerIds từ input

    const ensure = async (kind: CodeSetKind, existing: CodeSetRow | undefined, isDefault: boolean) => {
      const w = wanted(kind);
      const name = w?.name ?? existing?.name ?? DEFAULT_SET_NAME[kind];
      let id: string;
      if (existing) {
        id = existing.id;
        if (existing.kind !== kind || existing.name !== name) await r.codeSets.update(ctx.orgId, id, { kind, name, updatedAt: now });
      } else {
        const row = newSet(deps, ctx, kind, name, now);
        await r.codeSets.insert(row);
        id = row.id;
      }
      if (isDefault) {
        await clearFlag(r, ctx, "isDefault", id, now);
        await r.codeSets.update(ctx.orgId, id, { isDefault: true, updatedAt: now });
      }
      if (w) touched.set(id, w.ownerIds);
      return id;
    };

    if (input.mode === "SHARED") {
      const shared = sets.find((s) => s.kind === "SHARED");
      const migrated = sets.find((s) => s.kind === "CUSTOMS" && s.isDefault);
      const source = shared ?? migrated;
      // Bộ nội bộ khác (ngoài bộ sẽ thành "Mã chung") → không gộp ngầm; phải xử lý ở tab Bộ mã.
      if (sets.some((s) => isInternal(s.kind) && s.id !== source?.id)) return err(modeConflict({ mode: input.mode, reason: "OTHER_INTERNAL_SETS" }));
      await ensure("SHARED", source, true);
    } else {
      if (sets.some((s) => s.kind === "SHARED")) return err(modeConflict({ mode: input.mode, reason: "SHARED_SET_EXISTS" }));
      await ensure("ACCOUNTING", sets.find((s) => s.kind === "ACCOUNTING"), false);
      await ensure("WAREHOUSE", sets.find((s) => s.kind === "WAREHOUSE"), false);
      const customs = sets.find((s) => s.kind === "CUSTOMS" && s.isDefault) ?? sets.find((s) => s.kind === "CUSTOMS");
      await ensure("CUSTOMS", customs, true);
    }
    for (const p of input.sets.filter((s) => isPartnerKind(s.kind))) {
      sets = await r.codeSets.list(ctx.orgId);
      // Bộ đối tác theo (loại, partner_key) – trùng bộ ensurePartnerSet đã tự tạo khi đọc chứng từ, hoặc lần thiết lập trước → dùng lại
      // (unique code_sets_org_kind_partner_uq); dữ liệu cũ không có partner_key → so theo tên.
      const key = itemNameKey(p.name);
      let id = (sets.find((s) => s.kind === p.kind && !!key && s.partnerKey === key) ?? sets.find((s) => s.kind === p.kind && !s.partnerKey && s.name === p.name))?.id;
      if (!id) {
        const row = newSet(deps, ctx, p.kind, p.name, now, { partnerName: p.name });
        await r.codeSets.insert(row);
        id = row.id;
      }
      touched.set(id, p.ownerIds);
    }
    for (const [id, owners] of touched) await r.owners.replace(ctx.orgId, id, owners);

    sets = await r.codeSets.list(ctx.orgId);
    const primaryKind = input.primaryDisplayKind !== undefined ? input.primaryDisplayKind : input.mode === "SHARED" && !sets.some((s) => s.isPrimaryDisplay) ? "SHARED" : undefined;
    if (primaryKind !== undefined) {
      const target = primaryKind ? sets.find((s) => s.kind === primaryKind) : null;
      await clearFlag(r, ctx, "isPrimaryDisplay", target?.id ?? null, now);
      if (target && !target.isPrimaryDisplay) await r.codeSets.update(ctx.orgId, target.id, { isPrimaryDisplay: true, updatedAt: now });
    }
    // Tiền tố chỉ đổi khi người dùng nhập; chạy lại thiết lập không đưa về "MH-".
    await r.settings.upsert(ctx.orgId, { mode: input.mode, ...(input.prefix ? { itemNoPrefix: input.prefix } : {}), setupAt: settings?.setupAt ?? now }, now);
    return ok(await Promise.all((await r.codeSets.list(ctx.orgId)).map((s) => setDto(r, ctx, s))));
  });
  if (done.ok) await deps.orgAudit?.record(ctx, { action: "CATALOG_SETUP", targetType: "catalog", targetId: ctx.orgId, targetLabel: input.mode, detail: { sets: done.value.length } });
  return done;
}

/**
 * Đổi chế độ (ADMIN/OWNER). Bí danh không đổi (chỉ đổi loại/tên bộ mã chứa chúng).
 * → PER_DEPARTMENT: bộ "Mã chung" thành `sharedBecomes`; không thành XNK → `customsSetId` (bộ CUSTOMS có sẵn) hoặc tạo bộ XNK mặc định.
 * → SHARED: chỉ khi org còn đúng một bộ nội bộ (không thì CATALOG_MODE_CONFLICT); bộ đó thành "Mã chung" mặc định + hiển thị chính.
 * Đã ở chế độ đích → không đổi gì.
 */
export async function changeMode(deps: CatalogDeps, ctx: Ctx, input: ChangeCatalogModeInput): Promise<Result<CodeSet[]>> {
  const allowed = requireCatalogAdmin(ctx);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ sets: CodeSet[]; changed: boolean }>> => {
    const settings = await r.settings.get(ctx.orgId);
    const mode = effectiveMode(settings);
    const list = async () => Promise.all((await r.codeSets.list(ctx.orgId)).map((s) => setDto(r, ctx, s)));
    if (mode === input.to) return ok({ sets: await list(), changed: false });
    const sets = await r.codeSets.list(ctx.orgId);
    const internal = sets.filter((s) => isInternal(s.kind));
    let e: DomainError | null = null;
    if (input.to === "SHARED") {
      if (internal.length !== 1) return err(modeConflict({ reason: "MULTIPLE_INTERNAL_SETS", count: internal.length }));
      const only = internal[0]!;
      await clearFlag(r, ctx, "isDefault", only.id, now);
      await clearFlag(r, ctx, "isPrimaryDisplay", only.id, now);
      await r.codeSets.update(ctx.orgId, only.id, { kind: "SHARED", name: DEFAULT_SET_NAME.SHARED, isDefault: true, isPrimaryDisplay: true, updatedAt: now });
    } else {
      const shared = sets.find((s) => s.kind === "SHARED");
      if (!shared) return err(modeConflict({ reason: "NO_SHARED_SET" }));
      const becomes = input.sharedBecomes;
      if (becomes === "CUSTOMS") {
        await r.codeSets.update(ctx.orgId, shared.id, { kind: "CUSTOMS", name: DEFAULT_SET_NAME.CUSTOMS, updatedAt: now });
      } else {
        const chosen = input.customsSetId ? sets.find((s) => s.id === input.customsSetId) : undefined;
        if (input.customsSetId && (!chosen || chosen.kind !== "CUSTOMS")) e = setNotFound();
        else {
          await r.codeSets.update(ctx.orgId, shared.id, { kind: becomes, name: DEFAULT_SET_NAME[becomes], isDefault: false, updatedAt: now });
          if (chosen) await r.codeSets.update(ctx.orgId, chosen.id, { isDefault: true, updatedAt: now });
          else await r.codeSets.insert(newSet(deps, ctx, "CUSTOMS", DEFAULT_SET_NAME.CUSTOMS, now, { isDefault: true }));
        }
      }
    }
    if (e) return err(e);
    await r.settings.upsert(ctx.orgId, { mode: input.to, setupAt: settings?.setupAt ?? now }, now);
    return ok({ sets: await list(), changed: true });
  });
  if (!done.ok) return done;
  if (done.value.changed) await deps.orgAudit?.record(ctx, { action: "CATALOG_MODE_CHANGED", targetType: "catalog", targetId: ctx.orgId, targetLabel: input.to, detail: { to: input.to } });
  return ok(done.value.sets);
}
