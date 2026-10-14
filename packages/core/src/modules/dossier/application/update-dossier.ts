import type { Dossier, UpdateDossierInput } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canChangeStep, canModify } from "../domain/status.js";
import { toDossier } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function updateDossier(deps: DossierDeps, ctx: Ctx, id: string, patch: UpdateDossierInput): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const d = await r.dossiers.get(ctx.orgId, id);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const m = canModify(d.status);
    if (!m.ok) return m;
    if (patch.step) {
      const c = canChangeStep(d, patch.step);
      if (!c.ok) return c;
    }
    const next = { ...d, ...(patch.note !== undefined ? { note: patch.note || null } : {}), ...(patch.step ? { step: patch.step } : {}), updatedAt: deps.clock.now() };
    await r.dossiers.update(id, { note: next.note, step: next.step, updatedAt: next.updatedAt });
    return ok(toDossier(next));
  });
}
