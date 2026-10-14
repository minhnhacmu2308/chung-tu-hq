import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import type { IdentityDeps } from "./ports.js";

export async function markAllNotificationsRead(deps: IdentityDeps, ctx: Ctx): Promise<Result<void>> {
  await deps.uow.asOrg(ctx, (r) => r.notifications.markAllRead(ctx.orgId, ctx.userId, deps.clock.now()));
  return ok(undefined);
}
