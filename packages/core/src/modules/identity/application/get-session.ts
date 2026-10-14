import type { Session } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isExpired, sessionExpiry, shouldExtend } from "../domain/session-policy.js";
import { hashToken } from "../domain/token.js";
import { toMember, toOrganization } from "./_to-dto.js";
import type { IdentityDeps } from "./ports.js";

const UNAUTH = () => err(domainError("UNAUTHENTICATED", "Chưa đăng nhập"));

/** Từ cookie → Ctx + DTO cho màn hình. Gia hạn trượt khi phiên sắp hết. */
export async function getSession(deps: IdentityDeps, sessionToken: string): Promise<Result<{ ctx: Ctx; session: Session }>> {
  if (!sessionToken) return UNAUTH();
  const now = deps.clock.now();
  const s = await deps.uow.system((r) => r.sessions.findByTokenHash(hashToken(sessionToken)));
  if (!s || isExpired(s, now) || !s.orgId) return UNAUTH();
  const orgId = s.orgId;
  return deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId(s.userId) }, async (r) => {
    const [user, org, membership] = await Promise.all([r.users.findById(s.userId), r.orgs.findById(orgId), r.memberships.find(orgId, s.userId)]);
    if (!user || !org || !membership || membership.status !== "ACTIVE") return UNAUTH();
    await r.sessions.touch(s.id, now, shouldExtend(s, now) ? sessionExpiry(now) : s.expiresAt);
    const plan = await deps.plans.get(org.planCode);
    const ctx: Ctx = { orgId: asOrgId(org.id), userId: asUserId(user.id), role: membership.role };
    return ok({ ctx, session: { user: toMember(user, membership, now), org: toOrganization(org, plan, now, await deps.usage?.(org.id)) } });
  });
}
