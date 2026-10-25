// Bộ chứng từ đổi (tải lên / đổi loại / đọc lại / xóa) → gộp lại dữ liệu lô hàng: có thể thêm/bớt dòng hàng và đổi chỉ tiêu chung.
// Lô nhiều tờ còn tờ chưa gọi về (spec tách tờ khai IDC/gọi về §2.4) → chặn (contracts editBlockFor, đích ADD_REMOVE_LINES). Lô một tờ / chưa nối port → như cũ.
import { declarationEditScope, editBlockFor } from "@kb/contracts";
import { canModify } from "../domain/status.js";
import type { Ctx } from "../../../shared/ctx.js";
import { reasonError, type DomainError } from "../../../shared/errors.js";
import type { DossierDeps } from "./ports.js";

export async function documentSetScopeError(deps: DossierDeps, ctx: Ctx, dossierId: string): Promise<DomainError | null> {
  const sheets = deps.customsSheets ? await deps.customsSheets(ctx.orgId, dossierId) : [];
  if (sheets.length <= 1) return null;
  // Hồ sơ đã truyền / thông quan / hủy (hoặc không thấy) → để use case báo lỗi cũ (canModify), không thành lý do phạm vi sửa.
  const d = await deps.uow.asOrg(ctx, (r) => r.dossiers.get(ctx.orgId, dossierId));
  if (!d || !canModify(d.status).ok) return null;
  // Đã duyệt mà còn tờ hiệu lực vẫn chặn: tính như nháp (tờ khai đã duyệt chưa gửi lại – đổi chứng từ vẫn đổi nội dung đã khai).
  const b = editBlockFor(declarationEditScope("DRAFT", sheets), { kind: "ADD_REMOVE_LINES" });
  return b && b.reasonCode !== "DECLARATION_LOCKED" ? reasonError("INVALID_STATE", b.reasonCode, b.params) : null;
}

/** Như trên, theo chứng từ (tra hồ sơ của chứng từ trước khi sửa; không thấy → để use case báo NOT_FOUND). */
export async function documentScopeError(deps: DossierDeps, ctx: Ctx, documentId: string): Promise<DomainError | null> {
  if (!deps.customsSheets) return null;
  const doc = await deps.uow.asOrg(ctx, (r) => r.documents.get(ctx.orgId, documentId));
  return doc ? documentSetScopeError(deps, ctx, doc.dossierId) : null;
}
