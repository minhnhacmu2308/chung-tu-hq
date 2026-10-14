import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, hashRecoveryCode, hotp, otpauthUri, recoveryCodesFrom, totp, verifyTotp } from "../totp.js";

// RFC 6238 phụ lục B – khóa ASCII "12345678901234567890", SHA1, 8 chữ số.
const RFC_SECRET = Buffer.from("12345678901234567890");

describe("TOTP (RFC 6238)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("t=%i → %s (bộ số mẫu của RFC)", (t, code) => {
    expect(totp(RFC_SECRET, new Date(t * 1000), 8)).toBe(code);
  });

  it("HOTP RFC 4226: bộ đếm 0..2", () => {
    expect([0, 1, 2].map((c) => hotp(RFC_SECRET, c))).toEqual(["755224", "287082", "359152"]);
  });

  it("base32 hai chiều; khóa sai ký tự → lỗi", () => {
    expect(base32Encode(RFC_SECRET)).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode("gezd gnbv-gy3tqojq gezdgnbvgy3tqojq")).toEqual(RFC_SECRET);
    expect(() => base32Decode("1!")).toThrow();
  });

  it("kiểm mã: đúng bước hiện tại hoặc lệch ±1 bước; lệch 2 bước, sai dạng, dùng lại mã cũ → từ chối", () => {
    const now = new Date(1_760_400_000_000);
    const code = (dt: number) => totp(RFC_SECRET, new Date(now.getTime() + dt * 1000));
    const counter = verifyTotp(RFC_SECRET, code(0), now);
    expect(counter).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code(-30), now)).toBe(counter! - 1);
    expect(verifyTotp(RFC_SECRET, code(30), now)).toBe(counter! + 1);
    expect(verifyTotp(RFC_SECRET, code(-90), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code(0), now, counter)).toBeNull(); // chống dùng lại
    expect(verifyTotp(RFC_SECRET, ` ${code(0).slice(0, 3)} ${code(0).slice(3)} `, now)).toBe(counter);
  });

  it("URI cho ứng dụng xác thực; mã khôi phục 8 mã dạng xxxx-xxxx, hash không phân biệt hoa thường", () => {
    expect(otpauthUri("ABC", "bao@x.vn")).toBe("otpauth://totp/KhaiB%C3%A1o%20AI%20Qu%E1%BA%A3n%20tr%E1%BB%8B%3Abao%40x.vn?secret=ABC&issuer=KhaiB%C3%A1o%20AI%20Qu%E1%BA%A3n%20tr%E1%BB%8B&algorithm=SHA1&digits=6&period=30");
    const codes = recoveryCodesFrom(Buffer.from(Array.from({ length: 64 }, (_, i) => i * 7)));
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    codes.forEach((c) => expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/));
    expect(hashRecoveryCode(" ABCD-efgh ")).toBe(hashRecoveryCode("abcd-efgh"));
  });
});
