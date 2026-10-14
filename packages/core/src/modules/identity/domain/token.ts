import { createHash, randomBytes } from "node:crypto";

/** Token gửi cho người dùng (raw) và bản lưu DB (sha256 hex). */
export function newToken(random: (n: number) => Buffer = randomBytes): { raw: string; hash: string } {
  const raw = random(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export const hashToken = (raw: string) => createHash("sha256").update(raw).digest("hex");

export type AuthTokenKind = "VERIFY_EMAIL" | "RESET_PASSWORD" | "INVITE";
const HOUR = 3_600_000;
export const TOKEN_TTL_MS: Record<AuthTokenKind, number> = { VERIFY_EMAIL: 72 * HOUR, RESET_PASSWORD: 1 * HOUR, INVITE: 7 * 24 * HOUR };
