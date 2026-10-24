import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../../shared/clock.js";
import { MailAuthError, type MailTokens } from "../application/ports.js";
import { GmailProvider, gmailQuery, parseFrom } from "./gmail-provider.js";

const tokens: MailTokens = { accessToken: "at", refreshToken: "rt", expiresAt: "2026-10-22T04:00:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const gmail = () => new GmailProvider({ clientId: "cid", clientSecret: "sec", clock: fixedClock("2026-10-22T03:00:00Z") });

/** Thay fetch toàn cục bằng bảng định tuyến theo đường dẫn; ghi lại các URL đã gọi. */
function stubFetch(route: (url: URL, init?: RequestInit) => Response) {
  const calls: { url: URL; init?: RequestInit | undefined }[] = [];
  vi.stubGlobal("fetch", async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, init });
    return route(url, init);
  });
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

const msg = (id: string, internalDate: string, parts: unknown[], from = '"Sao Viet Logistics" <OPS@saoviet.vn>') => ({
  id, snippet: `snippet ${id}`, internalDate,
  payload: { mimeType: "multipart/mixed", headers: [{ name: "From", value: from }, { name: "Subject", value: `Invoice ${id}` }, { name: "Date", value: "Wed, 21 Oct 2026 10:00:00 +0700" }], parts },
});
const pdfPart = (name: string, attId: string) => ({ filename: name, mimeType: "application/pdf", body: { attachmentId: attId, size: 1200 }, headers: [{ name: "Content-Disposition", value: `attachment; filename="${name}"` }] });

describe("GmailProvider", () => {
  it("configured chỉ khi có client id + secret; URL đồng ý xin gmail.readonly + offline", () => {
    expect(new GmailProvider({}).configured).toBe(false);
    expect(new GmailProvider({ clientId: "cid" }).configured).toBe(false);
    const u = new URL(gmail().authorizeUrl("st.sig", "https://app.vn/api/mailbox/oauth/callback"));
    expect(u.origin + u.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: "cid", redirect_uri: "https://app.vn/api/mailbox/oauth/callback", response_type: "code", state: "st.sig", access_type: "offline", prompt: "consent", include_granted_scopes: "true",
      scope: "https://www.googleapis.com/auth/gmail.readonly openid email",
    });
  });

  it("đổi code lấy token + email hộp thư; refresh giữ refresh token cũ; invalid_grant → MailAuthError", async () => {
    const calls = stubFetch((url, init) => {
      if (url.href === "https://oauth2.googleapis.com/token") {
        const form = new URLSearchParams(String(init?.body));
        if (form.get("grant_type") === "refresh_token") return form.get("refresh_token") === "revoked" ? json({ error: "invalid_grant" }, 400) : json({ access_token: "at2", expires_in: 3599 });
        expect(Object.fromEntries(form)).toMatchObject({ code: "c1", client_id: "cid", client_secret: "sec", grant_type: "authorization_code", redirect_uri: "https://app.vn/cb" });
        return json({ access_token: "at1", refresh_token: "rt1", expires_in: 3600, id_token: "x" });
      }
      if (url.pathname === "/gmail/v1/users/me/profile") return json({ emailAddress: "chungtu@anphat.vn" });
      return json({}, 404);
    });
    const g = gmail();
    expect(await g.exchangeCode("c1", "https://app.vn/cb")).toEqual({ email: "chungtu@anphat.vn", tokens: { accessToken: "at1", refreshToken: "rt1", expiresAt: "2026-10-22T04:00:00.000Z" } });
    expect(calls[1]!.init?.headers).toMatchObject({ authorization: "Bearer at1" });
    expect(await g.refresh(tokens)).toEqual({ accessToken: "at2", refreshToken: "rt", expiresAt: "2026-10-22T03:59:59.000Z" });
    await expect(g.refresh({ ...tokens, refreshToken: "revoked" })).rejects.toBeInstanceOf(MailAuthError);
    await expect(g.refresh({ ...tokens, refreshToken: null })).rejects.toBeInstanceOf(MailAuthError);
  });

  it("câu truy vấn: có file, sau mốc (giây), từ khóa (cụm có khoảng trắng / '/' đặt trong ngoặc kép), đuôi file", () => {
    const q = gmailQuery(new Date("2026-10-01T00:00:00Z"));
    expect(q).toMatch(/^has:attachment after:1790812800 \{invoice /);
    expect(q).toContain('"bill of lading"');
    expect(q).toContain('"b/l"');
    expect(q).toContain("filename:(pdf OR png OR jpg OR jpeg OR zip)");
  });

  it("lấy email: phân trang mã, đọc chi tiết, chỉ file đính kèm thật, bỏ email trước mốc, cũ nhất trước, cắt theo limit", async () => {
    const since = new Date("2026-10-20T00:00:00Z");
    const calls = stubFetch((url) => {
      if (url.pathname.endsWith("/messages") && !url.searchParams.get("pageToken")) return json({ messages: [{ id: "m4" }, { id: "m3" }], nextPageToken: "p2" });
      if (url.pathname.endsWith("/messages")) return json({ messages: [{ id: "m2" }, { id: "m1" }] });
      const id = url.pathname.split("/").pop();
      if (id === "m1") return json(msg("m1", String(Date.parse("2026-10-19T23:59:59Z")), [pdfPart("old.pdf", "a0")])); // trước mốc
      if (id === "m2") return json(msg("m2", String(Date.parse("2026-10-20T08:00:00Z")), [{ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { size: 10 } }] }, pdfPart("INV-01.pdf", "a1")]));
      if (id === "m3")
        return json(
          msg("m3", String(Date.parse("2026-10-21T08:00:00Z")), [
            { mimeType: "multipart/related", parts: [{ filename: "logo.png", mimeType: "image/png", body: { attachmentId: "inline1", size: 300 }, headers: [{ name: "Content-Disposition", value: "inline" }, { name: "Content-ID", value: "<logo>" }] }] },
            pdfPart("BL.pdf", "a2"),
          ], "kho@saoviet.vn"),
        );
      if (id === "m4") return json(msg("m4", String(Date.parse("2026-10-22T01:00:00Z")), [pdfPart("CO.pdf", "a3")]));
      return json({}, 404);
    });
    const list = await gmail().listMessages(tokens, since, 2);
    expect(list.map((m) => m.id)).toEqual(["m2", "m3"]);
    expect(list[0]).toMatchObject({ fromName: "Sao Viet Logistics", fromEmail: "ops@saoviet.vn", subject: "Invoice m2", snippet: "snippet m2", receivedAt: new Date("2026-10-20T08:00:00Z") });
    expect(list[0]!.attachments).toEqual([{ id: "a1", fileName: "INV-01.pdf", mime: "application/pdf", size: 1200 }]);
    expect(list[1]).toMatchObject({ fromName: "kho@saoviet.vn", fromEmail: "kho@saoviet.vn", attachments: [{ id: "a2", fileName: "BL.pdf" }] });
    const first = calls[0]!.url;
    expect(first.searchParams.get("q")).toContain(`after:${since.getTime() / 1000}`);
    expect(calls.filter((c) => c.url.searchParams.get("format") === "full").length).toBeGreaterThanOrEqual(3);
  });

  it("tải file đính kèm: giải base64url; 401 → MailAuthError", async () => {
    stubFetch((url) => (url.pathname.endsWith("/attachments/a1") ? json({ data: Buffer.from("%PDF-1.4 ok").toString("base64url"), size: 11 }) : json({ error: { code: 401 } }, 401)));
    expect((await gmail().getAttachment(tokens, "m1", "a1")).toString()).toBe("%PDF-1.4 ok");
    await expect(gmail().getAttachment(tokens, "m1", "a2")).rejects.toBeInstanceOf(MailAuthError);
    await expect(gmail().listMessages(tokens, new Date(), 10)).rejects.toBeInstanceOf(MailAuthError);
  });

  it("parseFrom", () => {
    expect(parseFrom('"Nguyễn Văn A" <A@X.VN>')).toEqual({ name: "Nguyễn Văn A", email: "a@x.vn" });
    expect(parseFrom("<a@x.vn>")).toEqual({ name: "a@x.vn", email: "a@x.vn" });
    expect(parseFrom("a@x.vn")).toEqual({ name: "a@x.vn", email: "a@x.vn" });
  });
});
