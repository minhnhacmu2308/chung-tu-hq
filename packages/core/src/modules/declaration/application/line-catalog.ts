// Dòng hàng ↔ danh mục hàng hóa dùng chung (spec danh mục §5): người khai chọn / tạo mặt hàng cho dòng "Mã lạ", hệ số quy đổi theo lô.
// Gọi module catalog (DeclarationCatalogPort) ngoài transaction; lỗi nghiệp vụ của catalog (mã đã thuộc mặt hàng khác, thiếu hệ số…) trả về TRƯỚC khi ghi dòng.
import { CatalogFactorSchema, itemUnitKey, type LineItem, type LinkLineItemInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { sheetScopeError } from "./_edit-scope.js";
import { loadDossier, toLineItem } from "./_dto.js";
import { catalogView, describeSafe, partNoOf } from "./_catalog-plan.js";
import type { CatalogItemInfo, DeclarationDeps, LineItemRow } from "./ports.js";

const LOCKED = new Set(["APPROVED", "SUBMITTED", "CLEARED", "CANCELLED"]);

/** Dòng của org + hồ sơ còn sửa được (chưa duyệt/truyền, tờ chứa dòng chưa gọi về). */
async function editableLine(deps: DeclarationDeps, ctx: Ctx, lineItemId: string): Promise<Result<LineItemRow>> {
  const row = await deps.uow.asOrg(ctx, (r) => r.lineItems.get(ctx.orgId, lineItemId));
  if (!row) return err(domainError("NOT_FOUND", "Không tìm thấy dòng hàng"));
  const dossier = await loadDossier(deps, ctx.orgId, row.dossierId);
  if (!dossier.ok) return dossier;
  if (LOCKED.has(dossier.value.status)) return err(domainError("DOSSIER_LOCKED", "Tờ khai đã duyệt/truyền – mở lại tờ khai trước khi đổi mặt hàng"));
  const blocked = await sheetScopeError(deps, ctx, row.dossierId, { kind: "LINE_NO", lineNo: row.lineNo });
  return blocked ? err(blocked) : ok(row);
}

async function viewOf(deps: DeclarationDeps, ctx: Ctx, row: LineItemRow): Promise<LineItem> {
  const shipment = await deps.shipments.latest(ctx.orgId, row.dossierId);
  const info = await describeSafe(deps, ctx.orgId, [row.catalogItemId], row.dossierId);
  return toLineItem(row, undefined, catalogView(row, row.catalogItemId ? info[row.catalogItemId] : undefined, partNoOf(shipment, row.lineNo), !!deps.catalog));
}

/**
 * Gắn mặt hàng cho dòng ("Mã lạ – Chọn mặt hàng"): chọn mặt hàng có sẵn hoặc tạo mới. Part No của dòng → bí danh trong bộ nhà cung cấp
 * (tự tạo bộ theo tên người bán): người phụ trách bộ mã / Quản trị → ACTIVE ngay, người khác → PROPOSED – dòng hồ sơ vẫn đi tiếp.
 * HAG_MAHANG = mã bộ Hải quan của mặt hàng (mới nhất). Ghi field_audit (CATALOG_EDIT).
 */
export async function linkLineItem(deps: DeclarationDeps, ctx: Ctx, lineItemId: string, input: LinkLineItemInput): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const catalog = deps.catalog;
  if (!catalog) return err(domainError("INVALID_STATE", "Chưa nối danh mục hàng hóa"));
  const line = await editableLine(deps, ctx, lineItemId);
  if (!line.ok) return line;
  const row = line.value;
  const shipment = await deps.shipments.latest(ctx.orgId, row.dossierId);
  const partNo = partNoOf(shipment, row.lineNo);
  const seller = shipment?.parties.seller.name.value?.trim() || null;

  let aliasId: string | null = null;
  let info: CatalogItemInfo | undefined;
  if ("createItem" in input) {
    // Tạo mặt hàng + mã Part No trong bộ nhà cung cấp trong MỘT use case của catalog (một transaction): không sinh mặt hàng mồ côi khi mã bị
    // giữ bởi mặt hàng khác; không đủ quyền tạo thẳng → mục hàng chờ mang mã + bộ mã.
    const c = input.createItem;
    const setId = partNo && seller ? await catalog.ensurePartnerSet(ctx.orgId, "SUPPLIER", seller) : null;
    const conv = c.factor && c.baseUnit && itemUnitKey(c.baseUnit) !== itemUnitKey(row.unit) ? [{ unit: row.unit, factor: c.factor }] : [];
    const created = await catalog.createItem(ctx, {
      kind: c.kind, name: c.name, ...(c.hsCode ? { hsCode: c.hsCode } : {}), ...(c.baseUnit ? { baseUnit: c.baseUnit } : {}),
      ...(setId && partNo ? { codeSetId: setId, code: partNo } : {}), ...(conv.length ? { conversions: conv } : {}),
    });
    if (!created.ok) return created;
    // Không đủ quyền tạo thẳng → mặt hàng vào hàng chờ: dòng chưa gắn, hồ sơ đi tiếp (HAG_MAHANG trống + cảnh báo).
    if (created.value.status === "QUEUED") return ok(await viewOf(deps, ctx, row));
    aliasId = created.value.aliasId;
    info = (await describeSafe(deps, ctx.orgId, [created.value.itemId], row.dossierId))[created.value.itemId];
    if (!info) return err(domainError("NOT_FOUND", "Không tìm thấy mặt hàng trong danh mục"));
  } else {
    info = (await describeSafe(deps, ctx.orgId, [input.itemId], row.dossierId))[input.itemId];
    if (!info) return err(domainError("NOT_FOUND", "Không tìm thấy mặt hàng trong danh mục"));
    const setId = partNo && seller ? await catalog.ensurePartnerSet(ctx.orgId, "SUPPLIER", seller) : null;
    if (setId && partNo) {
      const alias = await catalog.proposeAlias(ctx, { itemId: info.id, codeSetId: setId, code: partNo, name: row.description, unit: row.unit, source: "DOCUMENT", ...(input.factor ? { factor: input.factor } : {}) });
      if (!alias.ok) return alias;
      if (alias.value.status === "ACTIVE") aliasId = alias.value.id;
    }
  }
  const old = row.catalogItemId ? (await describeSafe(deps, ctx.orgId, [row.catalogItemId], row.dossierId))[row.catalogItemId]?.itemNo ?? row.catalogItemId : "";
  const now = deps.clock.now();
  const patch = { catalogItemId: info.id, catalogAliasId: aliasId, itemCode: info.customs?.code ?? null, ...(row.catalogItemId === info.id ? {} : { unitFactor: null }), updatedAt: now };
  const itemNo = info.itemNo;
  await deps.uow.asOrg(ctx, async (r) => {
    await r.lineItems.update(ctx.orgId, row.id, patch);
    await r.fieldAudit.append(ctx, now, [{ dossierId: row.dossierId, key: `catalog:${row.lineNo}`, oldValue: old, newValue: itemNo, source: "CATALOG_EDIT" }]);
  });
  await deps.dossiers.publish(ctx.orgId, row.dossierId, { type: "dossier.updated" });
  return ok(await viewOf(deps, ctx, { ...row, ...patch }));
}

/** Hệ số quy đổi theo lô của dòng (packing list ghi khác mặc định); null = dùng hệ số mặc định của danh mục. Lệch > 20% chỉ cảnh báo. Ghi field_audit. */
export async function setLineUnitFactor(deps: DeclarationDeps, ctx: Ctx, lineItemId: string, factor: string | null): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const line = await editableLine(deps, ctx, lineItemId);
  if (!line.ok) return line;
  const row = line.value;
  if (factor !== null && !CatalogFactorSchema.safeParse(factor).success) return err(domainError("VALIDATION", "Hệ số phải là số lớn hơn 0"));
  if (!row.catalogItemId) return err(domainError("INVALID_STATE", "Dòng chưa gắn mặt hàng danh mục"));
  const now = deps.clock.now();
  await deps.uow.asOrg(ctx, async (r) => {
    await r.lineItems.update(ctx.orgId, row.id, { unitFactor: factor, updatedAt: now });
    await r.fieldAudit.append(ctx, now, [{ dossierId: row.dossierId, key: `unitFactor:${row.lineNo}`, oldValue: row.unitFactor ?? "", newValue: factor ?? "", source: "CATALOG_EDIT" }]);
  });
  await deps.dossiers.publish(ctx.orgId, row.dossierId, { type: "dossier.updated" });
  return ok(await viewOf(deps, ctx, { ...row, unitFactor: factor, updatedAt: now }));
}
