import type { AddCertificateInput, DigitalCertificate } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { canManageCertificates } from "../domain/role-rules.js";
import { toCertificate } from "./_certificates.js";
import type { IdentityDeps } from "./ports.js";

/** Chứng thư đầu tiên của doanh nghiệp tự thành mặc định. subject = tên doanh nghiệp. */
export async function addCertificate(deps: IdentityDeps, ctx: Ctx, input: AddCertificateInput): Promise<Result<DigitalCertificate>> {
  const allowed = canManageCertificates(ctx.role);
  if (!allowed.ok) return allowed;
  return deps.uow.asOrg(ctx, async (r) => {
    const [org, existing] = await Promise.all([r.orgs.findById(ctx.orgId), r.certificates.list(ctx.orgId)]);
    const row = { id: deps.idGen.next("cert"), orgId: ctx.orgId, subject: org?.name ?? "", issuer: input.issuer.trim(), serial: input.serial.trim().toUpperCase(), validTo: input.validTo, isDefault: existing.length === 0 };
    await r.certificates.insert(row);
    return ok(toCertificate(row));
  });
}
