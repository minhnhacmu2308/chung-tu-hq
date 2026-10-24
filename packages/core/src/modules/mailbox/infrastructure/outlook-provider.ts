// Outlook / Microsoft 365 qua Microsoft Graph – OAuth 2.0 (Microsoft identity platform v2) quyền Mail.Read. Gọi bằng fetch.
import { DEFAULT_MAIL_FILTERS, type MailFilters } from "@kb/contracts";
import { z } from "zod";
import { systemClock, type Clock } from "../../../shared/clock.js";
import { matchesMailFilters } from "../domain/filters.js";
import { MailAuthError, type MailProviderAdapter, type MailTokens, type RemoteMessage } from "../application/ports.js";
import { MailHttp, toTokens, type HttpOpts } from "./oauth-http.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPE = "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read openid email";
/** Trần số trang đọc mỗi lần lấy (50 email/trang) – email không khớp từ khóa vẫn tốn trang. */
const MAX_PAGES = 20;

const TokenResponse = z.object({ access_token: z.string(), refresh_token: z.string().optional(), expires_in: z.number() });
const Me = z.object({ mail: z.string().nullish(), userPrincipalName: z.string() });
const GraphMessage = z.object({
  id: z.string(),
  subject: z.string().nullish(),
  bodyPreview: z.string().nullish(),
  receivedDateTime: z.string(),
  from: z.object({ emailAddress: z.object({ name: z.string().nullish(), address: z.string().nullish() }) }).nullish(),
  attachments: z
    .array(z.object({ "@odata.type": z.string().optional(), id: z.string(), name: z.string().nullish(), contentType: z.string().nullish(), size: z.number().nullish(), isInline: z.boolean().nullish() }))
    .optional(),
});
const MessagesPage = z.object({ value: z.array(GraphMessage), "@odata.nextLink": z.string().optional() });
const AttachmentResponse = z.object({ contentBytes: z.string() });

/** Mốc lọc của Graph: ISO UTC không phần nghìn giây. */
const isoSeconds = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, "Z");

export class OutlookProvider implements MailProviderAdapter {
  readonly provider = "OUTLOOK" as const;
  readonly configured: boolean;
  private http: MailHttp;
  private tenant: string;
  constructor(private cfg: { clientId?: string | undefined; clientSecret?: string | undefined; tenant?: string | undefined; clock?: Clock } & HttpOpts) {
    this.configured = !!cfg.clientId && !!cfg.clientSecret;
    this.tenant = cfg.tenant || "common";
    this.http = new MailHttp(cfg);
  }
  private get clock() {
    return this.cfg.clock ?? systemClock;
  }
  private get tokenUrl() {
    return `https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0/token`;
  }

  authorizeUrl(state: string, redirectUri: string): string {
    const q = new URLSearchParams({ client_id: this.cfg.clientId ?? "", response_type: "code", redirect_uri: redirectUri, response_mode: "query", scope: SCOPE, state, prompt: "select_account" });
    return `https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0/authorize?${q.toString()}`;
  }

  async exchangeCode(code: string, redirectUri: string) {
    const t = await this.http.token(
      this.tokenUrl,
      { client_id: this.cfg.clientId ?? "", client_secret: this.cfg.clientSecret ?? "", code, redirect_uri: redirectUri, grant_type: "authorization_code", scope: SCOPE },
      TokenResponse,
    );
    const tokens = toTokens(t, this.clock.now());
    const me = await this.http.get(`${GRAPH}/me?$select=mail,userPrincipalName`, tokens.accessToken, Me, "graph me");
    return { tokens, email: me.mail || me.userPrincipalName };
  }

  /** Microsoft xoay vòng refresh token: lưu token mới nếu có, không thì giữ token cũ. */
  async refresh(tokens: MailTokens): Promise<MailTokens> {
    if (!tokens.refreshToken) throw new MailAuthError("no refresh token");
    const t = await this.http.token(
      this.tokenUrl,
      { client_id: this.cfg.clientId ?? "", client_secret: this.cfg.clientSecret ?? "", refresh_token: tokens.refreshToken, grant_type: "refresh_token", scope: SCOPE },
      TokenResponse,
    );
    return toTokens(t, this.clock.now(), tokens.refreshToken);
  }

  /**
   * Graph lọc sẵn theo mốc + có file đính kèm, cũ nhất trước (thuộc tính trong $orderby phải đứng đầu $filter);
   * bộ lọc (người gửi, từ khóa, từ loại trừ) kiểm phía mình trên tiêu đề + xem trước nội dung + tên file (Graph không cho $search cùng $filter).
   */
  async listMessages(tokens: MailTokens, since: Date, limit: number, filters: MailFilters = DEFAULT_MAIL_FILTERS): Promise<RemoteMessage[]> {
    const params = [
      ["$filter", `receivedDateTime ge ${isoSeconds(since)} and hasAttachments eq true`],
      ["$orderby", "receivedDateTime asc"],
      ["$top", "50"],
      ["$select", "id,subject,from,receivedDateTime,bodyPreview"],
      ["$expand", "attachments($select=id,name,contentType,size,isInline)"],
    ];
    let url: string | undefined = `${GRAPH}/me/messages?${params.map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&")}`;
    const out: RemoteMessage[] = [];
    for (let page = 0; url && page < MAX_PAGES && out.length < limit; page++) {
      const res: z.infer<typeof MessagesPage> = await this.http.get(url, tokens.accessToken, MessagesPage, "graph messages");
      for (const m of res.value) {
        const receivedAt = new Date(m.receivedDateTime);
        if (Number.isNaN(receivedAt.getTime()) || receivedAt < since) continue;
        const attachments = (m.attachments ?? [])
          .filter((a) => !a.isInline && (!a["@odata.type"] || a["@odata.type"] === "#microsoft.graph.fileAttachment") && a.name)
          .map((a) => ({ id: a.id, fileName: a.name!, mime: a.contentType || "application/octet-stream", size: a.size ?? 0 }));
        if (!attachments.length) continue;
        const subject = m.subject ?? "";
        const snippet = m.bodyPreview ?? "";
        const address = (m.from?.emailAddress.address ?? "").toLowerCase();
        if (!matchesMailFilters({ fromEmail: address, subject, snippet, fileNames: attachments.map((a) => a.fileName) }, filters)) continue;
        out.push({ id: m.id, fromName: m.from?.emailAddress.name || address, fromEmail: address, subject, snippet, receivedAt, attachments });
      }
      url = res["@odata.nextLink"];
    }
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()).slice(0, limit);
  }

  async getAttachment(tokens: MailTokens, messageId: string, attachmentId: string): Promise<Buffer> {
    const a = await this.http.get(`${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, tokens.accessToken, AttachmentResponse, "graph attachment");
    return Buffer.from(a.contentBytes, "base64");
  }
}
