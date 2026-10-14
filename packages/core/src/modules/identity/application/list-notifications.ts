import type { Notification } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import type { IdentityDeps } from "./ports.js";

/** Mới nhất trước, tối đa 50. */
export async function listNotifications(deps: IdentityDeps, ctx: Ctx): Promise<Result<Notification[]>> {
  const rows = await deps.uow.asOrg(ctx, (r) => r.notifications.list(ctx.orgId, ctx.userId));
  return ok(
    rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50)
      .map((n) => ({ id: n.id, title: n.title, body: n.body, at: n.createdAt.toISOString(), read: n.readAt !== null, ...(n.href ? { href: n.href } : {}) })),
  );
}
