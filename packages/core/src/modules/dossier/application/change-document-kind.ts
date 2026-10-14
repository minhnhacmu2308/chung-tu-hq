import type { DocKind, DossierDocument } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canModify } from "../domain/status.js";
import { toDocument } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

/** Người dùng đặt loại → đọc lại theo skill của loại mới (job mới có hậu tố loại để không trùng khóa cũ). Trường cũ do pipeline extraction thay khi đọc lại; xóa chứng từ thì DB cascade. */
export async function changeDocumentKind(deps: DossierDeps, ctx: Ctx, documentId: string, kind: DocKind): Promise<Result<DossierDocument>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const doc = await r.documents.get(ctx.orgId, documentId);
    if (!doc) return err(domainError("NOT_FOUND", "Không tìm thấy chứng từ"));
    const d = await r.dossiers.get(ctx.orgId, doc.dossierId);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    await r.documents.update(doc.id, { kind, kindSource: "USER", status: "QUEUED", error: null });
    await r.dossiers.update(d.id, { status: "PROCESSING", updatedAt: now });
    return ok({ ...doc, kind, kindSource: "USER" as const, status: "QUEUED" as const, error: null });
  });
  if (!res.ok) return res;
  const doc = res.value;
  await deps.queue.enqueue("extract-document", { orgId: ctx.orgId, dossierId: doc.dossierId, documentId: doc.id, mode: "FULL", idempotencyKey: `${doc.id}:${doc.sha256}:${kind}` }, { jobId: `extract:${doc.id}:${doc.sha256}:${kind}:${now.getTime()}` });
  await deps.publisher.publish(ctx.orgId, doc.dossierId, { type: "document.status", documentId: doc.id, status: "QUEUED" });
  return ok(toDocument(doc));
}
