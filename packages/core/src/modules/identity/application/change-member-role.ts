import type { Member, Role } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canChangeRole } from "../domain/role-rules.js";
import { membersOf } from "./_members.js";
import type { IdentityDeps } from "./ports.js";

export async function changeMemberRole(deps: IdentityDeps, ctx: Ctx, userId: string, role: Role): Promise<Result<Member>> {
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const m = await r.memberships.find(ctx.orgId, userId);
    if (!m) return err(domainError("NOT_FOUND", "Không tìm thấy thành viên"));
    const allowed = canChangeRole(ctx.role, { role: m.role, isSelf: userId === ctx.userId }, role);
    if (!allowed.ok) return allowed;
    await r.memberships.update(m.id, { role });
    const [member] = await membersOf(r, [{ ...m, role }]);
    return ok({ member: member!, from: m.role });
  });
  if (!res.ok) return res;
  await deps.audit?.record(ctx, { action: "MEMBER_ROLE_CHANGED", targetType: "member", targetId: userId, targetLabel: res.value.member.email, detail: { from: res.value.from, to: role } });
  return ok(res.value.member);
}
