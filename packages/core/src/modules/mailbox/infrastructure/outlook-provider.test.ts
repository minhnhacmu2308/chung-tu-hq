import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "../../../shared/clock.js";
import { MailAuthError, type MailTokens } from "../application/ports.js";
import { OutlookProvider } from "./outlook-provider.js";

const tokens: MailTokens = { accessToken: "at", refreshToken: "rt", expiresAt: "2026-10-22T04:00:00.000Z" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const outlook = (tenant?: string) => new OutlookProvider({ clientId: "cid", clientSecret: "sec", tenant, clock: fixedClock("2026-10-22T03:00:00Z") });

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

const file = (id: string, name: string, v: Record<string, unknown> = {}) => ({ "@odata.type": "#microsoft.graph.fileAttachment", id, name, contentType: "application/pdf", size: 2048, isInline: false, ...v });
const gm = (id: string, at: string, subject: string, attachments: unknown[], preview = "") => ({
  id, subject, bodyPreview: preview, receivedDateTime: at, from: { emailAddress: { name: "Sao Viet Ops", address: "OPS@saoviet.vn" } }, attachments,
});

describe("OutlookProvider", () => {
  it("URL đồng ý theo tenant (mặc định common), xin Mail.Read + offline_access", () => {
    expect(new OutlookProvider({ clientId: "cid" }).configured).toBe(false);
    const u = new URL(outlook().authorizeUrl("st.sig", "https://app.vn/cb"));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: "cid", response_type: "code", redirect_uri: "https://app.vn/cb", state: "st.sig", response_mode: "query",
      scope: "offline_access https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/User.Read openid email",
    });
    expect(new URL(outlook("contoso.onmicrosoft.com").authorizeUrl("s", "https://app.vn/cb")).pathname).toBe("/contoso.onmicrosoft.com/oauth2/v2.0/authorize");
  });

  it("đổi code → token + email (mail, không có thì userPrincipalName); refresh xoay vòng token; invalid_grant → MailAuthError", async () => {
    let me: Record<string, unknown> = { mail: "chungtu@anphat.vn", userPrincipalName: "upn@anphat.onmicrosoft.com" };
    stubFetch((url, init) => {
      if (url.href === "https://login.microsoftonline.com/common/oauth2/v2.0/token") {
        const form = new URLSearchParams(String(init?.body));
        if (form.get("grant_type") === "refresh_token") return form.get("refresh_token") === "revoked" ? json({ error: "invalid_grant" }, 400) : json({ access_token: "at2", refresh_token: "rt2", expires_in: 3600 });
        return json({ access_token: "at1", refresh_token: "rt1", expires_in: 3600 });
      }
      if (url.pathname === "/v1.0/me") return json(me);
      return json({}, 404);
    });
    const o = outlook();
    expect(await o.exchangeCode("c", "https://app.vn/cb")).toEqual({ email: "chungtu@anphat.vn", tokens: { accessToken: "at1", refreshToken: "rt1", expiresAt: "2026-10-22T04:00:00.000Z" } });
    me = { mail: null, userPrincipalName: "upn@anphat.onmicrosoft.com" };
    expect((await o.exchangeCode("c", "https://app.vn/cb")).email).toBe("upn@anphat.onmicrosoft.com");
    expect(await o.refresh(tokens)).toMatchObject({ accessToken: "at2", refreshToken: "rt2" });
    await expect(o.refresh({ ...tokens, refreshToken: "revoked" })).rejects.toBeInstanceOf(MailAuthError);
  });

  it("lấy email: lọc theo mốc + có file, theo nextLink, bỏ file nhúng / không phải file, lọc từ khóa, cắt theo limit", async () => {
    const calls = stubFetch((url) => {
      if (url.searchParams.get("$skiptoken") === "p2")
        return json({ value: [gm("m4", "2026-10-21T09:00:00Z", "Debit note T10", [file("a5", "DN-10.pdf")]), gm("m5", "2026-10-21T10:00:00Z", "Invoice 2", [file("a6", "x.pdf")])] });
      return json({
        value: [
          gm("m1", "2026-10-20T08:00:00Z", "Fw: hàng về", [file("a1", "HOA-DON-GTGT.pdf"), file("img", "image001.png", { isInline: true })]),
          gm("m2", "2026-10-20T09:00:00Z", "Mời họp giao ban", [file("a2", "lich-hop.pdf")], "Lịch họp tuần"),
          gm("m3", "2026-10-21T08:00:00Z", "Bộ chứng từ", [{ "@odata.type": "#microsoft.graph.itemAttachment", id: "a3", name: "Fwd mail" }]),
        ],
        "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/messages?$skiptoken=p2",
      });
    });
    const list = await outlook().listMessages(tokens, new Date("2026-10-20T00:00:00.000Z"), 2);
    expect(list.map((m) => m.id)).toEqual(["m1", "m4"]);
    expect(list[0]).toMatchObject({ fromName: "Sao Viet Ops", fromEmail: "ops@saoviet.vn", receivedAt: new Date("2026-10-20T08:00:00Z"), attachments: [{ id: "a1", fileName: "HOA-DON-GTGT.pdf", mime: "application/pdf", size: 2048 }] });
    const first = calls[0]!.url;
    expect(first.pathname).toBe("/v1.0/me/messages");
    expect(first.searchParams.get("$filter")).toBe("receivedDateTime ge 2026-10-20T00:00:00Z and hasAttachments eq true");
    expect(first.searchParams.get("$orderby")).toBe("receivedDateTime asc");
    expect(first.searchParams.get("$expand")).toBe("attachments($select=id,name,contentType,size,isInline)");
    expect(calls[0]!.init?.headers).toMatchObject({ authorization: "Bearer at" });
    expect(calls).toHaveLength(2);
  });

  it("tải file: contentBytes base64; 401 → MailAuthError", async () => {
    stubFetch((url) => (url.pathname === "/v1.0/me/messages/m1/attachments/a1" ? json({ contentBytes: Buffer.from("%PDF-1.7").toString("base64") }) : json({}, 401)));
    expect((await outlook().getAttachment(tokens, "m1", "a1")).toString()).toBe("%PDF-1.7");
    await expect(outlook().getAttachment(tokens, "m1", "zz")).rejects.toBeInstanceOf(MailAuthError);
  });
});
