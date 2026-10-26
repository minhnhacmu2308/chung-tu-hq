export const PASSWORD_MIN = 8;
export const isPasswordAcceptable = (p: string) => p.length >= PASSWORD_MIN && p.length <= 128;

/** Bỏ ký tự dễ nhầm (0/O, 1/l/I) – mật khẩu tạm được đọc / gõ lại qua điện thoại, Zalo. */
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Mật khẩu tạm 12 ký tự ngẫu nhiên (≈ 70 bit) cho tài khoản quản trị tạo hộ – người dùng bắt buộc đổi ở lần đăng nhập đầu. */
export function generateTempPassword(random: (n: number) => Buffer, length = 12): string {
  const bytes = random(length * 2);
  let out = "";
  // Loại bỏ giá trị lệch (rejection sampling) để mọi ký tự đều xác suất như nhau.
  const limit = 256 - (256 % TEMP_ALPHABET.length);
  for (const b of bytes) {
    if (b >= limit) continue;
    out += TEMP_ALPHABET[b % TEMP_ALPHABET.length];
    if (out.length === length) return out;
  }
  return out + generateTempPassword(random, length - out.length);
}
