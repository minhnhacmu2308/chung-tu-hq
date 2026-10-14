import type { Member } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { ok, type Result } from "../../../shared/result.js";
import { membersOf } from "./_members.js";
import type { IdentityDeps } from "./ports.js";

export async function listMembers(deps: IdentityDeps, ctx: Ctx): Promise<Result<Member[]>> {
  return ok(await deps.uow.asOrg(ctx, async (r) => membersOf(r, await r.memberships.listByOrg(ctx.orgId))));
}
