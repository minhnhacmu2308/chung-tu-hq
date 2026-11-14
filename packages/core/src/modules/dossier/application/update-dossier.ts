import type { Dossier, UpdateDossierInput } from "@kb/contracts";
import { STEP_ORDER } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError, reasonError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mergeDocumentSources } from "../domain/document-sources.js";
import { canChangeStep, canModify } from "../domain/status.js";
import { toDossier } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function updateDossier(deps: DossierDeps, ctx: Ctx, id: string, patch: UpdateDossierInput): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  // Dữ liệu bắt buộc khi rời bước Đọc chứng từ (xuất xứ dòng hàng, mã PTTT): đọc TRƯỚC transaction – port đọc module extraction bằng kết nối khác (không gọi ra ngoài trong transaction).
  const at = (s: string) => STEP_ORDER.indexOf(s as (typeof STEP_ORDER)[number]);
  const leavingOcr = !!patch.step && at(patch.step) > at("ocr");
  const [blocker] = leavingOcr && deps.ocrExitBlockers ? await deps.ocrExitBlockers(ctx.orgId, id) : [];
  const res = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ dossier: Dossier; sourcesChanged: boolean }>> => {
    const d = await r.dossiers.get(ctx.orgId, id);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    if (patch.step) {
      const c = canChangeStep(d, patch.step);
      if (!c.ok) return c;
      // Đang ở bước OCR trở về trước mà tiến qua "ocr" khi còn thiếu → chặn, báo lý do đầu tiên.
      if (blocker && at(d.step) <= at("ocr")) return err(reasonError("VALIDATION", blocker.reason, blocker.params));
    }
    let documentSources = d.documentSources;
    if (patch.documentSources) {
      const s = mergeDocumentSources(d.direction, d.documentSources, patch.documentSources);
      if (!s.ok) return s;
      documentSources = s.value;
    }
    const mergeIdenticalLines = patch.mergeIdenticalLines ?? d.mergeIdenticalLines;
    // Đổi nguồn chứng từ hoặc gộp/tách dòng hàng → dựng lại shipment (luật, dòng hàng, tờ khai nháp theo sau).
    const sourcesChanged = JSON.stringify(documentSources) !== JSON.stringify(d.documentSources) || mergeIdenticalLines !== d.mergeIdenticalLines;
    const next = { ...d, ...(patch.note !== undefined ? { note: patch.note || null } : {}), ...(patch.step ? { step: patch.step } : {}), documentSources, mergeIdenticalLines, updatedAt: deps.clock.now() };
    await r.dossiers.update(ctx.orgId, id, { note: next.note, step: next.step, documentSources, mergeIdenticalLines, updatedAt: next.updatedAt });
    return ok({ dossier: toDossier(next), sourcesChanged });
  });
  if (!res.ok) return res;
  // Ngoài transaction (gọi sang module validation qua container): luật đối chiếu đọc lại nguồn chứng từ mới.
  if (res.value.sourcesChanged && deps.onDocumentSourcesChanged) await deps.onDocumentSourcesChanged(ctx.orgId, id);
  return ok(res.value.dossier);
}
