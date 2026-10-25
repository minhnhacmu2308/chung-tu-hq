import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isReadLocked } from "../domain/edit-normalize.js";
import { sheetScopeError } from "./_edit-scope.js";
import { countSuspect } from "./_remerge.js";
import type { ExtractionDeps } from "./ports.js";

/** "Xác nhận dữ liệu": cho đi tiếp khi mọi chứng từ đã DONE/ERROR; còn trường nghi ngờ vẫn được (đánh dấu trên tờ khai). */
export async function finishReading(deps: ExtractionDeps, ctx: Ctx, dossierId: string): Promise<Result<void>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  if (isReadLocked(await deps.documents.dossierStatus(ctx.orgId, dossierId))) return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã duyệt/truyền – không quay lại bước đọc"));
  // Xác nhận dữ liệu đưa dữ liệu chứng từ vào tờ khai (chỉ tiêu chung) → lô nhiều tờ còn tờ chưa gọi về: khóa.
  const blocked = await sheetScopeError(deps, ctx, dossierId, null);
  if (blocked) return err(blocked);
  const docs = await deps.documents.listForDossier(ctx.orgId, dossierId);
  if (docs.some((d) => d.status === "QUEUED" || d.status === "READING" || d.status === "UPLOADING")) return err(domainError("NOT_READY", "Còn chứng từ đang đọc"));
  const org = await deps.documents.orgInfo(ctx.orgId);
  const fields = await deps.uow.asOrg(ctx, (r) => r.fields.list(ctx.orgId, dossierId));
  await deps.documents.finishReading(ctx.orgId, dossierId, countSuspect(fields, org.suspectThreshold));
  await deps.documents.publish(ctx.orgId, dossierId, { type: "dossier.updated" });
  return ok(undefined);
}
