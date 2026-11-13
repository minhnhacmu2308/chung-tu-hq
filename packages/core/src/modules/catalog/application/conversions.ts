// Quy đổi đơn vị mặc định theo mặt hàng: "1 `unit` = `factor` ĐVT gốc" (chuỗi Decimal > 0, bất biến 3). Hệ số theo lô nằm ở chứng từ.
import { CatalogFactorSchema, itemUnitKey, type UnitConversion } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { flushAudit, itemNotFound, type AuditEntry } from "./common.js";
import { requireConversionEditor } from "./permissions.js";
import type { CatalogDeps } from "./ports.js";

/** Thêm/sửa hệ số (APPROVER/ADMIN/OWNER hoặc người phụ trách bộ mã). ĐVT trùng ĐVT gốc → VALIDATION. */
export async function setConversion(deps: CatalogDeps, ctx: Ctx, itemId: string, unit: string, factor: string): Promise<Result<UnitConversion[]>> {
  const u = unit.trim();
  if (!u) return err(domainError("VALIDATION", "Thiếu đơn vị tính"));
  if (!CatalogFactorSchema.safeParse(factor).success) return err(domainError("VALIDATION", "Hệ số phải là số lớn hơn 0"));
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ list: UnitConversion[]; audit: AuditEntry[] }>> => {
    const can = await requireConversionEditor(r, ctx);
    if (!can.ok) return can;
    const item = await r.items.get(ctx.orgId, itemId);
    if (!item || item.status === "MERGED") return err(itemNotFound());
    if (item.baseUnit && itemUnitKey(item.baseUnit) === itemUnitKey(u)) return err(domainError("VALIDATION", "ĐVT trùng ĐVT gốc của mặt hàng"));
    const existing = await r.conversions.listForItem(ctx.orgId, itemId);
    const old = existing.find((c) => itemUnitKey(c.unit) === itemUnitKey(u));
    const audit: AuditEntry[] = [];
    if (old?.factor !== factor) {
      const now = deps.clock.now();
      await r.conversions.upsert({ id: old?.id ?? deps.idGen.next("ucv"), orgId: ctx.orgId, itemId, unit: old?.unit ?? u, factor, createdAt: old?.createdAt ?? now, updatedAt: now });
      audit.push({ itemId, key: `conv:${old?.unit ?? u}`, oldValue: old?.factor ?? "", newValue: factor });
    }
    return ok({ list: (await r.conversions.listForItem(ctx.orgId, itemId)).map((c) => ({ unit: c.unit, factor: c.factor })), audit });
  });
  if (!done.ok) return done;
  await flushAudit(deps, ctx, done.value.audit);
  return ok(done.value.list);
}

export async function removeConversion(deps: CatalogDeps, ctx: Ctx, itemId: string, unit: string): Promise<Result<UnitConversion[]>> {
  const done = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ list: UnitConversion[]; audit: AuditEntry[] }>> => {
    const can = await requireConversionEditor(r, ctx);
    if (!can.ok) return can;
    const item = await r.items.get(ctx.orgId, itemId);
    if (!item) return err(itemNotFound());
    const old = (await r.conversions.listForItem(ctx.orgId, itemId)).find((c) => itemUnitKey(c.unit) === itemUnitKey(unit));
    const audit: AuditEntry[] = [];
    if (old) {
      await r.conversions.delete(ctx.orgId, itemId, old.unit);
      audit.push({ itemId, key: `conv:${old.unit}`, oldValue: old.factor, newValue: "" });
    }
    return ok({ list: (await r.conversions.listForItem(ctx.orgId, itemId)).map((c) => ({ unit: c.unit, factor: c.factor })), audit });
  });
  if (!done.ok) return done;
  await flushAudit(deps, ctx, done.value.audit);
  return ok(done.value.list);
}
