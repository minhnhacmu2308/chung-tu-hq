import type { HsEntry, LineItem } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { formatHs, ratesFromCandidate } from "../domain/hscodepro-map.js";
import { ratesFor } from "../domain/rates.js";
import { rebuildDraft } from "./_rebuild.js";
import { sheetScopeError } from "./_edit-scope.js";
import { loadDossier, syncLineItems, toHsEntry, toLineItem } from "./_dto.js";
import type { DeclarationDeps } from "./ports.js";

/** Dòng hàng của hồ sơ; chưa có (hồ sơ vừa đọc xong) → tạo từ shipment.items để màn Agent hiển thị trước khi chạy. */
export async function listLineItems(deps: DeclarationDeps, ctx: Ctx, dossierId: string): Promise<Result<LineItem[]>> {
  const d = await loadDossier(deps, ctx.orgId, dossierId);
  if (!d.ok) return d;
  let rows = await deps.uow.asOrg(ctx, (r) => r.lineItems.list(ctx.orgId, dossierId));
  if (rows.length === 0) {
    const shipment = await deps.shipments.latest(ctx.orgId, dossierId);
    if (shipment && shipment.items.length) rows = await deps.uow.asOrg(ctx, (r) => syncLineItems(deps, r, ctx.orgId, dossierId, shipment));
  }
  const sugs = rows.length ? await deps.uow.asOrg(ctx, (r) => r.suggestions.listForItems(ctx.orgId, rows.map((x) => x.id))) : [];
  return ok(rows.map((x) => toLineItem(x, sugs)));
}

export async function listHsCatalog(deps: DeclarationDeps, ctx: Ctx, q?: string): Promise<Result<HsEntry[]>> {
  return ok((await deps.uow.asOrg(ctx, (r) => r.catalogHs.search(q, 100))).map(toHsEntry));
}

/**
 * Người dùng xác nhận mã HS (8 số; nhận "84821000" hoặc "8482.10.00"). Thuế suất theo thứ tự:
 * ứng viên HSCodePro cùng mã → biểu thuế nội bộ (catalog_hs) → để trống + ghi chú (mã nhập tay).
 * XK / loại hình miễn thuế luôn 0%. Ghi field_audit; dựng lại tờ khai nháp.
 */
export async function confirmHs(deps: DeclarationDeps, ctx: Ctx, itemId: string, rawCode: string): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (rawCode.replace(/\D/g, "").length !== 8) return err(domainError("INVALID_HS", "Mã HS phải đủ 8 chữ số (vd 8482.10.00)"));
  const code = formatHs(rawCode);
  const now = deps.clock.now();
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const item = await r.lineItems.get(ctx.orgId, itemId);
    if (!item) return err(domainError("NOT_FOUND", "Không tìm thấy dòng hàng"));
    const sug = (await r.suggestions.listForItems(item.orgId, [item.id])).find((x) => x.code === code) ?? null;
    return ok({ item, sug, hs: sug ? null : await r.catalogHs.get(code) });
  });
  if (!r0.ok) return r0;
  const { item, sug, hs } = r0.value;
  const dossier = await loadDossier(deps, ctx.orgId, item.dossierId);
  if (!dossier.ok) return dossier;
  if (dossier.value.status === "APPROVED" || dossier.value.status === "SUBMITTED" || dossier.value.status === "CLEARED" || dossier.value.status === "CANCELLED") return err(domainError("DOSSIER_LOCKED", "Tờ khai đã duyệt/truyền – mở lại tờ khai trước khi đổi mã HS"));
  const blocked = await sheetScopeError(deps, ctx, item.dossierId, { kind: "LINE_NO", lineNo: item.lineNo });
  if (blocked) return err(blocked);
  const p = { direction: dossier.value.direction, typeCode: dossier.value.typeCode };
  let rates: { importDutyRate: string | null; vatRate: string | null; policyNote: string | null };
  if (sug) rates = ratesFromCandidate({ code: sug.code, description: sug.description, confidence: sug.confidence, whyNot: sug.whyNot, importRate: sug.rates?.importRate ?? null, basis: sug.rates?.basis ?? null, agreement: sug.rates?.agreement ?? null, vatRate: sug.rates?.vatRate ?? null }, p);
  else if (hs) {
    const shipment = await deps.shipments.latest(ctx.orgId, item.dossierId);
    rates = ratesFor(hs, { ...p, coForm: shipment?.origin.coForm.value ?? null });
  } else rates = ratesFromCandidate(null, p);
  const patch = { hsConfirmed: code, hsConfirmedBy: ctx.userId, hsConfirmedAt: now, importDutyRate: rates.importDutyRate, vatRate: rates.vatRate, policyNote: rates.policyNote, updatedAt: now };
  await deps.uow.asOrg(ctx, (r) => r.lineItems.update(item.orgId, item.id, patch));
  await deps.audit.append(ctx, { dossierId: item.dossierId, key: `hs:${item.lineNo}`, oldValue: item.hsConfirmed ?? item.hsSuggested ?? "", newValue: code, source: "HS_CONFIRM" });
  const rebuilt = await rebuildDraft(deps, ctx, item.dossierId);
  if (!rebuilt.ok) return rebuilt;
  await deps.dossiers.publish(ctx.orgId, item.dossierId, { type: "dossier.updated" });
  return ok(toLineItem({ ...item, ...patch }));
}

export async function unconfirmHs(deps: DeclarationDeps, ctx: Ctx, itemId: string): Promise<Result<LineItem>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const r0 = await deps.uow.asOrg(ctx, async (r) => {
    const item = await r.lineItems.get(ctx.orgId, itemId);
    return item ? ok(item) : err(domainError("NOT_FOUND", "Không tìm thấy dòng hàng"));
  });
  if (!r0.ok) return r0;
  const item = r0.value;
  const dossier = await loadDossier(deps, ctx.orgId, item.dossierId);
  if (!dossier.ok) return dossier;
  if (dossier.value.status === "APPROVED" || dossier.value.status === "SUBMITTED" || dossier.value.status === "CLEARED") return err(domainError("DOSSIER_LOCKED", "Tờ khai đã duyệt/truyền – không bỏ xác nhận HS"));
  const blocked = await sheetScopeError(deps, ctx, item.dossierId, { kind: "LINE_NO", lineNo: item.lineNo });
  if (blocked) return err(blocked);
  const patch = { hsConfirmed: null, hsConfirmedBy: null, hsConfirmedAt: null, importDutyRate: null, vatRate: null, policyNote: null, updatedAt: now };
  await deps.uow.asOrg(ctx, (r) => r.lineItems.update(item.orgId, item.id, patch));
  if (item.hsConfirmed) await deps.audit.append(ctx, { dossierId: item.dossierId, key: `hs:${item.lineNo}`, oldValue: item.hsConfirmed, newValue: "", source: "HS_CONFIRM" });
  const rebuilt = await rebuildDraft(deps, ctx, item.dossierId);
  if (!rebuilt.ok) return rebuilt;
  return ok(toLineItem({ ...item, ...patch }));
}
