import type { Dossier, UpdateDossierInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { mergeDocumentSources } from "../domain/document-sources.js";
import { canChangeStep, canModify } from "../domain/status.js";
import { toDossier } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function updateDossier(deps: DossierDeps, ctx: Ctx, id: string, patch: UpdateDossierInput): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  const res = await deps.uow.asOrg(ctx, async (r): Promise<Result<{ dossier: Dossier; sourcesChanged: boolean }>> => {
    const d = await r.dossiers.get(ctx.orgId, id);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    if (patch.step) {
      const c = canChangeStep(d, patch.step);
      if (!c.ok) return c;
    }
    let documentSources = d.documentSources;
    if (patch.documentSources) {
      const s = mergeDocumentSources(d.direction, d.documentSources, patch.documentSources);
      if (!s.ok) return s;
      documentSources = s.value;
    }
    const sourcesChanged = JSON.stringify(documentSources) !== JSON.stringify(d.documentSources);
    const next = { ...d, ...(patch.note !== undefined ? { note: patch.note || null } : {}), ...(patch.step ? { step: patch.step } : {}), documentSources, updatedAt: deps.clock.now() };
    await r.dossiers.update(ctx.orgId, id, { note: next.note, step: next.step, documentSources, updatedAt: next.updatedAt });
    return ok({ dossier: toDossier(next), sourcesChanged });
  });
  if (!res.ok) return res;
  // Ngoài transaction (gọi sang module validation qua container): luật đối chiếu đọc lại nguồn chứng từ mới.
  if (res.value.sourcesChanged && deps.onDocumentSourcesChanged) await deps.onDocumentSourcesChanged(ctx.orgId, id);
  return ok(res.value.dossier);
}
