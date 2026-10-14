import type { DigitalCertificate } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { toCertificate } from "./_certificates.js";
import type { IdentityDeps } from "./ports.js";

export async function listCertificates(deps: IdentityDeps, ctx: Ctx): Promise<Result<DigitalCertificate[]>> {
  return ok((await deps.uow.asOrg(ctx, (r) => r.certificates.list(ctx.orgId))).map(toCertificate));
}
