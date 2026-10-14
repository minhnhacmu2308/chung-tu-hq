import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canManageCertificates } from "../domain/role-rules.js";
import type { IdentityDeps } from "./ports.js";

export async function setDefaultCertificate(deps: IdentityDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = canManageCertificates(ctx.role);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    if (!(await r.certificates.list(ctx.orgId)).some((x) => x.id === id)) return err(domainError("NOT_FOUND", "Không tìm thấy chứng thư"));
    await r.certificates.setDefault(ctx.orgId, id);
    return ok(undefined);
  });
}
