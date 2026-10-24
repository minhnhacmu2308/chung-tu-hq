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
  it("vòng khóa: mã hóa bằng phiên bản mới nhất, giải mã được dữ liệu cũ theo key_version, phiên bản không nạp → lỗi rõ; reencrypt chuyển sang khóa mới", () => {
    const k1 = Buffer.alloc(32, 1).toString("base64");
    const k2 = Buffer.alloc(32, 2).toString("base64");
    const old = new AesSecretStore(k1);
    const legacy = old.encrypt("USER_ID=abc");
    const ring = AesSecretStore.fromEnv({ APP_MASTER_KEY: k1, APP_MASTER_KEYS: `v2:${k2}` });
    expect(ring.versions()).toEqual([1, 2]);
    expect(ring.currentVersion).toBe(2);
    expect(ring.encrypt("x").keyVersion).toBe(2);
    expect(ring.decrypt(legacy.ciphertext, 1)).toBe("USER_ID=abc");
    const rotated = ring.reencrypt(legacy.ciphertext, 1);
    expect(rotated).toMatchObject({ keyVersion: 2, changed: true });
    expect(ring.decrypt(rotated.ciphertext, 2)).toBe("USER_ID=abc");
    expect(ring.reencrypt(rotated.ciphertext, 2).changed).toBe(false);
    // Đã gỡ v1 khỏi vòng mà còn dữ liệu v1 → lỗi nêu phiên bản thiếu (không trả rác).
    const onlyV2 = new AesSecretStore({ current: 2, keys: new Map([[2, k2]]) });
    expect(() => onlyV2.decrypt(legacy.ciphertext, 1)).toThrow(/phiên bản 1.*APP_MASTER_KEYS/);
    expect(() => new AesSecretStore({ current: 3, keys: new Map([[2, k2]]) })).toThrow(/v3/);
  });
});
