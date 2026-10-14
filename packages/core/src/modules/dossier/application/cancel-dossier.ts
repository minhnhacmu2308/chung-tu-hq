import type { Dossier } from "@kb/contracts";
import { requireRole, type Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canCancel } from "../domain/status.js";
import { toDossier } from "./_dto.js";
import type { DossierDeps } from "./ports.js";

export async function cancelDossier(deps: DossierDeps, ctx: Ctx, id: string): Promise<Result<Dossier>> {
  const allowed = requireRole(ctx, "DECLARANT", "APPROVER", "ADMIN");
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const d = await r.dossiers.get(ctx.orgId, id);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    const c = canCancel(d.status);
    if (!c.ok) return c;
    const updatedAt = deps.clock.now();
    await r.dossiers.update(id, { status: "CANCELLED", updatedAt });
    return ok(toDossier({ ...d, status: "CANCELLED", updatedAt }));
  });
}
