import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canModify } from "../domain/status.js";
import type { DossierDeps } from "./ports.js";

/** Xóa chứng từ + file; gộp lại shipment bằng job MERGE_ONLY. */
export async function deleteDocument(deps: DossierDeps, ctx: Ctx, documentId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const doc = await r.documents.get(ctx.orgId, documentId);
    if (!doc) return err(domainError("NOT_FOUND", "Không tìm thấy chứng từ"));
    const d = await r.dossiers.get(ctx.orgId, doc.dossierId);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    await r.documents.delete(ctx.orgId, doc.id);
    await r.dossiers.update(ctx.orgId, d.id, { updatedAt: deps.clock.now() });
    return ok(doc);
  });
  if (!res.ok) return res;
  await deps.storage.delete(res.value.storageKey);
  await deps.queue.enqueue("extract-document", { orgId: ctx.orgId, dossierId: res.value.dossierId, documentId: res.value.id, mode: "MERGE_ONLY", idempotencyKey: `merge:${res.value.dossierId}:${Date.now()}` });
  await deps.publisher.publish(ctx.orgId, res.value.dossierId, { type: "fields.updated" });
  return ok(undefined);
}
