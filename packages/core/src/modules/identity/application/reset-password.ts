import { domainError } from "../../../shared/errors.js";
import { asUserId } from "../../../shared/ids.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { hashToken } from "../domain/token.js";
import type { IdentityDeps } from "./ports.js";

const INVALID = () => err(domainError("TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn"));

/** Đặt lại mật khẩu bằng liên kết email. Token dùng một lần; mọi phiên đang đăng nhập bị hủy (kẻ đang giữ phiên cũ mất quyền). */
export async function resetPassword(deps: IdentityDeps, input: { token: string; password: string }): Promise<Result<void>> {
  const now = deps.clock.now();
  const t = await deps.uow.system((r) => r.authTokens.findValid("RESET_PASSWORD", hashToken(input.token), now));
  if (!t) return INVALID();
  const passwordHash = await deps.hasher.hash(input.password);
  return deps.uow.asUser(asUserId(t.userId), async (r) => {
    // Tiêu thụ token trước khi đổi: hai request cùng token chỉ một bên đổi được mật khẩu.
    if (!(await r.authTokens.consume(t.id, now))) return INVALID();
    await r.users.update(t.userId, { passwordHash });
    await r.sessions.deleteByUser(t.userId);
    return ok(undefined);
  });
}
