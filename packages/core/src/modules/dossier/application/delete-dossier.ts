import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isLocked } from "../domain/status.js";
import type { DossierDeps } from "./ports.js";

/**
 * Xóa hẳn hồ sơ (tạo nhầm, trùng, thử nghiệm): chứng từ + file, dữ liệu đọc, tờ khai nháp. Không hoàn tác được nên chỉ người duyệt /
 * quản trị. Hồ sơ đã truyền Hải quan (có số tờ khai / lịch sử truyền) phải giữ để đối chiếu → chỉ hủy được.
 */
export async function deleteDossier(deps: DossierDeps, ctx: Ctx, id: string): Promise<Result<{ id: string; code: string }>> {
  const allowed = requireRole(ctx, "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const sent = deps.customs ? (await deps.customs.summaries(ctx, [id])).has(id) : false;
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const d = await r.dossiers.get(ctx.orgId, id);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    if (sent || isLocked(d.status) || d.declarationNo) return err(reasonError("INVALID_STATE", "DOSSIER_SENT_TO_CUSTOMS"));
    const docs = await r.documents.list(ctx.orgId, id);
    await r.dossiers.delete(ctx.orgId, id);
    return ok({ code: d.code, keys: docs.map((x) => x.storageKey) });
  });
  if (!res.ok) return res;
  // File trong kho xóa sau khi DB đã xóa – lỗi kho chỉ để lại file mồ côi, không làm hỏng việc xóa.
  for (const key of res.value.keys) await deps.storage.delete(key).catch(() => undefined);
  await deps.onDeleted?.(ctx, id);
  await deps.audit?.record(ctx, { action: "DOSSIER_DELETED", targetType: "dossier", targetId: id, targetLabel: res.value.code });
  return ok({ id, code: res.value.code });
}
