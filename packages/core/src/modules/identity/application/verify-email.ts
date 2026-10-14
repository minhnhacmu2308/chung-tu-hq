import { domainError } from "../../../shared/errors.js";
import { asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { hashToken } from "../domain/token.js";
import type { IdentityDeps } from "./ports.js";

export async function verifyEmail(deps: IdentityDeps, token: string): Promise<Result<void>> {
  const now = deps.clock.now();
  const t = await deps.uow.system((r) => r.authTokens.findValid("VERIFY_EMAIL", hashToken(token), now));
  if (!t) return err(domainError("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn"));
  await deps.uow.asUser(asUserId(t.userId), async (r) => {
    await r.users.update(t.userId, { emailVerifiedAt: now });
    await r.authTokens.markUsed(t.id, now);
  });
  return ok(undefined);
}
