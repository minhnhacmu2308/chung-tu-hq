import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canManageCertificates } from "../domain/role-rules.js";
import type { IdentityDeps } from "./ports.js";

export async function removeCertificate(deps: IdentityDeps, ctx: Ctx, id: string): Promise<Result<void>> {
  const allowed = canManageCertificates(ctx.role);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const c = (await r.certificates.list(ctx.orgId)).find((x) => x.id === id);
    if (!c) return err(domainError("NOT_FOUND", "Không tìm thấy chứng thư"));
    if (c.isDefault) return err(domainError("FORBIDDEN", "Chọn chứng thư mặc định khác trước khi xóa"));
    await r.certificates.delete(ctx.orgId, id);
    return ok(undefined);
  });
}
