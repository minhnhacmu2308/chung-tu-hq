import type { Member } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { canDisable } from "../domain/role-rules.js";
import { membersOf } from "./_members.js";
import type { IdentityDeps } from "./ports.js";

export async function setMemberDisabled(deps: IdentityDeps, ctx: Ctx, userId: string, disabled: boolean): Promise<Result<Member>> {
  const res = await deps.uow.asOrg(ctx, async (r) => {
    const m = await r.memberships.find(ctx.orgId, userId);
    if (!m) return err(domainError("NOT_FOUND", "Không tìm thấy thành viên"));
    const allowed = canDisable(ctx.role, { role: m.role, isSelf: userId === ctx.userId });
    if (!allowed.ok) return allowed;
    const status = disabled ? "DISABLED" : "ACTIVE";
    await r.memberships.update(m.id, { status });
    const [member] = await membersOf(r, [{ ...m, status }]);
    return ok(member!);
  });
  if (!res.ok) return res;
  await deps.audit?.record(ctx, { action: disabled ? "MEMBER_DISABLED" : "MEMBER_ENABLED", targetType: "member", targetId: userId, targetLabel: res.value.email });
  return res;
}
