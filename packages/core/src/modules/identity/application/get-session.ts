import type { Session } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isExpired, sessionExpiry, shouldExtend, shouldTouch } from "../domain/session-policy.js";
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
  // Transaction chỉ ĐỌC. Không ghi và không gọi deps khác (plans/usage lấy kết nối pool riêng) khi đang mở transaction:
  // transaction giữ khóa dòng phiên rồi chờ kết nối pool, trong khi các request song song giữ hết pool và chờ chính khóa đó → treo cả web.
  const found = await deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId(s.userId) }, async (r) => {
    const [user, org, membership] = await Promise.all([r.users.findById(s.userId), r.orgs.findById(orgId), r.memberships.find(orgId, s.userId)]);
    return user && org && membership ? { user, org, membership } : null;
  });
  if (!found || found.membership.status !== "ACTIVE" || found.org.status === "SUSPENDED") return UNAUTH();
  const { user, org, membership } = found;
  if (shouldTouch(s, now)) await deps.uow.system((r) => r.sessions.touch(s.id, now, shouldExtend(s, now) ? sessionExpiry(now) : s.expiresAt));
  const plan = await deps.plans.get(org.planCode);
  const ctx: Ctx = { orgId: asOrgId(org.id), userId: asUserId(user.id), role: membership.role };
  return ok({
    ctx,
    session: {
      user: toMember(user, membership, now),
      org: toOrganization(org, plan, now, await deps.usage?.(org.id)),
      ...(user.mustChangePassword ? { mustChangePassword: true } : {}),
    },
  });
}
