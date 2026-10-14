import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked } from "../domain/edit-normalize.js";
import { countSuspect } from "./_remerge.js";
import type { ExtractionDeps } from "./ports.js";

/** "Xác nhận dữ liệu": cho đi tiếp khi mọi chứng từ đã DONE/ERROR; còn trường nghi ngờ vẫn được (đánh dấu trên tờ khai). */
export async function finishReading(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (isReadLocked(await deps.documents.dossierStatus(ctx.orgId, dossierId))) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – không quay lại bước đọc"));
  const docs = await deps.documents.listForDossier(ctx.orgId, dossierId);
  if (docs.some((d) => d.status === "QUEUED" || d.status === "READING" || d.status === "UPLOADING")) return err(domainError("NOT_READY", "Còn chứng từ đang đọc"));
  const org = await deps.documents.orgInfo(ctx.orgId);
  const fields = await deps.uow.asOrg(ctx, (r) => r.fields.list(dossierId));
  await deps.documents.finishReading(ctx.orgId, dossierId, countSuspect(fields, org.suspectThreshold));
  await deps.documents.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  return ok(undefined);
}
