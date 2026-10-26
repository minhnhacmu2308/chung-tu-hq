import type { ChangePasswordInput } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { isExpired } from "../domain/session-policy.js";
import { hashToken } from "../domain/token.js";
import { createSession } from "./_session.js";
import type { IdentityDeps } from "./ports.js";

/** Sai mật khẩu hiện tại: 10 lần / 15 phút mỗi tài khoản (phiên bị lộ không dò được mật khẩu cũ). */
const LIMIT = { limit: 10, windowSec: 900 };

/**
 * Đổi mật khẩu khi đang đăng nhập (kể cả tài khoản quản trị không thuộc doanh nghiệp nào, và tài khoản đang bị bắt đổi mật khẩu tạm).
 * Xong: bỏ cờ bắt đổi, hủy MỌI phiên cũ và mở phiên mới (trả token để đặt lại cookie) – ai giữ mật khẩu tạm cũng mất phiên.
 */
export async function changePassword(deps: IdentityDeps, sessionToken: string, input: ChangePasswordInput): Promise<Result<{ sessionToken: string }>> {
  const now = deps.clock.now();
  const s = sessionToken ? await deps.uow.system((r) => r.sessions.findByTokenHash(hashToken(sessionToken))) : null;
  if (!s || isExpired(s, now)) return err(domainError("UNAUTHENTICATED", "Chưa đăng nhập hoặc phiên đã hết hạn"));
  const key = `change-password:${s.userId}`;
  if (!(await deps.rateLimiter.hit(key, LIMIT.limit, LIMIT.windowSec)).allowed) return err(domainError("RATE_LIMITED", "Nhập sai quá nhiều lần, thử lại sau 15 phút"));
  const passwordHash = await deps.hasher.hash(input.newPassword);
  return deps.uow.asUser(asUserId(s.userId), async (r) => {
    const user = await r.users.findById(s.userId);
    if (!user || !(await deps.hasher.verify(user.passwordHash, input.currentPassword))) {
      return err(domainError("INVALID_CREDENTIALS", "Mật khẩu hiện tại không đúng"));
    }
    await r.users.update(user.id, { passwordHash, mustChangePassword: false });
    await r.sessions.deleteByUser(user.id);
    await deps.rateLimiter.reset(key);
    return ok({ sessionToken: await createSession(deps, r, user.id, s.orgId) });
  });
}
