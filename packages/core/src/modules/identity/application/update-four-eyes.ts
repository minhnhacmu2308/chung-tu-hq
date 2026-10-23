import type { Organization } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import type { Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import { getOrganization } from "./get-organization.js";
import type { IdentityDeps } from "./ports.js";

/** Bật/tắt nguyên tắc 4 mắt của doanh nghiệp (người duyệt tờ khai phải khác người tạo hồ sơ). Chỉ Quản trị / Chủ sở hữu. */
export async function updateFourEyes(deps: IdentityDeps, ctx: Ctx, enabled: boolean): Promise<Result<Organization>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  await deps.uow.asOrg(ctx, (r) => r.orgs.update(ctx.orgId, { fourEyes: enabled }));
  await deps.audit?.record(ctx, { action: enabled ? "ORG_FOUR_EYES_ON" : "ORG_FOUR_EYES_OFF", targetType: "organization", targetId: ctx.orgId, targetLabel: "four_eyes" });
  return getOrganization(deps, ctx);
}
