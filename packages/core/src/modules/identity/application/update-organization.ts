import type { OrgProfileInput, Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { getOrganization } from "./get-organization.js";
import type { IdentityDeps } from "./ports.js";

export async function updateOrganization(deps: IdentityDeps, ctx: Ctx, input: OrgProfileInput): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  // Mã bưu chính không gửi lên (client cũ) → giữ nguyên giá trị đã lưu.
  const patch = { name: input.name, address: input.address, phone: input.phone, ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}) };
  await deps.uow.asOrg(ctx, (r) => r.orgs.update(ctx.orgId, patch));
  await deps.audit?.record(ctx, { action: "ORG_PROFILE_UPDATED", targetType: "organization", targetId: ctx.orgId, targetLabel: input.name, detail: { fields: Object.keys(patch) } });
  return getOrganization(deps, ctx);
}
