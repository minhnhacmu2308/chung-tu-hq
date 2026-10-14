import type { JoinRequest } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { canManageOrg } from "../domain/role-rules.js";
import type { IdentityDeps } from "./ports.js";

export async function listJoinRequests(deps: IdentityDeps, ctx: Ctx): Promise<Result<JoinRequest[]>> {
  const allowed = canManageOrg(ctx.role);
  if (!allowed.ok) return allowed;
  return ok(
    await deps.uow.asOrg(ctx, async (r) => {
      const pending = await r.joinRequests.listPending(ctx.orgId);
      const users = await r.users.findByIds(pending.map((j) => j.userId));
      const byId = new Map(users.map((u) => [u.id, u]));
      return pending.flatMap((j) => {
        const u = byId.get(j.userId);
        return u ? [{ id: j.id, userId: u.id, name: u.name, email: u.email, requestedAt: j.createdAt.toISOString() }] : [];
      });
    }),
  );
}
