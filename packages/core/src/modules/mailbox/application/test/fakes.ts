import type { DocKind, MailFilters, MailProvider } from "@kb/contracts";
import type { Ctx } from "../../../../shared/ctx.js";
import { domainError } from "../../../../shared/errors.js";
import { err, ok, type Result } from "../../../../shared/result.js";
import type { SuggestDossier } from "../../domain/suggest.js";
import { MailAuthError, type BlobStore, type Cipher, type DossierIntake, type MailProviderAdapter, type MailTokens, type OAuthState, type RemoteMessage, type StateSigner } from "../ports.js";

/** Hộp thư giả có thể lập trình: danh sách email + nội dung file; `revoked` → MailAuthError. */
export class FakeMailProvider implements MailProviderAdapter {
  messages: (RemoteMessage & { files?: Record<string, Buffer> })[] = [];
  revoked = false;
  failList = false;
  refreshed = 0;
  calls: { since: Date; limit: number; filters: MailFilters }[] = [];
  constructor(readonly provider: MailProvider, readonly configured = true, private email = "ops@anphat.vn") {}
  authorizeUrl(state: string, redirectUri: string) {
    return `https://auth.example/${this.provider}?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }
  async exchangeCode(code: string) {
    if (code === "bad") throw new Error("invalid_grant");
    return { email: this.email, tokens: { accessToken: `at-${code}`, refreshToken: code === "no-refresh" ? null : `rt-${code}`, expiresAt: "2026-10-22T04:00:00.000Z" } };
  }
  async refresh(t: MailTokens) {
    if (this.revoked) throw new MailAuthError();
    this.refreshed++;
    return { ...t, accessToken: `${t.accessToken}+`, expiresAt: "2026-10-22T05:00:00.000Z" };
  }
  async listMessages(_t: MailTokens, since: Date, limit: number, filters: MailFilters) {
    if (this.revoked) throw new MailAuthError();
    if (this.failList) throw new Error("503");
    this.calls.push({ since, limit, filters });
    return this.messages.filter((m) => m.receivedAt >= since).sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()).slice(0, limit);
  }
  async getAttachment(_t: MailTokens, messageId: string, attachmentId: string) {
    const m = this.messages.find((x) => x.id === messageId);
    return m?.files?.[attachmentId] ?? Buffer.from(`%PDF-1.4 ${messageId}/${attachmentId}`);
  }
}

export class FakeStateSigner implements StateSigner {
  sign(s: OAuthState) {
    return `${Buffer.from(JSON.stringify(s)).toString("base64url")}.sig`;
  }
  verify(token: string) {
    const [body, sig] = token.split(".");
    if (sig !== "sig" || !body) return null;
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState;
  }
}

export const fakeCipher: Cipher = {
  encrypt: (plain) => ({ ciphertext: `enc:${Buffer.from(plain).toString("base64")}`, keyVersion: 1 }),
  decrypt: (c) => Buffer.from(c.replace(/^enc:/, ""), "base64").toString("utf8"),
};

export class MemoryBlobStore implements BlobStore {
  readonly objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async get(key: string) {
    const b = this.objects.get(key);
    if (!b) throw new Error(`missing ${key}`);
    return b;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

export class FakeDossierIntake implements DossierIntake {
  added: { dossierId: string; names: string[]; by: string }[] = [];
  constructor(public dossiers: (SuggestDossier & { orgId: string })[] = []) {}
  async list(orgId: string) {
    return this.dossiers.filter((d) => d.orgId === orgId);
  }
  async addFiles(ctx: Ctx, dossierId: string, files: { name: string }[]): Promise<Result<{ added: number }>> {
    const d = this.dossiers.find((x) => x.id === dossierId && x.orgId === ctx.orgId);
    if (!d) return err(domainError("NOT_FOUND", "Không tìm thấy hồ sơ"));
    if (d.status === "APPROVED") return err(domainError("DOSSIER_LOCKED", "Hồ sơ đã khóa"));
    this.added.push({ dossierId, names: files.map((f) => f.name), by: ctx.userId });
    return ok({ added: files.length });
  }
  guessKind(fileName: string): DocKind {
    return /invoice/i.test(fileName) ? "INVOICE" : /packing/i.test(fileName) ? "PACKING_LIST" : "OTHER";
  }
}
