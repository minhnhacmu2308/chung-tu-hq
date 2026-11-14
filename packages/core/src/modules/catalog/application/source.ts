// Đổi bộ nguồn gốc (spec 2026-11-14 §3): xem trước + thực hiện. Quản trị/Chủ hoặc người phụ trách bộ đích. Chỉ bộ nội bộ (SHARED/ACCOUNTING/
// WAREHOUSE/CUSTOMS) được làm nguồn gốc → CATALOG_SOURCE_SET_INVALID. Thực hiện: một transaction chuyển cờ is_source (bỏ cờ bộ cũ rồi đặt bộ mới –
// unique một phần theo org), rồi đổi gốc từng mặt hàng theo lô ≤ 200 mặt hàng / transaction (field_audit cùng transaction). Mặt hàng thiếu hệ số
// giữ nguyên, trả về để bổ sung rồi gọi lại (idempotent: mặt hàng đã đổi gốc là SAME). Tên/HS/thuế không tự chép từ bộ mới.
import { itemUnitKey, type ChangeSourceInput, type SourceChangeBlockedItem, type SourceChangePreview, type SourceChangeResult } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { planRebase } from "../domain/rebase.js";
import { asOrgAudited, isInternal, newestAlias, setNotFound, sourceSetInvalid, sourceSetOf, toCodeSetDto, type AuditEntry } from "./common.js";
import { requireSetManager } from "./permissions.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, CodeSetRow, ItemAliasRow } from "./ports.js";
import { endOfChain } from "./resolve.js";
import { rebaseItemTo } from "./source-rules.js";

/** Số mặt hàng đổi gốc mỗi transaction. */
export const SOURCE_REBASE_CHUNK = 200;

type ItemPlan = { item: CatalogItemRow; alias: ItemAliasRow; outcome: "REBASE" | "UNCHANGED" | "BLOCKED" };
type SourcePlan = { set: CodeSetRow; current: CodeSetRow | null; totalItems: number; plans: ItemPlan[]; missingCount: number };

/** Phân loại mặt hàng ACTIVE theo mã (mới nhất) của chúng ở bộ `set` – chỉ đọc. */
async function planSource(r: CatalogRepos, ctx: Pick<Ctx, "orgId">, set: CodeSetRow): Promise<SourcePlan> {
  const sets = await r.codeSets.list(ctx.orgId);
  const all = new Map((await r.items.list(ctx.orgId)).map((i) => [i.id, i]));
  const active = [...all.values()].filter((i) => i.status === "ACTIVE");
  const byItem = new Map<string, ItemAliasRow[]>();
  for (const a of await r.aliases.listForCodeSet(ctx.orgId, set.id, { status: "ACTIVE" })) {
    const end = endOfChain(all, a.itemId);
    if (!end || end.status !== "ACTIVE") continue;
    byItem.set(end.id, [...(byItem.get(end.id) ?? []), a]);
  }
  const ids = [...byItem.keys()];
  const convs = await r.conversions.listForItems(ctx.orgId, ids);
  const plans: ItemPlan[] = [];
  for (const id of ids) {
    const item = all.get(id)!;
    const alias = newestAlias(byItem.get(id)!)!;
    let outcome: ItemPlan["outcome"] = "UNCHANGED";
    if (alias.unit) {
      const p = planRebase({ baseUnit: item.baseUnit, newBase: alias.unit, conversions: convs.filter((c) => c.itemId === id) });
      outcome = p.kind === "NO_FACTOR" ? "BLOCKED" : p.kind === "SAME" ? "UNCHANGED" : "REBASE";
    }
    plans.push({ item, alias, outcome });
  }
  plans.sort((a, b) => a.item.itemNo.localeCompare(b.item.itemNo));
  return { set, current: sourceSetOf(sets), totalItems: active.length, plans, missingCount: active.length - ids.length };
}

const blockedOf = (plans: ItemPlan[]): SourceChangeBlockedItem[] =>
  plans.filter((p) => p.outcome === "BLOCKED").map((p) => ({ itemId: p.item.id, itemNo: p.item.itemNo, name: p.item.name, code: p.alias.code, baseUnit: p.item.baseUnit, newUnit: p.alias.unit }));

/** Bộ đích hợp lệ + quyền (kiểm trước mọi lần ghi). */
async function targetSet(r: CatalogRepos, ctx: Ctx, codeSetId: string): Promise<Result<CodeSetRow>> {
  const set = await r.codeSets.get(ctx.orgId, codeSetId);
  if (!set) return err(setNotFound());
  const can = await requireSetManager(r, ctx, set.id);
  if (!can.ok) return can;
  if (!isInternal(set.kind)) return err(sourceSetInvalid());
  return ok(set);
}

/** Xem trước đổi bộ nguồn gốc sang `codeSetId` (không ghi gì). */
export async function previewSourceChange(deps: CatalogDeps, ctx: Ctx, codeSetId: string): Promise<Result<SourceChangePreview>> {
  return deps.uow.asOrg(ctx, async (r): Promise<Result<SourceChangePreview>> => {
    const t = await targetSet(r, ctx, codeSetId);
    if (!t.ok) return t;
    const p = await planSource(r, ctx, t.value);
    return ok({
      codeSetId: t.value.id, currentSourceId: p.current?.id ?? null, totalItems: p.totalItems,
      rebaseCount: p.plans.filter((x) => x.outcome === "REBASE").length, unchangedCount: p.plans.filter((x) => x.outcome === "UNCHANGED").length,
      missingCount: p.missingCount, blocked: blockedOf(p.plans),
    });
  });
}

/** Đặt bộ nguồn gốc + đổi gốc các mặt hàng đổi được. Gọi lại sau khi bổ sung hệ số = "Áp dụng lại". */
export async function changeSourceSet(deps: CatalogDeps, ctx: Ctx, input: ChangeSourceInput): Promise<Result<SourceChangeResult>> {
  const head = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ set: CodeSetRow; changed: boolean; todo: { itemId: string; unit: string }[] }>> => {
    const t = await targetSet(r, ctx, input.codeSetId);
    if (!t.ok) return t;
    const set = t.value;
    const now = deps.clock.now();
    const sets = await r.codeSets.list(ctx.orgId);
    let changed = false;
    if (!set.isSource) {
      for (const s of sets) if (s.isSource) await r.codeSets.update(ctx.orgId, s.id, { isSource: false, updatedAt: now });
      await r.codeSets.update(ctx.orgId, set.id, { isSource: true, updatedAt: now });
      changed = true;
    }
    const p = await planSource(r, ctx, { ...set, isSource: true });
    return ok({ set, changed, todo: p.plans.filter((x) => x.outcome === "REBASE").map((x) => ({ itemId: x.item.id, unit: x.alias.unit! })) });
  });
  if (!head.ok) return head;

  let rebased = 0;
  const { todo } = head.value;
  for (let i = 0; i < todo.length; i += SOURCE_REBASE_CHUNK) {
    const chunk = todo.slice(i, i + SOURCE_REBASE_CHUNK);
    const step = await asOrgAudited(deps, ctx, async (r): Promise<Result<{ n: number; audit: AuditEntry[] }>> => {
      const audit: AuditEntry[] = [];
      let n = 0;
      const items = new Map((await r.items.getMany(ctx.orgId, chunk.map((c) => c.itemId))).map((it) => [it.id, it]));
      for (const c of chunk) {
        const item = items.get(c.itemId);
        // Đọc lại trong transaction: mặt hàng đã gộp/ngưng hoặc lần chạy song song đã đổi gốc → bỏ qua (SAME).
        if (!item || item.status !== "ACTIVE") continue;
        if (item.baseUnit && itemUnitKey(item.baseUnit) === itemUnitKey(c.unit)) continue;
        const res = await rebaseItemTo(deps, r, ctx, item, c.unit, audit);
        if (res.kind === "REBASED" || res.kind === "SET_BASE") n++;
      }
      return ok({ n, audit });
    });
    if (step.ok) rebased += step.value.n;
  }

  const tail = await deps.uow.asOrg(ctx, async (r) => {
    const set = (await r.codeSets.get(ctx.orgId, head.value.set.id))!;
    const p = await planSource(r, ctx, set);
    const codeSets = await Promise.all(
      (await r.codeSets.list(ctx.orgId)).map(async (s) => toCodeSetDto(s, await r.owners.list(ctx.orgId, s.id), (await r.aliases.listForCodeSet(ctx.orgId, s.id, { status: "ACTIVE" })).length)),
    );
    return { set, codeSets, unchanged: p.plans.filter((x) => x.outcome === "UNCHANGED").length, blocked: blockedOf(p.plans), missingCount: p.missingCount };
  });
  if (head.value.changed || rebased > 0) {
    await deps.orgAudit?.record(ctx, {
      action: "CATALOG_SOURCE_CHANGED", targetType: "code_set", targetId: tail.set.id, targetLabel: tail.set.name,
      detail: { kind: tail.set.kind, changed: head.value.changed, rebased, blocked: tail.blocked.length },
    });
  }
  // `unchanged` gồm cả mặt hàng vừa đổi gốc (giờ cùng ĐVT với mã) → trừ ra.
  return ok({ codeSets: tail.codeSets, rebased, unchanged: Math.max(0, tail.unchanged - rebased), missingCount: tail.missingCount, blocked: tail.blocked, changed: head.value.changed });
}
