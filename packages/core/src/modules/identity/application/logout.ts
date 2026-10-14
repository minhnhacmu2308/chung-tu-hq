import { ok, type Result } from "../../../shared/result.js";
import { hashToken } from "../domain/token.js";
import type { IdentityDeps } from "./ports.js";

/** Xóa phiên nếu có; luôn thành công. */
export async function logout(deps: IdentityDeps, sessionToken: string): Promise<Result<void>> {
  if (!sessionToken) return ok(undefined);
  await deps.uow.system(async (r) => {
    const s = await r.sessions.findByTokenHash(hashToken(sessionToken));
    if (s) await r.sessions.delete(s.id);
  });
  return ok(undefined);
}
