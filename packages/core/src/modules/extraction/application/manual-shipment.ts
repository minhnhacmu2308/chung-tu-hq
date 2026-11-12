// Nhập tay dữ liệu lô hàng khi chưa có chứng từ (ADR 0013 – Khai trước): đọc / lưu. Lưu → ghi field_audit, gộp lại shipment, chạy luật, dựng lại tờ khai nháp.
import type { ManualShipment, ManualShipmentView } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError, type DomainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked } from "../domain/edit-normalize.js";
import { manualChanges } from "../domain/manual.js";
import { remergeDossier } from "./_remerge.js";
import type { ExtractionDeps } from "./ports.js";

export async function getManualShipment(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<ManualShipmentView>> {
  const status = await deps.documents.dossierStatus(ctx.orgId, dossierId);
  if (!status) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  const row = await deps.uow.asOrg(ctx, (r) => r.manual.get(ctx.orgId, dossierId));
  return ok({ data: row?.data ?? null, updatedAt: row ? row.updatedAt.toISOString() : null, editable: !isReadLocked(status) && ctx.role !== "VIEWER" });
}

/** `data` đã parse Zod ở biên (ManualShipmentSchema). */
export async function saveManualShipment(deps: ExtractionDeps, ctx: Ctx, dossierId: string, data: ManualShipment): Promise<Result<ManualShipmentView>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const status = await deps.documents.dossierStatus(ctx.orgId, dossierId);
  if (!status) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
  if (isReadLocked(status)) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – mở lại tờ khai trước khi sửa dữ liệu"));
  const now = deps.clock.now();
  const changed = await deps.uow.asOrg(ctx, async (r): Promise<number | DomainError> => {
    await r.lockDossier(ctx.orgId, dossierId);
    const prev = await r.manual.get(ctx.orgId, dossierId);
    const changes = manualChanges(prev?.data ?? null, data);
    if (!changes.length) return 0;
    for (const c of changes) {
      await r.audit.insert({ id: deps.idGen.next("job"), orgId: ctx.orgId, dossierId, fieldId: null, documentId: null, ...c, userId: ctx.userId, source: "MANUAL_EDIT", at: now });
    }
    await r.manual.upsert({ id: prev?.id ?? deps.idGen.next("msh"), orgId: ctx.orgId, dossierId, data, updatedBy: ctx.userId, createdAt: prev?.createdAt ?? now, updatedAt: now });
    return changes.length;
  });
  if (typeof changed !== "number") return err(changed);
  // Ngoài transaction: gộp lại (transaction riêng), luật đối chiếu, tờ khai nháp.
  if (changed) {
    await remergeDossier(deps, ctx.orgId, dossierId);
    await deps.onShipmentEdited?.(ctx.orgId, dossierId);
  }
  return getManualShipment(deps, ctx, dossierId);
}
