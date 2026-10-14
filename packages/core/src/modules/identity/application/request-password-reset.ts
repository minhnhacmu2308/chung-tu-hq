import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { newToken, TOKEN_TTL_MS } from "../domain/token.js";
import { resetPasswordMail } from "./_mail-templates.js";
import type { IdentityDeps } from "./ports.js";

/** Luôn trả ok để không lộ email có tồn tại hay không. */
export async function requestPasswordReset(deps: IdentityDeps, email: string, meta: { ip: string }): Promise<Result<void>> {
  const rl = await deps.rateLimiter.hit(`forgot:${email}`, 3, 3600);
  if (!rl.allowed) return err(domainError("RATE_LIMITED", "Bạn yêu cầu quá nhiều lần, thử lại sau 1 giờ"));
  const now = deps.clock.now();
  await deps.uow.system(async (r) => {
    const user = await r.users.findByEmail(email);
    if (!user) return;
    const t = newToken(deps.random);
    await r.authTokens.insert({ id: deps.idGen.next("tok"), userId: user.id, orgId: null, kind: "RESET_PASSWORD", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.RESET_PASSWORD), usedAt: null });
    await deps.mailer.send({ to: user.email, ...resetPasswordMail(deps.appUrl, t.raw) });
  });
  void meta;
  return ok(undefined);
}
