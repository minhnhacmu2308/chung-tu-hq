import { domainError } from "../../../shared/errors.js";
import { asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { hashToken } from "../domain/token.js";
import type { IdentityDeps } from "./ports.js";

export async function verifyEmail(deps: IdentityDeps, token: string): Promise<Result<void>> {
  const now = deps.clock.now();
  const t = await deps.uow.system((r) => r.authTokens.findValid("VERIFY_EMAIL", hashToken(token), now));
  if (!t) return err(domainError("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn"));
  return deps.uow.asUser(asUserId(t.userId), async (r) => {
    if (!(await r.authTokens.consume(t.id, now))) return err(domainError("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn"));
    await r.users.update(t.userId, { emailVerifiedAt: now });
    return ok(undefined);
  });
}
