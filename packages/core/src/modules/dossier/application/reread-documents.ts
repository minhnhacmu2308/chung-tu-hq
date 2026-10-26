import type { DocKind } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { ok, type Result } from "../../../shared/result.js";
import type { DossierDeps } from "./ports.js";

/** Chỉ đọc lại hồ sơ chưa qua bước kiểm tra: hồ sơ đã sang AI Agent/tờ khai giữ nguyên dữ liệu người dùng đã xác nhận. */
const REREADABLE_STEPS = new Set(["upload", "ocr"]);
const OPEN_STATUSES = new Set(["DRAFT", "PROCESSING", "NEEDS_REVIEW"]);

export type OpenDocument = { documentId: string; dossierId: string; dossierCode: string; kind: DocKind; fileName: string };

/** Chứng từ đã đọc xong trong các hồ sơ còn ở bước tải lên/kiểm tra (tối đa 100 hồ sơ mới nhất). Nội bộ – không kiểm quyền. */
export async function listOpenDocuments(deps: DossierDeps, orgId: string): Promise<OpenDocument[]> {
  const ctx = { orgId: asOrgId(orgId), userId: asUserId("") };
  return deps.uow.asOrg(ctx, async (r) => {
    const out: OpenDocument[] = [];
    for (const step of REREADABLE_STEPS) {
      for (const d of await r.dossiers.list(orgId, { step }, { limit: 100, offset: 0 })) {
        if (!OPEN_STATUSES.has(d.status)) continue;
        for (const doc of await r.documents.list(orgId, d.id)) {
          if (doc.status === "DONE") out.push({ documentId: doc.id, dossierId: d.id, dossierCode: d.code, kind: doc.kind, fileName: doc.fileName });
        }
      }
    }
    return out;
  });
}

/** Đọc lại chứng từ đã đọc xong bằng cấu hình skill hiện tại (giá trị người dùng đã xác nhận được giữ khi gộp lại). Trả số chứng từ đưa vào hàng đợi. */
export async function rereadDocuments(deps: DossierDeps, ctx: Ctx, documentIds: string[]): Promise<Result<number>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();
  const queued = await deps.uow.asOrg(ctx, async (r) => {
    const out: { id: string; dossierId: string; sha256: string; kind: DocKind }[] = [];
    for (const id of [...new Set(documentIds)].slice(0, 200)) {
      const doc = await r.documents.get(ctx.orgId, id);
      if (!doc || doc.status !== "DONE") continue;
      const d = await r.dossiers.get(ctx.orgId, doc.dossierId);
      if (!d || !REREADABLE_STEPS.has(d.step) || !OPEN_STATUSES.has(d.status)) continue;
      await r.documents.update(ctx.orgId, doc.id, { status: "QUEUED", error: null });
      await r.dossiers.update(ctx.orgId, doc.dossierId, { status: "PROCESSING", updatedAt: now });
      out.push({ id: doc.id, dossierId: doc.dossierId, sha256: doc.sha256, kind: doc.kind });
    }
    return out;
  });
  for (const doc of queued) {
    await deps.queue.enqueue("extract-document", { orgId: ctx.orgId, dossierId: doc.dossierId, documentId: doc.id, mode: "FULL", idempotencyKey: `${doc.id}:${doc.sha256}:${doc.kind}` }, { jobId: `extract:${doc.id}:${doc.sha256}:reread:${now.getTime()}` });
    await deps.publisher.publish(ctx.orgId, doc.dossierId, { type: "document.status", documentId: doc.id, status: "QUEUED" });
  }
  return ok(queued.length);
}
