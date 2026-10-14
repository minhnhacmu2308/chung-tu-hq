import { newToken } from "../domain/token.js";
import { sessionExpiry } from "../domain/session-policy.js";
import type { IdentityDeps, IdentityRepos } from "./ports.js";

/** Tạo phiên mới trong repos đang mở; trả token raw để đặt cookie. */
export async function createSession(deps: IdentityDeps, r: IdentityRepos, userId: string, orgId: string | null): Promise<string> {
  const now = deps.clock.now();
  const t = newToken(deps.random);
  await r.sessions.insert({ id: deps.idGen.next("ses"), userId, orgId, tokenHash: t.hash, expiresAt: sessionExpiry(now), lastSeenAt: now });
  return t.raw;
}
