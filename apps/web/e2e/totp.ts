// TOTP (RFC 6238) cho e2e – cùng thuật toán với packages/core/src/modules/admin/domain/totp.ts, viết lại để test không phụ thuộc mã nguồn core.
import { createHmac } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.toUpperCase().replace(/[\s=-]/g, "")) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Mã 6 số của khóa base32 tại thời điểm `at` (+ `stepOffset` bước 30 giây). */
export function totpCode(secretB32: string, stepOffset = 0, at = Date.now()): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000) + stepOffset));
  const h = createHmac("sha1", decode(secretB32)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, "0");
}
