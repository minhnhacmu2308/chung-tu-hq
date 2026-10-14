import type { Member } from "@kb/contracts";
import type { Ctx } from "../../../shared/ctx.js";
import { toMember } from "./_to-dto.js";
import type { IdentityDeps, IdentityRepos, MembershipRow } from "./ports.js";

/** Ghép user + membership → Member[] (lastActiveAt từ phiên gần nhất). */
export async function membersOf(r: IdentityRepos, memberships: MembershipRow[]): Promise<Member[]> {
  const ids = memberships.map((m) => m.userId);
  const [users, lastSeen] = await Promise.all([r.users.findByIds(ids), r.sessions.lastSeenByUsers(ids)]);
  const byId = new Map(users.map((u) => [u.id, u]));
  return memberships.flatMap((m) => {
    const u = byId.get(m.userId);
    return u ? [toMember(u, m, lastSeen[m.userId])] : [];
  });
}

export async function memberById(deps: IdentityDeps, ctx: Ctx, userId: string): Promise<Member | null> {
  return deps.uow.asOrg(ctx, async (r) => {
    const m = await r.memberships.find(ctx.orgId, userId);
    if (!m) return null;
    const [member] = await membersOf(r, [m]);
    return member ?? null;
  });
}
