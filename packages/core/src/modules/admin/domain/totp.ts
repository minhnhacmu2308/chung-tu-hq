// Mã xác thực một lần theo thời gian (TOTP, RFC 6238: HMAC-SHA1, bước 30 giây, 6 chữ số) cho 2FA của tài khoản quản trị.
// Thuần: không đọc giờ hệ thống, không sinh ngẫu nhiên – nhận `now` và byte bí mật qua tham số.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SEC = 30;
export const TOTP_DIGITS = 6;

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("Khóa base32 không hợp lệ");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Mã HOTP cho bộ đếm (RFC 4226). */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0xf;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export const totpCounter = (now: Date) => Math.floor(now.getTime() / 1000 / TOTP_STEP_SEC);
export const totp = (secret: Buffer, now: Date, digits = TOTP_DIGITS) => hotp(secret, totpCounter(now), digits);

/**
 * Kiểm mã: chấp nhận lệch ±1 bước (đồng hồ điện thoại lệch tới ~30 giây). Trả bộ đếm khớp để chống dùng lại mã
 * (`lastCounter`: bộ đếm đã dùng gần nhất – mã ở bộ đếm ≤ đó bị từ chối).
 */
export function verifyTotp(secret: Buffer, code: string, now: Date, lastCounter: number | null = null): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const base = totpCounter(now);
  for (const counter of [base, base - 1, base + 1]) {
    if (lastCounter !== null && counter <= lastCounter) continue;
    const expected = Buffer.from(hotp(secret, counter));
    if (timingSafeEqual(expected, Buffer.from(c))) return counter;
  }
  return null;
}

/** URI cho ứng dụng xác thực (Google/Microsoft Authenticator…) – dùng để vẽ mã QR. */
export function otpauthUri(secretB32: string, account: string, issuer = "KhaiBáo AI Quản trị"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SEC}`;
}

/** Mã khôi phục dạng "abcd-efgh" từ byte ngẫu nhiên; lưu bằng hash. */
export function recoveryCodesFrom(random: Buffer, count = 8): string[] {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: count }, (_, i) => {
    const chunk = random.subarray(i * 8, i * 8 + 8);
    const s = Array.from(chunk, (b) => alphabet[b % alphabet.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}
export const hashRecoveryCode = (code: string) => createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
