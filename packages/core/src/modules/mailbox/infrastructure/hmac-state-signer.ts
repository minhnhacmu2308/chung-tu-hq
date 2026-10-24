import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { MailProviderSchema } from "@kb/contracts";
import { z } from "zod";
import type { OAuthState, StateSigner } from "../application/ports.js";

const StateSchema = z.object({ orgId: z.string().min(1), userId: z.string().min(1), provider: MailProviderSchema, exp: z.number(), nonce: z.string().min(1) });

/**
 * `state` OAuth = base64url(JSON).base64url(HMAC-SHA256). Khóa ký dẫn xuất (HKDF) từ APP_MASTER_KEY với nhãn riêng
 * → không dùng lại khóa mã hóa token. Hạn dùng (`exp`) do use case kiểm tra.
 */
export class HmacStateSigner implements StateSigner {
  private key: Buffer;
  constructor(masterKeyBase64: string) {
    this.key = Buffer.from(hkdfSync("sha256", Buffer.from(masterKeyBase64, "base64"), Buffer.alloc(0), "mailbox-oauth-state", 32));
  }
  private mac(body: string) {
    return createHmac("sha256", this.key).update(body).digest();
  }
  sign(state: OAuthState): string {
    const body = Buffer.from(JSON.stringify(state)).toString("base64url");
    return `${body}.${this.mac(body).toString("base64url")}`;
  }
  /** Sai chữ ký / sai định dạng → null (không ném). */
  verify(token: string): OAuthState | null {
    try {
      const [body, sig, extra] = token.split(".");
      if (!body || !sig || extra !== undefined) return null;
      const expected = this.mac(body);
      const given = Buffer.from(sig, "base64url");
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
      const parsed = StateSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as unknown);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
