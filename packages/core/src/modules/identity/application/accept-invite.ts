import type { AcceptInviteInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asOrgId, asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { hashToken } from "../domain/token.js";
import { createSession } from "./_session.js";
import type { IdentityDeps } from "./ports.js";

/** Người được mời đặt tên + mật khẩu → membership ACTIVE, email coi như đã xác thực, đăng nhập luôn. */
export async function acceptInvite(deps: IdentityDeps, input: AcceptInviteInput): Promise<Result<{ sessionToken: string }>> {
  const now = deps.clock.now();
  const t = await deps.uow.system((r) => r.authTokens.findValid("INVITE", hashToken(input.token), now));
  if (!t || !t.orgId) return err(domainError("TOKEN_INVALID", "Lời mời không hợp lệ hoặc đã hết hạn"));
  const orgId = t.orgId;
  const passwordHash = await deps.hasher.hash(input.password);
  // Ngữ cảnh org + user: sửa membership (withCheck org), sửa chính mình, tạo phiên.
  return deps.uow.asOrg({ orgId: asOrgId(orgId), userId: asUserId(t.userId) }, async (r) => {
    const membership = await r.memberships.find(orgId, t.userId);
    if (!membership) return err(domainError("TOKEN_INVALID", "Lời mời không còn hiệu lực"));
    if (!(await r.authTokens.consume(t.id, now))) return err(domainError("TOKEN_INVALID", "Lời mời không hợp lệ hoặc đã hết hạn"));
    await r.users.update(t.userId, { name: input.name, passwordHash, emailVerifiedAt: now });
    if (membership.status === "INVITED") await r.memberships.update(membership.id, { status: "ACTIVE" });
    const sessionToken = await createSession(deps, r, t.userId, orgId);
    return ok({ sessionToken });
  });
}
