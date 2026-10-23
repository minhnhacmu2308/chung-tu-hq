import type { InviteMemberInput, Member } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { displayNameFromEmail } from "../domain/email.js";
import { canInvite } from "../domain/role-rules.js";
import { newToken, TOKEN_TTL_MS } from "../domain/token.js";
import { inviteMail } from "./_mail-templates.js";
import { toMember } from "./_to-dto.js";
import type { IdentityDeps } from "./ports.js";

/** Mời bằng email: user chưa có → tạo user tạm (mật khẩu ngẫu nhiên); membership INVITED; token INVITE 7 ngày; gửi mail. */
export async function inviteMember(deps: IdentityDeps, ctx: Ctx, input: InviteMemberInput): Promise<Result<Member>> {
  const allowed = canInvite(ctx.role);
  if (!allowed.ok) return allowed;
  const now = deps.clock.now();

  // Bước 1 (system): tìm/tạo user theo email – bảng users chỉ tìm theo email được khi không có ngữ cảnh org.
  const user = await deps.uow.system(async (r) => {
    const found = await r.users.findByEmail(input.email);
    if (found) return found;
    const row = { id: deps.idGen.next("usr"), email: input.email, passwordHash: await deps.hasher.hash(newToken(deps.random).raw), name: displayNameFromEmail(input.email), emailVerifiedAt: null, createdAt: now };
    await r.users.insert(row);
    return row;
  });

  // Bước 2 (org): membership + token + thông tin org/người mời.
  const result = await deps.uow.asOrg(ctx, async (r) => {
    if (await r.memberships.find(ctx.orgId, user.id)) return err(domainError("DUPLICATE", "Email này đã là thành viên"));
    const membership = { id: deps.idGen.next("mem"), orgId: ctx.orgId, userId: user.id, role: input.role, status: "INVITED" as const, invitedBy: ctx.userId };
    await r.memberships.insert(membership);
    const [org, inviter] = await Promise.all([r.orgs.findById(ctx.orgId), r.users.findById(ctx.userId)]);
    return ok({ membership, orgName: org?.name ?? "", inviterName: inviter?.name ?? "" });
  });
  if (!result.ok) return result;

  const t = newToken(deps.random);
  await deps.uow.system((r) =>
    r.authTokens.insert({ id: deps.idGen.next("tok"), userId: user.id, orgId: ctx.orgId, kind: "INVITE", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.INVITE), usedAt: null }),
  );
  await deps.mailer.send({ to: user.email, ...inviteMail(deps.appUrl, t.raw, result.value.orgName, result.value.inviterName) });
  await deps.audit?.record(ctx, { action: "MEMBER_INVITED", targetType: "member", targetId: user.id, targetLabel: user.email, detail: { role: input.role } });
  return ok(toMember(user, result.value.membership));
}
