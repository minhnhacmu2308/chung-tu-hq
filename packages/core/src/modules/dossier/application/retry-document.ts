import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import type { DossierDeps } from "./ports.js";

/** Đọc lại chứng từ lỗi. */
export async function retryDocument(deps: DossierDeps, ctx: Ctx, documentId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const doc = await r.documents.get(ctx.orgId, documentId);
    if (!doc) return err(domainError("NOT_FOUND", "Không tìm thấy chứng từ"));
    if (doc.status !== "ERROR") return err(domainError("INVALID_STATE", "Chỉ đọc lại chứng từ bị lỗi"));
    await r.documents.update(ctx.orgId, doc.id, { status: "QUEUED", error: null });
    await r.dossiers.update(ctx.orgId, doc.dossierId, { status: "PROCESSING", updatedAt: deps.clock.now() });
    return ok(doc);
  });
  if (!res.ok) return res;
  const doc = res.value;
  const attempt = Date.now();
  await deps.queue.enqueue("extract-document", { orgId: ctx.orgId, dossierId: doc.dossierId, documentId: doc.id, mode: "FULL", idempotencyKey: `${doc.id}:${doc.sha256}:${doc.kind}` }, { jobId: `extract:${doc.id}:${doc.sha256}:retry:${attempt}` });
  await deps.publisher.publish(ctx.orgId, doc.dossierId, { type: "document.status", documentId: doc.id, status: "QUEUED" });
  return ok(undefined);
}
