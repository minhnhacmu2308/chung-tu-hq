// JWT HS256 tối giản, cùng dạng claim với token FPT thật (ASP.NET Core JwtBearer).
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const NAME_CLAIM = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const sign = (data: string, secret: string) => createHmac("sha256", secret).update(data).digest("base64url");

export function issueToken(opts: { username: string; now: Date; ttlSeconds: number; secret: string; issuer: string }): { token: string; exp: number } {
  const exp = Math.floor(opts.now.getTime() / 1000) + opts.ttlSeconds;
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({ [NAME_CLAIM]: opts.username, jti: randomUUID(), exp, iss: opts.issuer, aud: opts.issuer }));
  return { token: `${head}.${body}.${sign(`${head}.${body}`, opts.secret)}`, exp };
}

export type TokenCheck = { ok: true; username: string } | { ok: false; reason: "missing" | "invalid" | "expired"; exp?: number };

export function verifyToken(header: string | undefined, now: Date, secret: string): TokenCheck {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!m?.[1]) return { ok: false, reason: "missing" };
  const [head, body, sig] = m[1].split(".");
  if (!head || !body || !sig) return { ok: false, reason: "invalid" };
  const expected = Buffer.from(sign(`${head}.${body}`, secret));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "invalid" };
  let claims: { exp?: unknown; [NAME_CLAIM]?: unknown };
  try { claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as typeof claims; } catch { return { ok: false, reason: "invalid" }; }
  const exp = typeof claims.exp === "number" ? claims.exp : 0;
  if (exp * 1000 <= now.getTime()) return { ok: false, reason: "expired", exp };
  return { ok: true, username: String(claims[NAME_CLAIM] ?? "") };
}
