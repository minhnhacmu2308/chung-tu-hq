import { asOrgId, asUserId } from "../../../shared/ids.js";
import type { DossierDeps } from "./ports.js";

/** Chứng từ QUEUED quá lâu (mặc định 10 phút) coi như job đã mất. */
export const STUCK_DOCUMENT_MS = 10 * 60_000;

/**
 * Job quét định kỳ: ghi DB và đẩy job không cùng transaction, job có thể mất (Redis lỗi, tiến trình chết) → chứng từ kẹt QUEUED mãi
 * mà người dùng không "đọc lại" được (chỉ cho ERROR). Đẩy lại job với jobId theo mốc cập nhật: cùng một lần kẹt chỉ đẩy một job,
 * mốc được làm mới để lần quét sau chờ đủ thời gian rồi mới đẩy tiếp.
 */
export async function requeueStuckDocuments(deps: DossierDeps, input: { orgId: string; now?: Date; olderThanMs?: number }): Promise<{ requeued: string[] }> {
  const now = input.now ?? deps.clock.now();
  const before = new Date(now.getTime() - (input.olderThanMs ?? STUCK_DOCUMENT_MS));
  const ctx = { orgId: asOrgId(input.orgId), userId: asUserId("") };
  const stuck = await deps.uow.asOrg(ctx, (r) => r.documents.listStuckQueued(input.orgId, before));
  const requeued: string[] = [];
  for (const doc of stuck) {
    await deps.queue.enqueue(
      "extract-document",
      { orgId: input.orgId, dossierId: doc.dossierId, documentId: doc.id, mode: "FULL", idempotencyKey: `${doc.id}:${doc.sha256}` },
      { jobId: `extract:${doc.id}:${doc.sha256}:sweep:${doc.updatedAt.getTime()}` },
    );
    // Làm mới mốc cập nhật (status giữ QUEUED) để lần quét sau không đẩy trùng ngay.
    await deps.uow.asOrg(ctx, (r) => r.documents.update(doc.id, { status: "QUEUED" }));
    requeued.push(doc.id);
  }
  return { requeued };
}
