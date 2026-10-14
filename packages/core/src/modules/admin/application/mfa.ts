// Xác thực 2 lớp (TOTP) cho tài khoản quản trị hệ thống – B11 của spec admin.
import type { AdminMfaEnabled, AdminMfaSetup, AdminReasonInput, Staff } from "@kb/contracts";
import { domainError } from "../../../shared/errors.js";
import { err, ok, type Result } from "../../../shared/result.js";
import { base32Decode, base32Encode, hashRecoveryCode, otpauthUri, recoveryCodesFrom, verifyTotp } from "../domain/totp.js";
import { audit, guarded, resolveStaffSession, toStaff, type StaffActor } from "./_shared.js";
import type { AdminDeps } from "./ports.js";

/** Nhập sai quá 5 lần trong 15 phút → khóa tạm. */
const MAX_ATTEMPTS = 5;
const WINDOW_SEC = 15 * 60;
const BAD_CODE = () => err(domainError("MFA_INVALID", "Mã không đúng hoặc đã hết hạn – xem lại ứng dụng xác thực"));

async function underLimit(deps: AdminDeps, userId: string): Promise<Result<void>> {
  const rl = await deps.limiter.hit(`mfa:${userId}`, MAX_ATTEMPTS, WINDOW_SEC);
  return rl.allowed ? ok(undefined) : err(domainError("RATE_LIMITED", "Nhập sai quá nhiều lần – thử lại sau 15 phút"));
}

/** Bước 1: sinh khóa mới (chưa có hiệu lực tới khi xác nhận mã đầu tiên). Đã bật 2FA → CONFLICT (muốn đổi phải nhờ người khác đặt lại). */
export async function startMfaSetup(deps: AdminDeps, sessionToken: string): Promise<Result<AdminMfaSetup>> {
  const s = await resolveStaffSession(deps, sessionToken);
  if (!s.ok) return s;
  if (s.value.mfa.enrolled) return err(domainError("CONFLICT", "Tài khoản đã bật xác thực 2 lớp"));
  const secret = base32Encode(deps.random(20));
  const sealed = deps.vault.encrypt(secret);
  await deps.uow.run((r) => r.staff.setMfa(s.value.actor.userId, { totpPendingCiphertext: sealed.ciphertext, totpKeyVersion: sealed.keyVersion }, deps.clock.now()));
  const uri = otpauthUri(secret, s.value.actor.email);
  return ok({ secret, otpauthUri: uri, qrSvg: await deps.qr.svg(uri) });
}

/** Bước 2: nhập mã từ ứng dụng → bật 2FA, phiên hiện tại tính là đã xác thực, trả 8 mã khôi phục (chỉ hiện một lần). */
export async function confirmMfaSetup(deps: AdminDeps, sessionToken: string, code: string): Promise<Result<AdminMfaEnabled>> {
  const s = await resolveStaffSession(deps, sessionToken);
  if (!s.ok) return s;
  const { actor, sessionId } = s.value;
  if (s.value.mfa.enrolled) return err(domainError("CONFLICT", "Tài khoản đã bật xác thực 2 lớp"));
  const limited = await underLimit(deps, actor.userId);
  if (!limited.ok) return limited;
  const now = deps.clock.now();
  return deps.uow.run(async (r) => {
    const m = await r.staff.getMfa(actor.userId);
    if (!m?.totpPendingCiphertext) return err(domainError("INVALID_STATE", "Chưa bắt đầu thiết lập – tải lại trang để lấy mã QR mới"));
    const counter = verifyTotp(base32Decode(deps.vault.decrypt(m.totpPendingCiphertext, m.totpKeyVersion)), code, now);
    if (counter === null) return BAD_CODE();
    const recovery = recoveryCodesFrom(deps.random(64));
    await r.staff.setMfa(actor.userId, {
      totpCiphertext: m.totpPendingCiphertext, totpPendingCiphertext: null, totpEnabledAt: now, totpLastCounter: counter, recoveryCodes: recovery.map(hashRecoveryCode),
    }, now);
    await r.sessions.markMfaVerified(sessionId, now);
    await audit(deps, r, actor, "STAFF_MFA_ENABLED", { type: "STAFF", id: actor.userId, label: actor.name }, "Tự thiết lập ứng dụng xác thực");
    await deps.limiter.reset(`mfa:${actor.userId}`);
    return ok({ recoveryCodes: recovery });
  });
}

/** Mỗi phiên đăng nhập: nhập mã 6 số (không dùng lại mã đã dùng) hoặc một mã khôi phục (dùng xong là hết). */
export async function verifyMfa(deps: AdminDeps, sessionToken: string, code: string): Promise<Result<{ recoveryCodesLeft: number }>> {
  const s = await resolveStaffSession(deps, sessionToken);
  if (!s.ok) return s;
  const { actor, sessionId } = s.value;
  if (!s.value.mfa.enrolled) return err(domainError("INVALID_STATE", "Tài khoản chưa thiết lập xác thực 2 lớp"));
  const limited = await underLimit(deps, actor.userId);
  if (!limited.ok) return limited;
  const now = deps.clock.now();
  return deps.uow.run(async (r) => {
    const m = (await r.staff.getMfa(actor.userId))!;
    const counter = verifyTotp(base32Decode(deps.vault.decrypt(m.totpCiphertext!, m.totpKeyVersion)), code, now, m.totpLastCounter);
    let recoveryCodes = m.recoveryCodes;
    if (counter !== null) {
      await r.staff.setMfa(actor.userId, { totpLastCounter: counter }, now);
    } else {
      const h = hashRecoveryCode(code);
      if (!m.recoveryCodes.includes(h)) return BAD_CODE();
      recoveryCodes = m.recoveryCodes.filter((x) => x !== h);
      await r.staff.setMfa(actor.userId, { recoveryCodes }, now);
    }
    await r.sessions.markMfaVerified(sessionId, now);
    await deps.limiter.reset(`mfa:${actor.userId}`);
    return ok({ recoveryCodesLeft: recoveryCodes.length });
  });
}

/** Người mất điện thoại: quản trị viên có quyền STAFF xóa 2FA → người đó bị đăng xuất, lần đăng nhập sau thiết lập lại. */
export async function resetStaffMfa(deps: AdminDeps, actor: StaffActor, id: string, input: AdminReasonInput): Promise<Result<Staff>> {
  return guarded(actor, "STAFF", () =>
    deps.uow.run(async (r) => {
      const target = await r.staff.get(id);
      if (!target) return err(domainError("NOT_FOUND", "Không tìm thấy quản trị viên"));
      if (target.userId === actor.userId) return err(domainError("FORBIDDEN", "Không tự đặt lại xác thực 2 lớp của chính mình"));
      if (!target.mfaEnabled) return err(domainError("CONFLICT", "Tài khoản này chưa bật xác thực 2 lớp"));
      const now = deps.clock.now();
      await r.staff.setMfa(id, { totpCiphertext: null, totpPendingCiphertext: null, totpEnabledAt: null, totpLastCounter: null, recoveryCodes: [] }, now);
      await r.sessions.deleteByUser(id);
      await audit(deps, r, actor, "STAFF_MFA_RESET", { type: "STAFF", id, label: target.name }, input.reason);
      return ok(toStaff({ ...target, mfaEnabled: false }));
    }),
  );
}
