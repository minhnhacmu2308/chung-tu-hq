import type { Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { toOrganization } from "./_to-dto.js";
import type { IdentityDeps } from "./ports.js";

export async function getOrganization(deps: IdentityDeps, ctx: Ctx): Promise<Result<Organization>> {
  const org = await deps.uow.asOrg(ctx, (r) => r.orgs.findById(ctx.orgId));
  if (!org) return err(domainError("NOT_FOUND", "Không tìm thấy doanh nghiệp"));
  return ok(toOrganization(org, await deps.plans.get(org.planCode), deps.clock.now(), await deps.usage?.(org.id)));
}
