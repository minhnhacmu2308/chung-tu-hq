// Luật bộ nguồn gốc (spec 2026-11-14 §1–2) dùng trong transaction đang mở: đổi ĐVT gốc mặt hàng theo ĐVT của mã bộ nguồn gốc (quy đổi + hệ số
// theo lô trên dòng tờ khai, chia lại bằng Decimal), áp thông tin mặt hàng từ dòng của bộ nguồn gốc. Mọi thay đổi ghi vào `audit` (field_audit
// CATALOG_EDIT, cùng transaction – bất biến 6). Code thuần ở domain/rebase.ts; ở đây chỉ đọc/ghi repo.
import { itemNameKey, itemUnitKey, type CatalogItemFields } from "@kb/contracts";
import type { OrgId, UserId } from "../../../shared/ids.js";
import { diffItemFields, planRebase } from "../domain/rebase.js";
import type { AuditEntry } from "./common.js";
import type { CatalogDeps, CatalogItemRow, CatalogRepos, ItemConversionRow } from "./ports.js";

type TxCtx = { orgId: OrgId; userId: UserId };

export type RebaseOutcome = { kind: "SAME" | "SET_BASE" | "REBASED" | "NO_FACTOR"; item: CatalogItemRow; conversions: ItemConversionRow[] };

/**
 * Đổi ĐVT gốc của `item` sang `newBase` (ĐVT mã ở bộ nguồn gốc). f lấy từ quy đổi hiện có của `newBase`, không có thì `factor`.
 * Thiếu hệ số → NO_FACTOR, không ghi gì. Dòng tờ khai gắn mặt hàng (kể cả tờ đã gửi – chỉ là gợi ý) chia lại hệ số theo lô.
 */
export async function rebaseItemTo(deps: Pick<CatalogDeps, "clock" | "idGen">, r: CatalogRepos, ctx: TxCtx, item: CatalogItemRow, newBase: string, audit: AuditEntry[], factor?: string): Promise<RebaseOutcome> {
  const convs = await r.conversions.listForItem(ctx.orgId, item.id);
  const nb = newBase.trim();
  if (!nb) return { kind: "SAME", item, conversions: convs };
  const lines = item.baseUnit ? await r.lineFactors.listForItems(ctx.orgId, [item.id]) : [];
  const plan = planRebase({ baseUnit: item.baseUnit, newBase: nb, conversions: convs, lineFactors: lines.map((l) => ({ id: l.id, factor: l.unitFactor })), ...(factor ? { factor } : {}) });
  if (plan.kind === "SAME" || plan.kind === "NO_FACTOR") return { kind: plan.kind, item, conversions: convs };
  const now = deps.clock.now();
  const newKey = itemUnitKey(nb);
  const next: CatalogItemRow = { ...item, baseUnit: nb, updatedBy: ctx.userId, updatedAt: now };

  if (plan.kind === "SET_BASE") {
    // Quy đổi trùng ĐVT gốc mới (không còn nghĩa) → bỏ.
    const same = convs.find((c) => itemUnitKey(c.unit) === newKey);
    if (same) {
      await r.conversions.delete(ctx.orgId, item.id, same.unit);
      audit.push({ itemId: item.id, key: `conv:${same.unit}`, oldValue: same.factor, newValue: "" });
    }
    await r.items.update(ctx.orgId, item.id, { baseUnit: nb, updatedBy: ctx.userId, updatedAt: now });
    audit.push({ itemId: item.id, key: "baseUnit", oldValue: "", newValue: nb });
    return { kind: "SET_BASE", item: next, conversions: convs.filter((c) => c !== same) };
  }

  for (const c of convs) if (itemUnitKey(c.unit) === newKey) await r.conversions.delete(ctx.orgId, item.id, c.unit);
  const out: ItemConversionRow[] = [];
  for (const c of plan.conversions) {
    const old = convs.find((x) => itemUnitKey(x.unit) === itemUnitKey(c.unit));
    const row: ItemConversionRow = { id: old?.id ?? deps.idGen.next("ucv"), orgId: ctx.orgId, itemId: item.id, unit: old?.unit ?? c.unit, factor: c.factor, createdAt: old?.createdAt ?? now, updatedAt: now };
    await r.conversions.upsert(row);
    out.push(row);
  }
  await r.items.update(ctx.orgId, item.id, { baseUnit: nb, updatedBy: ctx.userId, updatedAt: now });
  audit.push({ itemId: item.id, key: "baseUnit", oldValue: item.baseUnit ?? "", newValue: nb });
  for (const ch of plan.changes) audit.push({ itemId: item.id, key: `conv:${ch.unit}`, oldValue: ch.oldValue, newValue: ch.newValue });
  for (const l of plan.lineFactors) {
    const line = lines.find((x) => x.id === l.id)!;
    await r.lineFactors.setFactor(ctx.orgId, l.id, l.newValue, now);
    // Lịch sử của hồ sơ (như sửa hệ số theo lô ở dòng tờ khai): đối tượng = hồ sơ, khóa unitFactor:<số dòng>.
    audit.push({ itemId: line.dossierId, key: `unitFactor:${line.lineNo}`, oldValue: l.oldValue, newValue: l.newValue });
  }
  return { kind: "REBASED", item: next, conversions: out };
}

/** Áp thông tin mặt hàng từ dòng của bộ nguồn gốc (chỉ trường có giá trị và khác hiện tại). Trả mặt hàng sau khi áp. */
export async function applySourceFields(deps: Pick<CatalogDeps, "clock">, r: CatalogRepos, ctx: TxCtx, item: CatalogItemRow, fields: CatalogItemFields | null | undefined, audit: AuditEntry[]): Promise<CatalogItemRow> {
  if (!fields) return item;
  const { patch, changes } = diffItemFields(item, fields);
  if (!changes.length) return item;
  const now = deps.clock.now();
  const full: Partial<CatalogItemRow> = { ...patch, ...(patch.name !== undefined ? { nameKey: itemNameKey(patch.name) } : {}), updatedBy: ctx.userId, updatedAt: now };
  await r.items.update(ctx.orgId, item.id, full);
  for (const c of changes) audit.push({ itemId: item.id, ...c });
  return { ...item, ...full };
}

/**
 * Gắn mã của bộ nguồn gốc vào mặt hàng: ĐVT của mã thành ĐVT gốc (đổi gốc nếu biết hệ số; thiếu → giữ nguyên) rồi áp thông tin mặt hàng của dòng.
 * Bộ không phải nguồn gốc → không làm gì.
 */
export async function applySourceAttach(
  deps: Pick<CatalogDeps, "clock" | "idGen">, r: CatalogRepos, ctx: TxCtx, set: { isSource: boolean }, item: CatalogItemRow, unit: string | null | undefined, fields: CatalogItemFields | null | undefined, audit: AuditEntry[],
): Promise<RebaseOutcome | null> {
  if (!set.isSource) return null;
  let out: RebaseOutcome = { kind: "SAME", item, conversions: [] };
  if (unit) out = await rebaseItemTo(deps, r, ctx, item, unit, audit);
  const after = await applySourceFields(deps, r, ctx, out.item, fields, audit);
  return { ...out, item: after };
}
