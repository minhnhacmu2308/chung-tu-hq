import { describe, expect, it } from "vitest";
import { AesSecretStore } from "./aes-secret-store.js";

const key = Buffer.alloc(32, 9).toString("base64");

describe("AesSecretStore", () => {
  it("mã hóa/giải mã round-trip; hai lần mã hóa cho ciphertext khác nhau (iv ngẫu nhiên)", () => {
    const s = new AesSecretStore(key);
    const a = s.encrypt("USER_ID=abc;PASSWORD=xyz");
    const b = s.encrypt("USER_ID=abc;PASSWORD=xyz");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.keyVersion).toBe(1);
    expect(s.decrypt(a.ciphertext, a.keyVersion)).toBe("USER_ID=abc;PASSWORD=xyz");
  });
  it("ciphertext bị sửa → ném lỗi, không trả rác", () => {
    const s = new AesSecretStore(key);
    const { ciphertext } = s.encrypt("bí mật");
    const tampered = ciphertext.slice(0, -4) + "AAAA";
    expect(() => s.decrypt(tampered, 1)).toThrow();
  });
  it("khóa không phải 32 byte → ném lỗi khi khởi tạo", () => {
    expect(() => new AesSecretStore(Buffer.alloc(16).toString("base64"))).toThrow(/32 byte/);
  });
});
