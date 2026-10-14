// Phục vụ khu Quản trị hệ thống (module admin gọi qua container): tạo tài khoản cho quản trị viên mới, gửi lại email xác thực.
// Việc ghi bảng users/auth_tokens vẫn thuộc identity.
import { randomBytes } from "node:crypto";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { newToken, TOKEN_TTL_MS } from "../domain/token.js";
import { staffInviteMail, verifyEmailMail } from "./_mail-templates.js";
import type { IdentityDeps } from "./ports.js";

/**
 * Email đã có tài khoản → dùng lại (người đó đăng nhập bằng mật khẩu cũ). Chưa có → tạo tài khoản với mật khẩu ngẫu nhiên không ai biết
 * và gửi liên kết đặt mật khẩu hiệu lực 7 ngày.
 */
export async function provisionStaffAccount(deps: IdentityDeps, input: { email: string; name: string }): Promise<Result<{ userId: string; created: boolean }>> {
  const now = deps.clock.now();
  const random = deps.random ?? randomBytes;
  return deps.uow.system(async (r) => {
    const existing = await r.users.findByEmail(input.email);
    if (existing) return ok({ userId: existing.id, created: false });
    const userId = deps.idGen.next("usr");
    await r.users.insert({ id: userId, email: input.email, passwordHash: await deps.hasher.hash(random(32).toString("base64url")), name: input.name, emailVerifiedAt: now, createdAt: now });
    const t = newToken(deps.random);
    await r.authTokens.insert({ id: deps.idGen.next("tok"), userId, orgId: null, kind: "RESET_PASSWORD", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.INVITE), usedAt: null });
    await deps.mailer.send({ to: input.email, ...staffInviteMail(deps.appUrl, t.raw) });
    return ok({ userId, created: true });
  });
}

/** Gửi lại email xác thực cho tài khoản chưa xác thực. */
export async function resendVerificationEmail(deps: IdentityDeps, userId: string): Promise<Result<void>> {
  const now = deps.clock.now();
  return deps.uow.system(async (r) => {
    const user = await r.users.findById(userId);
    if (!user) return err(domainError("NOT_FOUND", "Không tìm thấy người dùng"));
    if (user.emailVerifiedAt) return err(domainError("CONFLICT", "Email của tài khoản này đã được xác thực"));
    const t = newToken(deps.random);
    await r.authTokens.insert({ id: deps.idGen.next("tok"), userId, orgId: null, kind: "VERIFY_EMAIL", tokenHash: t.hash, expiresAt: new Date(now.getTime() + TOKEN_TTL_MS.VERIFY_EMAIL), usedAt: null });
    await deps.mailer.send({ to: user.email, ...verifyEmailMail(deps.appUrl, t.raw) });
    return ok(undefined);
  });
}
