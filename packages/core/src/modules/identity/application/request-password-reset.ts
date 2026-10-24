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
  // Token ghi trong transaction; email gửi SAU commit (không giữ transaction khi chờ SMTP).
  const pending = await deps.uow.system(async (r) => {
    const user = await r.users.findByEmail(email);
    if (!user) return null;
    const t = newToken(deps.random);
    await r.authTokens.insert({ id: deps.idGen.next("tok"), userId: user.id, orgId: null, kind: "RESET_PASSWORD", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.RESET_PASSWORD), usedAt: null });
    return { to: user.email, token: t.raw };
  });
  if (pending) await deps.mailer.send({ to: pending.to, ...resetPasswordMail(deps.appUrl, pending.token) });
  void meta;
  return ok(undefined);
}
