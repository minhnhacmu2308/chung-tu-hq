// Worker gọi khi job extract-document hết số lần thử: chứng từ ERROR kèm lý do, gộp lại hồ sơ để không kẹt PROCESSING.
import { ok, type Result } from "../../../shared/result.js";
import { remergeDossier } from "./_remerge.js";
import type { ExtractionDeps } from "./ports.js";

export async function markDocumentFailed(deps: ExtractionDeps, input: { orgId: string; dossierId: string; documentId: string; reason: string }): Promise<Result<void>> {
  const doc = await deps.documents.get(input.orgId, input.documentId);
  if (!doc || doc.status === "DONE" || doc.status === "ERROR") return ok(undefined);
  const message = `Không đọc được sau nhiều lần thử: ${input.reason}`.slice(0, 500);
  await deps.documents.setStatus(input.orgId, doc.id, "ERROR", { error: message });
  await deps.documents.publish(input.orgId, input.dossierId, { type: "document.status", documentId: doc.id, status: "ERROR", error: message });
  await remergeDossier(deps, input.orgId, input.dossierId);
  return ok(undefined);
}
