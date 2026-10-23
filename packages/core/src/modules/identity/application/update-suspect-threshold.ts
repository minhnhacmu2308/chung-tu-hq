import type { Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { getOrganization } from "./get-organization.js";
import type { IdentityDeps } from "./ports.js";

export async function updateSuspectThreshold(deps: IdentityDeps, ctx: Ctx, threshold: Organization["suspectThreshold"]): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  await deps.uow.asOrg(ctx, (r) => r.orgs.update(ctx.orgId, { suspectThreshold: threshold }));
  await deps.audit?.record(ctx, { action: "ORG_SUSPECT_THRESHOLD_CHANGED", targetType: "organization", targetId: ctx.orgId, targetLabel: "suspect_threshold", detail: { threshold } });
  return getOrganization(deps, ctx);
}
