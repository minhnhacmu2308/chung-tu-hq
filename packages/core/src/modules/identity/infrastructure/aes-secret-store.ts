import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { masterKeyRing, type Env } from "../../../config/env.js";
import type { SecretStore } from "../application/ports.js";

/**
 * AES-256-GCM; ciphertext = base64(iv(12) | tag(16) | data). Vòng khóa nhiều phiên bản: mã hóa bằng phiên bản mới nhất,
 * giải mã theo `keyVersion` lưu cùng dòng → thêm khóa mới (APP_MASTER_KEYS) không làm dữ liệu cũ bất khả dụng; chạy
 * `secrets:rotate` để mã hóa lại rồi mới gỡ khóa cũ.
 */
export class AesSecretStore implements SecretStore {
  private keys = new Map<number, Buffer>();
  readonly currentVersion: number;

  /** Một khóa (tương thích cũ): `new AesSecretStore(base64, 1)`; hoặc vòng khóa `{ current, keys }`. */
  constructor(keyOrRing: string | { current: number; keys: Map<number, string> }, keyVersion = 1) {
    const ring = typeof keyOrRing === "string" ? { current: keyVersion, keys: new Map([[keyVersion, keyOrRing]]) } : keyOrRing;
    for (const [version, b64] of ring.keys) {
      const key = Buffer.from(b64, "base64");
      if (key.length !== 32) throw new Error(`APP_MASTER_KEY v${version} phải là base64 của 32 byte`);
      this.keys.set(version, key);
    }
    if (!this.keys.has(ring.current)) throw new Error(`Vòng khóa không có phiên bản hiện hành v${ring.current}`);
    this.currentVersion = ring.current;
  }

  static fromEnv(env: Pick<Env, "APP_MASTER_KEY" | "APP_MASTER_KEYS">): AesSecretStore {
    return new AesSecretStore(masterKeyRing(env));
  }

  /** Các phiên bản khóa đang nạp (để script xoay khóa báo cáo). */
  versions(): number[] {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }

  encrypt(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.keys.get(this.currentVersion)!, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64"), keyVersion: this.currentVersion };
  }

  decrypt(ciphertext: string, keyVersion: number) {
    const key = this.keys.get(keyVersion);
    if (!key) throw new Error(`Không có khóa phiên bản ${keyVersion} (đang nạp: ${this.versions().map((v) => `v${v}`).join(", ")}) – thêm vào APP_MASTER_KEYS`);
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  /** Giải mã bằng khóa cũ rồi mã hóa lại bằng khóa hiện hành; đã ở phiên bản hiện hành → trả nguyên. */
  reencrypt(ciphertext: string, keyVersion: number) {
    if (keyVersion === this.currentVersion) return { ciphertext, keyVersion, changed: false };
    return { ...this.encrypt(this.decrypt(ciphertext, keyVersion)), changed: true };
  }
}
