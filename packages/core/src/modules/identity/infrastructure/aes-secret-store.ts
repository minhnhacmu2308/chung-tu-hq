import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { SecretStore } from "../application/ports.js";

/** AES-256-GCM; ciphertext = base64(iv(12) | tag(16) | data). Khóa từ APP_MASTER_KEY (base64 32 byte). */
export class AesSecretStore implements SecretStore {
  private key: Buffer;
  constructor(masterKeyBase64: string, private keyVersion = 1) {
    this.key = Buffer.from(masterKeyBase64, "base64");
    if (this.key.length !== 32) throw new Error("APP_MASTER_KEY phải là base64 của 32 byte");
  }
  encrypt(plain: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return { ciphertext: Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64"), keyVersion: this.keyVersion };
  }
  decrypt(ciphertext: string, keyVersion: number) {
    if (keyVersion !== this.keyVersion) throw new Error(`Không có khóa phiên bản ${keyVersion}`);
    const buf = Buffer.from(ciphertext, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }
}
