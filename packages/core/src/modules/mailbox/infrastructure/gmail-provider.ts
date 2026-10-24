// Gmail API (REST) – OAuth 2.0 quyền gmail.readonly. Không dùng SDK: chỉ vài endpoint, gọi bằng fetch.
import { DEFAULT_MAIL_FILTERS, type MailFilters } from "@kb/contracts";
import { z } from "zod";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { effectiveKeywords, matchesMailFilters } from "../domain/filters.js";
import { MailAuthError, type MailProviderAdapter, type MailTokens, type RemoteAttachment, type RemoteMessage } from "../application/ports.js";
import { mapLimit, MailHttp, toTokens, type HttpOpts } from "./oauth-http.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly openid email";
/** Trần số email đọc mã mỗi lần lấy (Gmail trả mới nhất trước, mỗi trang tối đa 100). */
const MAX_IDS = 500;

const TokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number() });
const Profile = z.object({ emailAddress: z.string() });
const ListResponse = z.object({ messages: z.array(z.object({ id: z.string() })).optional(), nextPageToken: z.string().optional() });
type Part = { filename?: string | undefined; mimeType?: string | undefined; headers?: { name: string; value: string }[] | undefined; body?: { attachmentId?: string | undefined; size?: number | undefined } | undefined; parts?: Part[] | undefined };
const PartSchema: z.ZodType<Part> = z.lazy(() =>
  z.object({
    filename: z.string().optional(),
    mimeType: z.string().optional(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    body: z.object({ attachmentId: z.string().optional(), size: z.number().optional() }).optional(),
    parts: z.array(PartSchema).optional(),
  }),
);
const MessageResponse = z.object({ id: z.string(), snippet: z.string().optional(), internalDate: z.string().optional(), payload: PartSchema });
const AttachmentResponse = z.object({ data: z.string() });

const quote = (k: string) => (/[\s/@"]/.test(k) ? `"${k.replace(/"/g, "")}"` : k);

/**
 * Câu truy vấn Gmail: có file đính kèm, sau mốc, từ người gửi trong danh sách, khớp một trong các từ khóa (Gmail tìm cả nội dung),
 * có file đúng loại. Phạm vi "chỉ tiêu đề + tên file" và từ loại trừ kiểm lại phía mình (matchesMailFilters).
 */
export function gmailQuery(since: Date, filters: MailFilters = DEFAULT_MAIL_FILTERS): string {
  const parts = [`has:attachment after:${Math.floor(since.getTime() / 1000)}`];
  if (filters.senders.length) parts.push(`from:(${filters.senders.map((s) => quote(s.replace(/^@/, ""))).join(" OR ")})`);
  const kw = effectiveKeywords(filters);
  if (kw?.length) parts.push(`{${[...new Set(kw)].map(quote).join(" ")}}`);
  parts.push(`filename:(${filters.extensions.join(" OR ")})`);
  return parts.join(" ");
}

/** "Tên <a@b.c>" → tên + email (tên bỏ ngoặc kép). */
export function parseFrom(v: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  if (m) return { name: m[1]!.trim() || m[2]!.trim(), email: m[2]!.trim().toLowerCase() };
  return { name: v.trim(), email: v.trim().toLowerCase() };
}

const header = (p: Part, name: string) => p.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

/** File đính kèm thật: có tên + attachmentId; bỏ ảnh nhúng trong nội dung (inline có Content-ID). */
function collectAttachments(p: Part, out: RemoteAttachment[] = []): RemoteAttachment[] {
  const inlineEmbedded = /^inline/i.test(header(p, "Content-Disposition")) && !!header(p, "Content-ID");
  if (p.filename && p.body?.attachmentId && !inlineEmbedded) {
    out.push({ id: p.body.attachmentId, fileName: p.filename, mime: p.mimeType || "application/octet-stream", size: p.body.size ?? 0 });
  }
  for (const c of p.parts ?? []) collectAttachments(c, out);
  return out;
}

export class GmailProvider implements MailProviderAdapter {
  readonly provider = "GMAIL" as const;
  readonly configured: boolean;
  private http: MailHttp;
  constructor(private cfg: { clientId?: string | undefined; clientSecret?: string | undefined; clock?: Clock } & HttpOpts) {
    this.configured = !!cfg.clientId && !!cfg.clientSecret;
    this.http = new MailHttp(cfg);
  }
  private get clock() {
    return this.cfg.clock ?? systemClock;
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const q = new URLSearchParams({
      client_id: this.cfg.clientId ?? "", redirect_uri: redirectUri, response_type: "code", scope: SCOPE, state,
      // offline + consent: Google chỉ trả refresh token khi người dùng đồng ý lại.
      access_type: "offline", prompt: "consent", include_granted_scopes: "true",
    });
    return `${AUTH_URL}?${q.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const t = await this.http.token(TOKEN_URL, { code, client_id: this.cfg.clientId ?? "", client_secret: this.cfg.clientSecret ?? "", redirect_uri: redirectUri, grant_type: "authorization_code" }, TokenResponse);
    const tokens = toTokens(t, this.clock.now());
    const profile = await this.http.get(`${API}/profile`, tokens.accessToken, Profile, "gmail profile");
    return { tokens, email: profile.emailAddress };
  }

  async refresh(tokens: MailTokens): Promise<MailTokens> {
    if (!tokens.refreshToken) throw new MailAuthError("no refresh token");
    const t = await this.http.token(TOKEN_URL, { refresh_token: tokens.refreshToken, client_id: this.cfg.clientId ?? "", client_secret: this.cfg.clientSecret ?? "", grant_type: "refresh_token" }, TokenResponse);
    return toTokens(t, this.clock.now(), tokens.refreshToken);
  }

  async listMessages(tokens: MailTokens, since: Date, limit: number, filters: MailFilters = DEFAULT_MAIL_FILTERS): Promise<RemoteMessage[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ q: gmailQuery(since, filters), maxResults: "100", ...(pageToken ? { pageToken } : {}) });
      const page = await this.http.get(`${API}/messages?${q.toString()}`, tokens.accessToken, ListResponse, "gmail list");
      ids.push(...(page.messages ?? []).map((m) => m.id));
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_IDS);
    // Gmail trả mới nhất trước → đảo lại để đọc chi tiết từ cũ nhất, dừng khi đủ `limit`.
    const ordered = ids.slice(0, MAX_IDS).reverse();
    const out: RemoteMessage[] = [];
    for (let i = 0; i < ordered.length && out.length < limit; i += 10) {
      const batch = await mapLimit(ordered.slice(i, i + 10), 5, (id) => this.getMessage(tokens, id));
      for (const m of batch) {
        if (!m || m.receivedAt < since || !m.attachments.length) continue;
        const fileNames = m.attachments.map((a) => a.fileName);
        if (matchesMailFilters({ ...m, fileNames }, filters, { fullTextMatched: true })) out.push(m);
      }
    }
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()).slice(0, limit);
  }

  private async getMessage(tokens: MailTokens, id: string): Promise<RemoteMessage | null> {
    const m = await this.http.get(`${API}/messages/${encodeURIComponent(id)}?format=full`, tokens.accessToken, MessageResponse, "gmail message");
    const date = m.internalDate ? new Date(Number(m.internalDate)) : new Date(header(m.payload, "Date"));
    if (Number.isNaN(date.getTime())) return null;
    const from = parseFrom(header(m.payload, "From"));
    return { id: m.id, fromName: from.name, fromEmail: from.email, subject: header(m.payload, "Subject"), snippet: m.snippet ?? "", receivedAt: date, attachments: collectAttachments(m.payload) };
  }

  async getAttachment(tokens: MailTokens, messageId: string, attachmentId: string): Promise<Buffer> {
    const a = await this.http.get(`${API}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, tokens.accessToken, AttachmentResponse, "gmail attachment");
    return Buffer.from(a.data, "base64url");
  }
}
